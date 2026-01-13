// ChatInterface - Complete chat interface with RAG

import { useState, useEffect, useRef } from 'preact/hooks';
import { MessageSquare, Sparkles, AlertCircle } from 'lucide-preact';
import { Message } from './Message';
import { ChatInput } from './ChatInput';
import { WebSearchProgress } from './WebSearchProgress';
import { UrlConfirmationModal } from './UrlConfirmationModal';
import { Card } from '../ui/Card';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import { conversationsStore, modelsReady, hasReadyDocuments, canvasStore, canvasSignal } from '@/lib/stores';
import { i18nStore, languageSignal } from '@/lib/stores/i18n';
import type { Message as MessageType } from '@/types';
import { completeRAGFlow } from '@/lib/rag/rag-pipeline';
import EngineManager from '@/lib/ai/engine-manager';
import { addMessage, getOrCreateConversation, getConversation, generateTitle, updateConversationTitle } from '@/lib/db/conversations';
import { getRAGSettings, getWebSearchSettings } from '@/lib/db/settings';
import { WebRAGOrchestrator } from '@/lib/web-search';
import type { WebSearchStep } from '@/lib/web-search/types';
import { generateUUID } from '@/lib/utils';
import { speechService, isVoiceModeEnabled } from '@/lib/voice/speech-service';

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
  
  // State for URL confirmation modal
  const [pendingUrls, setPendingUrls] = useState<string[] | null>(null);
  const [confirmationResolver, setConfirmationResolver] = useState<((urls: string[] | null) => void) | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Audio streaming state management
  const streamingState = useRef<{
    startTime: number;
    spokenIndex: number;
    timer: any;
    buffer: string;
    isStreamingAudio: boolean;
  }>({
    startTime: 0,
    spokenIndex: 0,
    timer: null,
    buffer: '',
    isStreamingAudio: false
  });

  const startAudioStreaming = () => {
    // Reset state
    if (streamingState.current.timer) clearTimeout(streamingState.current.timer);
    
    streamingState.current = {
      startTime: Date.now(),
      spokenIndex: 0,
      buffer: '',
      isStreamingAudio: false,
      timer: setTimeout(() => {
        streamingState.current.isStreamingAudio = true;
        // Speak what we have so far if 4s passed
        const { buffer, spokenIndex } = streamingState.current;
        if (buffer.length > spokenIndex && isVoiceModeEnabled.value) {
           const textToSpeak = buffer.substring(spokenIndex);
           speechService.speakFragment(textToSpeak, false);
           streamingState.current.spokenIndex = buffer.length;
        }
      }, 4000)
    };
  };

  const processAudioChunk = (chunk: string) => {
    streamingState.current.buffer += chunk;
    
    if (streamingState.current.isStreamingAudio && isVoiceModeEnabled.value) {
       const { buffer, spokenIndex } = streamingState.current;
       const newText = buffer.substring(spokenIndex);
       
       // Check for sentence boundary: . ? ! followed by whitespace
       const sentenceEndRegex = /[.?!]\s/g;
       let lastMatch = null;
       let match;
       while ((match = sentenceEndRegex.exec(newText)) !== null) {
          lastMatch = match;
       }
       
       if (lastMatch) {
          const cutIndex = lastMatch.index + 1; // Include punctuation
          const textChunk = newText.substring(0, cutIndex);
          if (textChunk.trim()) {
             speechService.speakFragment(textChunk, false);
             streamingState.current.spokenIndex += textChunk.length;
          }
       }
    }
  };
  
  const finishAudioStreaming = (fullText: string) => {
    if (streamingState.current.timer) clearTimeout(streamingState.current.timer);
    
    if (isVoiceModeEnabled.value) {
      if (streamingState.current.isStreamingAudio) {
         // We were streaming, speak the rest
         const remaining = streamingState.current.buffer.substring(streamingState.current.spokenIndex);
         if (remaining.trim()) {
            speechService.speakFragment(remaining, true);
         } else {
            speechService.speakFragment('', true);
         }
      } else {
         // Fast response (< 4s), speak normally
         speechService.speak(fullText);
      }
    }
    
    streamingState.current.isStreamingAudio = false;
  };
  
  // Subscribe to language changes
  const lang = languageSignal.value;

  // Load web search settings on mount
  useEffect(() => {
    getWebSearchSettings().then(settings => {
      setWebSearchEnabled(settings.enableWebSearch);
    });
    
    // Cleanup speech on unmount
    return () => {
      speechService.stopSpeaking();
    };
  }, []);

  /**
   * Handle opening a message in the canvas editor
   */
  function handleOpenInCanvas(content: string) {
    const htmlContent = markdownToHTML(content);
    canvasStore.open(htmlContent);
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
      'redacta',
      'modifica',
      'actualiza',
      'cambia',
      'edita'
    ];

    // Check if message contains document-related keywords
    const hasKeyword = keywords.some(keyword => lowerMessage.includes(keyword));

    // Additional check: message is longer than 30 chars and starts with common verbs
    const startsWithVerb = /^(genera|crea|escribe|redacta|modifica|actualiza|cambia|edita)/i.test(message);
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
      alert(i18nStore.t('chat.loadModelsFirst'));
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
      alert(i18nStore.t('chat.noDocumentsLoaded'));
      return;
    }

    // Add user message to UI
    const userMessage: MessageType = {
      id: generateUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);

    // ============================================================
    // CONVERSATION MANAGEMENT & PERSISTENCE (Start)
    // ============================================================
    // Ensure conversation exists and save user message immediately
    let conversationId = conversationsStore.activeId;
    let isNewConversation = false;

    if (!conversationId) {
      const conversation = await getOrCreateConversation();
      conversationId = conversation.id;
      isNewConversation = true;
      // Add to store (empty for now)
      conversationsStore.add(conversation);
    }

    // Save user message to DB
    await addMessage(conversationId, userMessage);

    // If new conversation, generate title and activate
    if (isNewConversation) {
      const title = generateTitle(content);
      await updateConversationTitle(conversationId, title);
      
      // Update store with the new message and title
      const updatedConv = await getConversation(conversationId);
      if (updatedConv) {
        conversationsStore.update(conversationId, updatedConv);
        // Activate ONLY after store is updated to avoid wiping UI
        conversationsStore.setActive(conversationId);
      }
    } else {
      // Existing conversation: just sync store
      const updatedConv = await getConversation(conversationId);
      if (updatedConv) {
        conversationsStore.update(conversationId, updatedConv);
      }
    }
    // ============================================================
    // CONVERSATION MANAGEMENT & PERSISTENCE (End)
    // ============================================================

    setIsGenerating(true);
    setCurrentResponse('');
    setWebSearchProgress(null);
    
    // Start tracking for delayed TTS
    startAudioStreaming();

    try {
      // Get engines
      const embeddingEngine = await EngineManager.getEmbeddingEngine();
      const chatEngine = await EngineManager.getChatEngine();

      // ============================================================
      // PREPARE CANVAS CONTEXT (Shared across modes)
      // ============================================================
      let canvasContextString = '';
      const currentCanvasContent = canvasSignal.value.content;
      const isCanvasOpen = canvasSignal.value.isOpen;

      console.log('🔍 Debug Canvas State:', { 
        isOpen: isCanvasOpen, 
        contentLength: currentCanvasContent?.length,
        preview: currentCanvasContent?.substring(0, 50) 
      });

      if (isCanvasOpen && currentCanvasContent && currentCanvasContent.trim() !== '' && currentCanvasContent !== '<p><br></p>') {
        // Strip HTML tags for context
        const canvasText = currentCanvasContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        
        console.log('📄 Canvas Text Extracted:', canvasText.substring(0, 50));

        if (canvasText.length > 0) {
          canvasContextString = `
=== HERRAMIENTA DE EDICIÓN ACTIVA ===
El usuario tiene abierto un documento en el panel lateral. Tú tienes acceso total de LECTURA y ESCRITURA a este documento.

CONTENIDO ACTUAL DEL DOCUMENTO:
"""
${canvasText.substring(0, 3000)}${canvasText.length > 3000 ? '...' : ''}
"""

INSTRUCCIONES DE EDICIÓN:
1. Si el usuario pide "reescribir", "modificar", "cambiar" o "corregir" el documento, tu respuesta DEBE contener el texto completo revisado.
2. NO uses resúmenes ni placeholders como "[resto del texto]" o "[...]".
3. NO digas que no puedes leerlo. El contenido está arriba.
4. Responde directamente con el nuevo contenido si se solicita una reescritura, o con comentarios si se solicitan sugerencias.
=====================================`;
          console.log('✅ Canvas context prepared with explicit instructions');
        } else {
           console.warn('⚠️ Canvas text is empty after stripping HTML');
        }
      } else {
         console.log('ℹ️ Canvas context skipped (closed or empty)');
      }

      let assistantMessage: MessageType;

      if (effectiveMode === 'web') {
        // ... (web mode implementation remains the same)
        // Note: Web mode might also benefit from canvas context, but focusing on local/conv first.
        // ============================================================
        // WEB SEARCH MODE
        // ============================================================
        const webSearchSettings = await getWebSearchSettings();

        // Create orchestrator with extension support
        const orchestrator = await WebRAGOrchestrator.create(
          chatEngine,
          embeddingEngine
        );

        // Create temporary assistant message for streaming
        const tempAssistantId = generateUUID();
        let streamedContent = '';

        const tempMessage: MessageType = {
          id: tempAssistantId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          model: 'webllm',
          streaming: true,
        };

        // Add temp message to show streaming progress
        setMessages(prev => [...prev, tempMessage]);

        // Perform web search + RAG with streaming
        const webResult = await orchestrator.search(content, {
          sources: webSearchSettings.webSearchSources,
          maxUrlsToFetch: webSearchSettings.webSearchMaxUrls,
          topK: 10, // Aumentado a 10 para mejor contexto (chunks de ~600 chars = ~6000 chars total)
          confirmUrls: webSearchSettings.webSearchConfirmUrls,
          onConfirmationRequest: async (urls) => {
            return new Promise<string[] | null>((resolve) => {
              setPendingUrls(urls);
              // Store the resolve function to be called by the modal
              // Note: We use a function that returns the resolver to avoid React state updater confusion
              setConfirmationResolver(() => (selectedUrls: string[] | null) => {
                resolve(selectedUrls);
                setPendingUrls(null);
                setConfirmationResolver(null);
              });
            });
          },
          onProgress: (step, progress, message) => {
            setWebSearchProgress({ step, progress, message });
          },
          onToken: (token: string) => {
            streamedContent += token;
            processAudioChunk(token);
            // Update the streaming message
            setMessages(prev =>
              prev.map(msg =>
                msg.id === tempAssistantId
                  ? { ...msg, content: streamedContent }
                  : msg
              )
            );
          }
        });

        // Update with final message including sources
        assistantMessage = {
          id: tempAssistantId,
          role: 'assistant',
          content: webResult.answer,
          timestamp: Date.now(),
          model: 'webllm',
          streaming: false,
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

        // Update the message with final content and sources
        setMessages(prev =>
          prev.map(msg =>
            msg.id === tempAssistantId
              ? assistantMessage
              : msg
          )
        );

        // Auto-speak if enabled
        if (isVoiceModeEnabled.value) {
          speechService.speak(webResult.answer);
        }

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
            processAudioChunk(chunk);
            setCurrentResponse(streamedText);
          },
          {
            additionalContext: canvasContextString // Pass canvas context here
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

        // Auto-speak if enabled
        finishAudioStreaming(answer);

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

        // Build structured messages for the engine
        const chatMessages: { role: string; content: string }[] = [];

        // 1. System Prompt
        let systemContent = 'Eres un asistente útil y conversacional. Responde de manera natural y coherente basándote en el contexto de la conversación.';

        // Append canvas context if available
        if (canvasContextString) {
          systemContent += `\n\n${canvasContextString}`;
        }

        chatMessages.push({
          role: 'system',
          content: systemContent
        });

        // 3. Conversation History (including current message)
        chatMessages.push(...conversationHistory);

        console.log('📝 Conversation history length:', conversationHistory.length, 'messages');

        // Generate direct response with streaming
        let streamedText = '';
        
        // Use the new structured messages API
        const answer = await chatEngine.generateText(chatMessages, {
          temperature: 0.7,
          maxTokens: 2048,
          // Stop tokens are handled by the engine's template logic, but we keep some just in case
          stop: ['<|im_end|>', '<|end|>', '<|eot_id|>'], 
          onStream: (chunk) => {
            streamedText += chunk;
            processAudioChunk(chunk);
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

        // Auto-speak if enabled
        finishAudioStreaming(answer);
      }

      // Only add message if it wasn't already added (web mode adds it during streaming)
      if (effectiveMode !== 'web') {
        setMessages(prev => [...prev, assistantMessage]);
      }
      setCurrentResponse('');
      setWebSearchProgress(null);

      // Check if this was a document generation request
      // We check if the user asked to generate OR modify if canvas is open
      const isDocGenRequest = isDocumentGenerationRequest(content);
      const shouldUpdateCanvas = isDocGenRequest || (canvasSignal.value.isOpen && isDocGenRequest);

      console.log('🔍 Checking if document generation/update:', {
        userMessage: content,
        isDocGen: isDocGenRequest,
        canvasOpen: canvasSignal.value.isOpen
      });

      if (shouldUpdateCanvas) {
        console.log('📄 Document generation detected - updating editor');
        console.log('📝 Assistant response length:', assistantMessage.content.length);

        // Convert answer to HTML format for Quill
        const htmlContent = markdownToHTML(assistantMessage.content);
        console.log('🔄 HTML content generated:', htmlContent.substring(0, 100) + '...');

        // Update global store
        canvasStore.open(htmlContent);

        console.log('✅ Canvas updated');
      }

      // Save to conversation
      // Note: conversationId is already defined at start of function

      await addMessage(conversationId, assistantMessage);

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
      {/* Messages Area with Internal Scroll */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {messages.length === 0 ? (
            <div className="h-[calc(100vh-12rem)] flex items-center justify-center">
              <div className="text-center max-w-md space-y-4">
                <div className="w-16 h-16 mx-auto flex items-center justify-center">
                  <img src="/inledai.svg" alt="InLed AI" width={64} height={64} />
                </div>
                <h3 className="text-2xl font-semibold">{i18nStore.t('chat.welcome')}</h3>
                <p className="text-sm text-[var(--color-text-secondary)]">
                 {i18nStore.t('chat.privacyNotice')}
                </p>

                {!canChat && (
                  <div className="mt-6 p-4 bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20 rounded-lg text-left">
                    <div className="flex gap-2">
                      <AlertCircle size={16} className="text-[var(--color-warning)] flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-[var(--color-text-secondary)]">
                        <p className="font-medium text-[var(--color-warning)] mb-1">{i18nStore.t('chat.stepsRequired')}</p>
                        <ul className="list-disc list-inside space-y-1">
                          {!modelsReady.value && <li>Cargar los modelos de IA pulsando en <strong>{i18nStore.t('chat.configureModels')}</strong></li>}
                          {!hasReadyDocuments.value && <li>Sube y procesa al menos un documento pulsando en <strong>{i18nStore.t('chat.uploadDocs')}</strong></li>}
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

      {/* URL Confirmation Modal */}
      {pendingUrls && confirmationResolver && (
        <UrlConfirmationModal
          urls={pendingUrls}
          onConfirm={(selectedUrls) => confirmationResolver(selectedUrls)}
          onCancel={() => confirmationResolver(null)}
        />
      )}

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
                ? i18nStore.t('chat.placeholderNoModel')
                : i18nStore.t('chat.placeholder')
            }
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {i18nStore.t('chat.footerPrivacy')}
            </p>
            {/* Temporary test button */}
            <button
              onClick={() => {
                console.log('🧪 Test button clicked');
                canvasStore.open('<h1>Documento de Prueba</h1><p>Este es un documento de prueba generado automáticamente.</p>');
                console.log('canvasStore updated');
              }}
              className="text-xs text-blue-500 hover:text-blue-600 underline"
            >
              {i18nStore.t('chat.testCanvas')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
