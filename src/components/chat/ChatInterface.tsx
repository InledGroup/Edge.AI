// ChatInterface - Complete chat interface with RAG

import { useState, useEffect, useRef } from 'preact/hooks';
import { MessageSquare, Sparkles, AlertCircle } from 'lucide-preact';
import { Message } from './Message';
import { ChatInput } from './ChatInput';
import { WebSearchProgress } from './WebSearchProgress';
import { DocumentCanvas } from '../DocumentCanvas';
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
import { generateUUID } from '@/lib/utils';

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
  const [showDocumentCanvas, setShowDocumentCanvas] = useState(false);
  const [documentContent, setDocumentContent] = useState('');
  const [canvasContent, setCanvasContent] = useState(''); // Track current canvas content
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load web search settings on mount
  useEffect(() => {
    getWebSearchSettings().then(settings => {
      setWebSearchEnabled(settings.enableWebSearch);
    });
  }, []);

  /**
   * Handle opening a message in the canvas editor
   */
  function handleOpenInCanvas(content: string) {
    const htmlContent = markdownToHTML(content);
    setDocumentContent(htmlContent);
    setShowDocumentCanvas(true);
  }

  /**
   * Convert simple markdown to HTML for Quill
   */
  function markdownToHTML(markdown: string): string {
    let html = markdown;

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    // Lists
    html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
    html = html.replace(/^- (.+)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Line breaks to paragraphs
    const lines = html.split('\n');
    html = lines
      .map(line => {
        line = line.trim();
        if (line === '') return '';
        if (line.startsWith('<h') || line.startsWith('<ul') || line.startsWith('<li')) {
          return line;
        }
        return `<p>${line}</p>`;
      })
      .join('');

    return html;
  }

  /**
   * Detect if the user is asking to generate a document
   */
  function isDocumentGenerationRequest(message: string): boolean {
    const lowerMessage = message.toLowerCase().trim();

    const keywords = [
      'genera un documento',
      'crea un documento',
      'escribe un documento',
      'redacta un documento',
      'genera un artículo',
      'crea un artículo',
      'escribe un artículo',
      'redacta un artículo',
      'genera un informe',
      'crea un informe',
      'genera un ensayo',
      'crea un ensayo',
      'genera un reporte',
      'crea un reporte',
      'genera una carta',
      'crea una carta',
      'genera un email',
      'crea un email',
      'genera email',
      'crea email',
      'escribe sobre',
      'redacta sobre',
      'genera',
      'crea',
      'escribe',
      'redacta'
    ];

    // Check if message contains document-related keywords
    const hasKeyword = keywords.some(keyword => lowerMessage.includes(keyword));

    // Additional check: message is longer than 30 chars and starts with common verbs
    const startsWithVerb = /^(genera|crea|escribe|redacta)/i.test(message);
    const isLongEnough = message.length > 30;

    console.log('🔎 Document detection:', {
      message: message.substring(0, 50),
      hasKeyword,
      startsWithVerb,
      isLongEnough,
      result: hasKeyword && (startsWithVerb || isLongEnough)
    });

    return hasKeyword && (startsWithVerb || isLongEnough);
  }

  /**
   * Smart mode decision function
   * Uses the AI model to decide whether to use web search, local RAG, or direct answer
   */
  async function decideStrategy(userQuestion: string): Promise<boolean> {
    try {
      const chatEngine = await EngineManager.getChatEngine();

      // Build decision prompt
      const hasDocuments = hasReadyDocuments.value;
      const decisionPrompt = `Eres un asistente inteligente que debe decidir la mejor estrategia para responder una pregunta.

CONTEXTO:
- Documentos locales disponibles: ${hasDocuments ? 'SÍ' : 'NO'}
- Búsqueda web disponible: SÍ

PREGUNTA DEL USUARIO:
"${userQuestion}"

INSTRUCCIONES:
Analiza la pregunta y decide la mejor estrategia. Responde ÚNICAMENTE con una de estas opciones:

1. "WEB" - Si la pregunta requiere información actualizada, noticias, eventos recientes, datos en tiempo real, o información que probablemente no esté en documentos locales.

2. "LOCAL" - Si la pregunta se puede responder con los documentos locales${!hasDocuments ? ' (pero NO HAY documentos disponibles, así que esta opción NO es válida)' : ''}, especialmente si es sobre contenido específico de los documentos.

3. "DIRECT" - Si la pregunta es general, sobre conocimiento común, conceptos básicos, o puede responderse sin necesidad de buscar información específica.

RESPONDE SOLO CON: WEB, LOCAL o DIRECT`;

      console.log('🤔 Asking AI to decide strategy...');

      const decision = await chatEngine.generateText(decisionPrompt, {
        temperature: 0.1, // Low temperature for more deterministic decisions
        maxTokens: 10,
      });

      const cleanDecision = decision.trim().toUpperCase();
      console.log(`🧠 AI raw decision: "${cleanDecision}"`);

      // Parse decision
      if (cleanDecision.includes('WEB')) {
        return true; // Use web search
      } else if (cleanDecision.includes('LOCAL') && hasDocuments) {
        return false; // Use local RAG
      } else {
        // DIRECT or fallback
        return false; // Answer directly without search
      }
    } catch (error) {
      console.error('❌ Failed to decide strategy, defaulting to local RAG:', error);
      return false;
    }
  }

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

  async function handleSendMessage(content: string, mode: 'web' | 'local' | 'smart' | 'conversation') {
    // Verification check if models are ready
    if (!modelsReady.value) {
      alert('Debes cargar los modelos de IA antes de chatear');
      return;
    }

    // Determine which mode to use
    let effectiveMode: 'web' | 'local' | 'conversation' = mode as any;

    if (mode === 'smart') {
      // SMART MODE: Let AI decide the strategy
      console.log('🧠 Smart mode activated - AI will decide the strategy');
      const useWeb = await decideStrategy(content);
      effectiveMode = useWeb ? 'web' : hasReadyDocuments.value ? 'local' : 'conversation';
      console.log(`🎯 AI decision: ${effectiveMode}`);
    }

    // Validate based on mode
    if (effectiveMode === 'local' && !hasReadyDocuments.value) {
      alert('No hay documentos cargados. Usa otro modo o sube documentos.');
      return;
    }

    // Add user message
    const userMessage: MessageType = {
      id: generateUUID(),
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

      if (effectiveMode === 'web') {
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
          topK: 10, // Aumentado a 10 para mejor contexto (chunks de ~600 chars = ~6000 chars total)
          onProgress: (step, progress, message) => {
            setWebSearchProgress({ step, progress, message });
          }
        });

        // Create assistant message with web sources
        assistantMessage = {
          id: generateUUID(),
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

      } else if (effectiveMode === 'local') {
        // ============================================================
        // LOCAL RAG MODE (with documents)
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
          id: generateUUID(),
          role: 'assistant',
          content: answer,
          timestamp: Date.now(),
          sources: ragResult.chunks,
          model: 'webllm'
        };
      } else {
        // ============================================================
        // CONVERSATION MODE (no documents, no web search)
        // Pure conversational mode
        // ============================================================
        console.log('💬 Conversation mode - pure chat without RAG or web search');

        // Prepare conversation history INCLUDING current user message
        // Take last 10 messages for better context (5 exchanges)
        const conversationHistory = [...messages.slice(-10), userMessage].map(msg => ({
          role: msg.role,
          content: msg.content
        }));

        // Build chat prompt with full conversation context
        let prompt = 'Eres un asistente útil y conversacional. Responde de manera natural y coherente basándote en el contexto de la conversación.\n\n';

        // Include canvas content if available
        if (canvasContent && canvasContent.trim() !== '' && canvasContent !== '<p><br></p>') {
          // Strip HTML tags for context
          const canvasText = canvasContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          if (canvasText.length > 0) {
            prompt += `CONTEXTO: El usuario está trabajando en un documento que contiene:\n"${canvasText.substring(0, 1000)}${canvasText.length > 1000 ? '...' : ''}"\n\n`;
            console.log('📄 Incluyendo contenido del canvas en el contexto');
          }
        }

        // Add conversation history
        prompt += conversationHistory
          .map(msg => `${msg.role === 'user' ? 'Usuario' : 'Asistente'}: ${msg.content}`)
          .join('\n\n');

        prompt += '\n\nAsistente:';

        console.log('📝 Conversation history length:', conversationHistory.length, 'messages');

        // Generate direct response with streaming
        let streamedText = '';
        const answer = await chatEngine.generateText(prompt, {
          temperature: 0.7,
          maxTokens: 2048, // Increased for longer responses
          onStream: (chunk) => {
            streamedText += chunk;
            setCurrentResponse(streamedText);
          }
        });

        // Create assistant message without sources
        assistantMessage = {
          id: generateUUID(),
          role: 'assistant',
          content: answer,
          timestamp: Date.now(),
          model: 'webllm'
        };
      }

      setMessages(prev => [...prev, assistantMessage]);
      setCurrentResponse('');
      setWebSearchProgress(null);

      // Check if this was a document generation request
      const isDocGenRequest = isDocumentGenerationRequest(content);
      console.log('🔍 Checking if document generation:', {
        userMessage: content,
        isDocGen: isDocGenRequest
      });

      if (isDocGenRequest) {
        console.log('📄 Document generation detected - opening editor');
        console.log('📝 Assistant response length:', assistantMessage.content.length);

        // Convert answer to HTML format for Quill
        const htmlContent = markdownToHTML(assistantMessage.content);
        console.log('🔄 HTML content generated:', htmlContent.substring(0, 100) + '...');

        setDocumentContent(htmlContent);
        setShowDocumentCanvas(true);

        console.log('✅ Canvas state updated - should show now');
      }

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
        id: generateUUID(),
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
      {/* Document Canvas Modal */}
      {showDocumentCanvas && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl h-[90vh] bg-[var(--color-bg)] rounded-lg shadow-2xl overflow-hidden">
            <DocumentCanvas
              initialContent={documentContent}
              onClose={() => setShowDocumentCanvas(false)}
              onContentChange={(content) => setCanvasContent(content)}
            />
          </div>
        </div>
      )}

      {/* Messages Area with Internal Scroll */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {messages.length === 0 ? (
            <div className="h-[calc(100vh-12rem)] flex items-center justify-center">
              <div className="text-center max-w-md space-y-4">
                <div className="w-16 h-16 mx-auto flex items-center justify-center">
                  <img src="/inledai.svg" alt="InLed AI" width={64} height={64} />
                </div>
                <h3 className="text-2xl font-semibold">Hola, ¿en qué puedo ayudarte?</h3>
                <p className="text-sm text-[var(--color-text-secondary)]">
                 Todo lo que hablemos, subas o busque no sale de tu ordenador.
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
                <Message
                  key={message.id}
                  message={message}
                  onOpenInCanvas={handleOpenInCanvas}
                />
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
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Edge.AI procesa todo localmente. Tus datos nunca salen del navegador.
            </p>
            {/* Temporary test button */}
            <button
              onClick={() => {
                console.log('🧪 Test button clicked');
                setDocumentContent('<h1>Documento de Prueba</h1><p>Este es un documento de prueba generado automáticamente.</p>');
                setShowDocumentCanvas(true);
                console.log('showDocumentCanvas:', showDocumentCanvas);
              }}
              className="text-xs text-blue-500 hover:text-blue-600 underline"
            >
              Probar Canvas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
