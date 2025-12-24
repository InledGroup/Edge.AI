// ChatInterface - Complete chat interface with RAG

import { useState, useEffect, useRef } from 'preact/hooks';
import { MessageSquare, Sparkles, AlertCircle } from 'lucide-preact';
import { Message } from './Message';
import { ChatInput } from './ChatInput';
import { WebSearchProgress } from './WebSearchProgress';
import { Card } from '../ui/Card';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import { conversationsStore, modelsReady, hasReadyDocuments } from '@/lib/stores';
import type { Message as MessageType } from '@/types';
import { completeRAGFlow } from '@/lib/rag/rag-pipeline';
import EngineManager from '@/lib/ai/engine-manager';
import { addMessage, getOrCreateConversation } from '@/lib/db/conversations';
import { getRAGSettings, getWebSearchSettings } from '@/lib/db/settings';
import { WebRAGOrchestrator } from '@/lib/web-search';
import type { WebSearchStep } from '@/lib/web-search/types';

export function ChatInterface() {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [webSearchProgress, setWebSearchProgress] = useState<{
    step: WebSearchStep;
    progress: number;
    message?: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load web search settings on mount
  useEffect(() => {
    getWebSearchSettings().then(settings => {
      setWebSearchEnabled(settings.enableWebSearch);
    });
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentResponse]);

  // Load conversation messages when switching conversations
  useEffect(() => {
    const activeId = conversationsStore.activeId;
    if (activeId) {
      const conversation = conversationsStore.active;
      if (conversation) {
        setMessages(conversation.messages || []);
      }
    } else {
      setMessages([]);
    }
  }, [conversationsStore.activeId]);

  async function handleSendMessage(content: string, useWebSearch = false) {
    // Para web search solo necesitamos modelos, no documentos
    if (!modelsReady.value) {
      alert('Debes cargar los modelos de IA antes de chatear');
      return;
    }

    // Para RAG local necesitamos documentos
    if (!useWebSearch && !hasReadyDocuments.value) {
      alert('Debes tener documentos listos o activar la búsqueda web');
      return;
    }

    // Add user message
    const userMessage: MessageType = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsGenerating(true);
    setCurrentResponse('');
    setWebSearchProgress(null);

    try {
      // Get engines
      const embeddingEngine = await EngineManager.getEmbeddingEngine();
      const chatEngine = await EngineManager.getChatEngine();

      let assistantMessage: MessageType;

      if (useWebSearch) {
        // ============================================================
        // WEB SEARCH MODE
        // ============================================================
        const webSearchSettings = await getWebSearchSettings();

        // Create orchestrator
        const orchestrator = new WebRAGOrchestrator(
          chatEngine,
          embeddingEngine
        );

        // Perform web search + RAG
        const webResult = await orchestrator.search(content, {
          sources: webSearchSettings.webSearchSources,
          maxUrlsToFetch: webSearchSettings.webSearchMaxUrls,
          topK: 3, // Reducido para evitar exceder el contexto de 4096 tokens
          onProgress: (step, progress, message) => {
            setWebSearchProgress({ step, progress, message });
          }
        });

        // Create assistant message with web sources
        assistantMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: webResult.answer,
          timestamp: Date.now(),
          model: 'webllm',
          metadata: {
            webSources: webResult.cleanedContents.map(c => ({
              title: c.title,
              url: c.url,
              wordCount: c.wordCount
            })),
            searchQuery: webResult.searchQuery,
            totalTime: webResult.metadata.totalTime
          }
        } as any;

      } else {
        // ============================================================
        // LOCAL RAG MODE
        // ============================================================
        const settings = await getRAGSettings();

        // Prepare conversation history
        const conversationHistory = messages.slice(-5).map(msg => ({
          role: msg.role,
          content: msg.content
        }));

        // Perform RAG flow with streaming
        let streamedText = '';
        const { answer, ragResult } = await completeRAGFlow(
          content,
          embeddingEngine,
          chatEngine,
          settings.topK,
          undefined,
          conversationHistory,
          (chunk) => {
            streamedText += chunk;
            setCurrentResponse(streamedText);
          }
        );

        // Create assistant message with local sources
        assistantMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: answer,
          timestamp: Date.now(),
          sources: ragResult.chunks,
          model: 'webllm'
        };
      }

      setMessages(prev => [...prev, assistantMessage]);
      setCurrentResponse('');
      setWebSearchProgress(null);

      // Save to conversation
      let conversationId = conversationsStore.activeId;
      let isNewConversation = false;

      if (!conversationId) {
        const conversation = await getOrCreateConversation();
        conversationId = conversation.id;
        conversationsStore.setActive(conversationId);
        conversationsStore.add(conversation);
        isNewConversation = true;
      }

      await addMessage(conversationId, userMessage);
      await addMessage(conversationId, assistantMessage);

      // Reload conversation from DB to sync with store
      const { getConversation, generateTitle, updateConversationTitle } = await import('@/lib/db/conversations');

      // Update conversation title if it's the first message
      if (isNewConversation) {
        const title = generateTitle(content);
        await updateConversationTitle(conversationId, title);
      }

      // Reload and update the conversation in the store
      const updatedConv = await getConversation(conversationId);
      if (updatedConv) {
        conversationsStore.update(conversationId, updatedConv);
      }

    } catch (error) {
      console.error('Failed to generate response:', error);

      const errorMessage: MessageType = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, errorMessage]);
      setCurrentResponse('');
    } finally {
      setIsGenerating(false);
    }
  }

  // Check if ready to chat (con web search solo necesitamos modelos)
  const canChat = modelsReady.value && (hasReadyDocuments.value || webSearchEnabled);

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area with Internal Scroll */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {messages.length === 0 ? (
            <div className="h-[calc(100vh-12rem)] flex items-center justify-center">
              <div className="text-center max-w-md space-y-4">
                <div className="w-16 h-16 mx-auto flex items-center justify-center">
                  <img src="https://hosted.inled.es/inledai.svg" alt="InLed AI" width={64} height={64} />
                </div>
                <h3 className="text-2xl font-semibold">Hola, ¿en qué puedo ayudarte?</h3>
                <p className="text-sm text-[var(--color-text-secondary)]">
                 Comencemos una sesión de conversación mútua
                </p>

                {!canChat && (
                  <div className="mt-6 p-4 bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20 rounded-lg text-left">
                    <div className="flex gap-2">
                      <AlertCircle size={16} className="text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-[var(--color-text-secondary)]">
                        <p className="font-medium text-[var(--color-warning)] mb-1">Debes completar estos pasos para poder comenzar:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {!modelsReady.value && <li>Cargar los modelos de IA pulsando en <strong>configurar modelos</strong></li>}
                          {!hasReadyDocuments.value && <li>Sube y procesa al menos un documento pulsando en <strong>subir documentos</strong></li>}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <Message key={message.id} message={message} />
              ))}

              {/* Streaming response */}
              {isGenerating && currentResponse && (
                <div className="flex gap-3 animate-slideUp">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center shadow-[0_0_15px_rgba(40,229,24,0.3)]">
                    <Sparkles size={18} color="black" className="animate-pulse" />
                  </div>
                  <div className="flex-1 rounded-2xl px-4 py-3 text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)]">
                    <MarkdownRenderer content={currentResponse} className="leading-relaxed" />
                    <span className="inline-block w-1 h-4 bg-[var(--color-primary)] animate-pulse ml-1" />
                  </div>
                </div>
              )}

              {/* Web search progress */}
              {isGenerating && webSearchProgress && (
                <div className="animate-slideUp">
                  <WebSearchProgress
                    step={webSearchProgress.step}
                    progress={webSearchProgress.progress}
                    message={webSearchProgress.message}
                  />
                </div>
              )}

              {/* Typing indicator */}
              {isGenerating && !currentResponse && !webSearchProgress && (
                <div className="flex gap-3 animate-slideUp">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center shadow-[0_0_15px_rgba(40,229,24,0.3)]">
                    <Sparkles size={18} color="black" className="animate-pulse" />
                  </div>
                  <div className="flex items-center gap-1 px-4 py-3 rounded-2xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Fixed Input Area at Bottom */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <ChatInput
            onSend={handleSendMessage}
            disabled={!canChat}
            loading={isGenerating}
            webSearchEnabled={webSearchEnabled}
            placeholder={
              !canChat
                ? 'Carga modelos primero...'
                : 'Envía un mensaje...'
            }
          />
          <p className="text-xs text-center text-[var(--color-text-tertiary)] mt-2">
            Edge.AI procesa todo localmente. Tus datos nunca salen del navegador.
          </p>
        </div>
      </div>
    </div>
  );
}
