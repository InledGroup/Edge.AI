// ChatInterface - Complete chat interface with RAG & Specialized MCP Support

import { useState, useEffect, useRef } from 'preact/hooks';
import { Sparkles, AlertCircle, Server, History, Sliders, X } from 'lucide-preact';
import { Message } from './Message';
import { ChatInput } from './ChatInput';
import { WebSearchProgress } from './WebSearchProgress';
import { UrlConfirmationModal } from './UrlConfirmationModal';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import { conversationsStore, modelsReady, hasReadyDocuments, canvasStore, canvasSignal, modelsStore, generatingTitleIdSignal } from '@/lib/stores';
import { i18nStore } from '@/lib/stores/i18n';
import type { Message as MessageType } from '@/types';
import { completeRAGFlow } from '@/lib/rag/rag-pipeline';
import { AdvancedRAGPipeline } from '@/lib/new-rag';
import EngineManager from '@/lib/ai/engine-manager';
import { WebLLMEngine } from '@/lib/ai/webllm-engine';
import { addMessage, getOrCreateConversation, getConversation, generateTitle, updateConversationTitle, aiGenerateTitle } from '@/lib/db/conversations';
import { getRAGSettings, getWebSearchSettings, getSetting, getUseAdvancedRAG, getGenerationSettings, updateGenerationSettings } from '@/lib/db/settings';
import { getMemories, addMemory } from '@/lib/db/memories';
import { WebRAGOrchestrator } from '@/lib/web-search';
import { generateUUID, cn } from '@/lib/utils';
import { speechService, isVoiceModeEnabled } from '@/lib/voice/speech-service';
import { mcpManager } from '@/lib/ai/mcp-manager';
import { processExtensionIntent, getExtensionsSystemPrompt } from '@/lib/insuite-utils';
import { extensionsStore, extensionsSignal } from '@/lib/stores';
import { getWorkerPool } from '@/lib/workers';

// Helper functions moved out of component
const isDocumentGenerationRequest = (message: string): boolean => {
  const lowerMessage = message.toLowerCase().trim();
  const keywords = ['genera un documento', 'crea un documento', 'escribe un documento', 'redacta un documento', 'genera un informe', 'crea un informe'];
  return keywords.some(keyword => lowerMessage.includes(keyword)) || (message.length > 30 && /^(genera|crea|escribe|redacta)/i.test(message));
};

const markdownToHTML = (md: string) => {
  return md.replace(/^# (.*$)/gim, '<h1>$1</h1>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
};

const builtInApps = [
  { 
    id: 'inlinked', 
    name: 'InLinked', 
    iconUrl: 'https://hosted.inled.es/INLINKED.png', 
    instructions: 'Eres un experto en LinkedIn. Formatea el texto del usuario para maximizar el engagement. Usa negritas y listas. Al final, genera OBLIGATORIAMENTE la URL: https://insuite.inled.es/inlinked/?t=TU_TEXTO&client=edgeai',
    exampleUrl: 'https://insuite.inled.es/inlinked/?t={{text}}&client=edgeai'
  },
  { 
    id: 'inqr', 
    name: 'InQR', 
    iconUrl: 'https://hosted.inled.es/inqr.png', 
    instructions: 'Genera códigos QR. Si es texto o URL usa: https://insuite.inled.es/inqr/?type=text&v=VALOR&generatenow=true&client=edgeai. Si es WiFi usa: https://insuite.inled.es/inqr/?type=wifi&s=SSID&p=PASS&sec=WPA&generatenow=true&client=edgeai',
    exampleUrl: 'https://insuite.inled.es/inqr/?type=text&v={{text}}&generatenow=true&client=edgeai'
  }
];

export function ChatInterface() {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [webSearchProgress, setWebSearchProgress] = useState<{ step: any; progress: number; message?: string } | null>(null);
  const [pendingUrls, setPendingUrls] = useState<string[] | null>(null);
  const [confirmationResolver, setConfirmationResolver] = useState<((urls: string[] | null) => void) | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingState = useRef({ spokenIndex: 0, buffer: '', isStreamingAudio: false, timer: null as any });

  const isModelsReady = modelsReady.value;
  const isHasDocs = hasReadyDocuments.value;
  const canChat = isModelsReady && (isHasDocs || webSearchEnabled);

  const startAudioStreaming = () => {
    if (streamingState.current.timer) clearTimeout(streamingState.current.timer);
    streamingState.current = { spokenIndex: 0, buffer: '', isStreamingAudio: false, timer: setTimeout(() => { streamingState.current.isStreamingAudio = true; }, 4000) };
  };

  const processAudioChunk = (chunk: string) => {
    streamingState.current.buffer += chunk;
    if (streamingState.current.isStreamingAudio && isVoiceModeEnabled.value) {
       const text = streamingState.current.buffer.substring(streamingState.current.spokenIndex);
       const lastPunct = Math.max(text.lastIndexOf('.'), text.lastIndexOf('?'), text.lastIndexOf('!'));
       if (lastPunct !== -1) {
          const toSpeak = text.substring(0, lastPunct + 1);
          speechService.speakFragment(toSpeak, false);
          streamingState.current.spokenIndex += toSpeak.length;
       }
    }
  };
  
  const finishAudioStreaming = (fullText: string) => {
    if (streamingState.current.timer) clearTimeout(streamingState.current.timer);
    if (isVoiceModeEnabled.value) {
      if (streamingState.current.isStreamingAudio) speechService.speakFragment(streamingState.current.buffer.substring(streamingState.current.spokenIndex) || '', true);
      else speechService.speak(fullText);
    }
    streamingState.current.isStreamingAudio = false;
  };
  
  useEffect(() => {
    getWebSearchSettings().then(s => setWebSearchEnabled(s.enableWebSearch));
    return () => speechService.stopSpeaking();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentResponse, webSearchProgress]);

  useEffect(() => {
    const activeId = conversationsStore.activeId;
    if (activeId) {
      const conv = conversationsStore.active;
      if (conv) setMessages(conv.messages || []);
    } else setMessages([]);
  }, [conversationsStore.activeId]);

  const handleOpenInCanvas = (content: string) => {
    canvasStore.open(markdownToHTML(content));
  };

  const handleRegenerate = async (msgId: string) => {
    if (isGenerating) return;

    const msgIndex = messages.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    // Find the associated user message
    let userMsg = null;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userMsg = messages[i];
        break;
      }
    }

    if (!userMsg) return;

    // Remove the assistant message from state
    setMessages(prev => prev.filter(m => m.id !== msgId));
    
    // Re-trigger sending (this will add a new assistant message)
    handleSendMessage(userMsg.content, 'local', userMsg.images);
  };

  async function handleSendMessage(content: string, mode: 'web' | 'local' | 'smart' | 'conversation', images?: string[], activeTool?: { type: 'app' | 'mcp', id: string, name: string } | null) {
    if (!isModelsReady) { alert(i18nStore.t('chat.loadModelsFirst')); return; }

    // Load latest global settings before processing
    const genSettings = await getGenerationSettings();
    const ragSettings = await getRAGSettings();
    const hWeight = genSettings.historyWeight;
    const fThreshold = genSettings.faithfulnessThreshold;
    const cWindow = ragSettings.chunkWindowSize;
    const tK = ragSettings.topK;

    const originalContent = content; 
    let assistantPrompt = content;   
    let effectiveMode = mode;

    // Reset active tool in store if it was used
    if (activeTool) {
      extensionsStore.setActiveTool(null);
    }

    // 1. Detect MCP Trigger (Pill or Slash command or Keyword)
    let mcpTools: any[] = [];
    let activeServerName = '';
    const toolNameMap = new Map<string, string>();

    let serverToUse = (activeTool?.type === 'mcp') ? activeTool.name : null;
    
    if (!serverToUse) {
      const mcpMatch = content.match(/\/(\w+)/);
      serverToUse = mcpMatch ? mcpMatch[1] : null;
    }

    // Auto-detection by keyword if no slash command
    if (!serverToUse) {
      const enabledServers = await mcpManager.getEnabledMCPServers();
      for (const s of enabledServers) {
        if (content.toLowerCase().includes(s.name.toLowerCase())) {
          serverToUse = s.name;
          break;
        }
      }
    }

    if (serverToUse) {
      activeServerName = serverToUse;
      const allTools = await mcpManager.getTools(activeServerName);
      
      if (allTools.length > 0) {
        // --- TOOL RAG: Filter relevant tools ---
        const queryKeywords = content.toLowerCase().split(/\s+/);
        const filteredTools = allTools.filter(t => {
          if (allTools.length <= 5) return true;
          const text = `${t.name} ${t.description}`.toLowerCase();
          return queryKeywords.some(kw => kw.length > 3 && text.includes(kw));
        }).slice(0, 5);

        const finalTools = filteredTools.length > 0 ? filteredTools : allTools.slice(0, 5);

        mcpTools = finalTools.map(t => {
          const modelToolName = `${t.serverName}__${t.name}`.replace(/-/g, '_');
          toolNameMap.set(modelToolName, t.name);
          
          const minifySchema = (schema: any) => {
            if (!schema) return undefined;
            const minified = { ...schema };
            if (minified.properties) {
              for (const key in minified.properties) {
                delete minified.properties[key].title;
                if (minified.properties[key].description) {
                  minified.properties[key].description = minified.properties[key].description.substring(0, 100);
                }
              }
            }
            return minified;
          };

          return {
            type: 'function',
            function: {
              name: modelToolName, 
              description: (t.description || '').substring(0, 150),
              parameters: minifySchema(t.inputSchema || t.parameters)
            }
          };
        });
        if (content.trim() === `/${activeServerName}`) assistantPrompt = `Lista las herramientas de ${activeServerName}`;
        effectiveMode = 'conversation'; 
      }
    }

    const userMessage: MessageType = { 
      id: generateUUID(), 
      role: 'user', 
      content: originalContent, 
      images, 
      timestamp: Date.now(),
      metadata: activeTool ? { 
        appId: activeTool.type === 'app' ? activeTool.id : undefined,
        mcpServerId: activeTool.type === 'mcp' ? activeTool.id : undefined
      } : undefined
    };
    
    // Add user message to state and DB
    setMessages(prev => [...prev, userMessage]);
    
    let conversationId = conversationsStore.activeId;
    let isFirstMessage = false;

    if (!conversationId) {
      const conv = await getOrCreateConversation();
      conversationId = conv.id;
      isFirstMessage = true;
      conversationsStore.add(conv);
    } else {
      const activeConv = conversationsStore.active;
      if (!activeConv || !activeConv.messages || activeConv.messages.length === 0) {
        isFirstMessage = true;
      }
    }

    await addMessage(conversationId, userMessage);

    if (isFirstMessage) {
      const tempTitle = generateTitle(originalContent);
      await updateConversationTitle(conversationId, tempTitle);
      const updatedConv = await getConversation(conversationId);
      if (updatedConv) {
        conversationsStore.update(conversationId, updatedConv);
        conversationsStore.setActive(conversationId);
      }
    } else {
      const updatedConv = await getConversation(conversationId);
      if (updatedConv) conversationsStore.update(conversationId, updatedConv);
    }

    setIsGenerating(true);
    setCurrentResponse('');
    setWebSearchProgress(null);
    startAudioStreaming();

    // Prepare temporary assistant message for streaming
    let assistantId = generateUUID();
    const tempAssistantMsg: MessageType = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true
    };
    setMessages(prev => [...prev, tempAssistantMsg]);

    try {
      const chatEngine = await EngineManager.getChatEngine();
      const chatModelId = modelsStore.chat?.id;
      const memories = await getMemories();
      const memoryContext = memories.length > 0 ? `\n\nRECUERDOS:\n${memories.map(m => `- ${m.content}`).join('\n')}` : '';
      
      let canvasContext = '';
      if (canvasSignal.value.isOpen && canvasSignal.value.content) {
        canvasContext = `\n=== DOCUMENTO ABIERTO ===\n${canvasSignal.value.content.replace(/<[^>]*>/g, ' ').substring(0, 1000)}\n===`;
      }

      let finalContent = '';
      let finalSources: any[] | undefined = undefined;
      let finalMetadata: any = {};

      if (effectiveMode === 'web') {
        const embeddingEngine = await EngineManager.getEmbeddingEngine();
        const orchestrator = await WebRAGOrchestrator.create(chatEngine, embeddingEngine);
        
        const res = await orchestrator.search(originalContent, {
          onToken: (t) => {
            finalContent += t;
            setCurrentResponse(finalContent);
            processAudioChunk(t);
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: finalContent } : m));
          },
          onProgress: (step, progress, message) => {
            setWebSearchProgress({ step, progress, message });
          },
          confirmUrls: true,
          onConfirmationRequest: async (urls) => {
            setPendingUrls(urls);
            return new Promise((resolve) => {
              setConfirmationResolver(() => (confirmedUrls: string[] | null) => {
                setPendingUrls(null);
                setConfirmationResolver(null);
                resolve(confirmedUrls || []);
              });
            });
          }
        });
        finalContent = res.answer;
      } else if (effectiveMode === 'local') {
        const useAdvanced = await getUseAdvancedRAG();
        
        if (useAdvanced) {
          // Use Advanced RAG Worker (Background Thread) to prevent UI freeze
          const pool = getWorkerPool();
          const worker = await pool.getAdvancedRAGWorker();
          
          const ragResult = await worker.execute(assistantPrompt, (progress, message) => {
            setWebSearchProgress({ step: 'searching' as any, progress, message });
          });

          // A-RAG returns the final answer directly from the agent
          if (ragResult.answer) {
            finalContent = ragResult.answer;
            finalSources = ragResult.sources || [];
            
            // Simular streaming para la UI si la respuesta es estática del worker
            let displayed = '';
            const words = finalContent.split(' ');
            for (const word of words) {
              displayed += word + ' ';
              setCurrentResponse(displayed);
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: displayed } : m));
              await new Promise(r => setTimeout(r, 10)); 
            }
          } else {
            finalContent = "El agente de investigación no pudo encontrar una respuesta clara.";
          }
          setWebSearchProgress(null);
        } else {
          // Legacy RAG Flow (Optimized)
          const embeddingEngine = await EngineManager.getEmbeddingEngine();
          let streamedText = '';
          
          // Dynamic history based on weight
          const maxHistory = Math.max(1, Math.round(hWeight * 20));
          const history = messages.slice(-maxHistory).map(m => ({ role: m.role, content: m.content }));

          // 1. Initial RAG Pass
          const result = await completeRAGFlow(assistantPrompt, embeddingEngine, chatEngine, tK, undefined, history, (c) => {
            streamedText += c;
            setCurrentResponse(streamedText);
            processAudioChunk(c);
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: streamedText } : m));
          }, { 
            additionalContext: canvasContext + memoryContext,
            calculateMetrics: true,
            faithfulnessThreshold: fThreshold,
            chunkWindowSize: cWindow
          });

          let finalAnswer = result.answer;
          let finalChunks = result.ragResult.chunks;
          
          // 2. Check for 'Read More' pattern in the response
          const readMoreMatch = finalAnswer.match(/\((.*?)\)\.readmore=(\d+)/);
          if (readMoreMatch) {
            const [_, docName, lines] = readMoreMatch;
            setWebSearchProgress({ step: 'searching' as any, progress: 50, message: `Expandiendo lectura: ${docName}...` });
            
            const allDocs = await import('@/lib/db/documents').then(m => m.getAllDocuments());
            const targetDoc = allDocs.find(d => d.name.toLowerCase().includes(docName.toLowerCase()));
            
            if (targetDoc) {
              const extraK = Math.min(parseInt(lines) || 5, 10);
              const secondResult = await completeRAGFlow(assistantPrompt, embeddingEngine, chatEngine, tK + extraK, [targetDoc.id], history, (c) => {
                streamedText = c;
                setCurrentResponse(streamedText);
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: streamedText } : m));
              }, { 
                additionalContext: `\n\nINFO ADICIONAL DE ${targetDoc.name}:\nEl usuario (via comando) solicitó leer más. Aquí tienes contexto expandido. RE-ESCRIBE tu respuesta integrando estos nuevos datos.`,
                calculateMetrics: true,
                faithfulnessThreshold: fThreshold,
                chunkWindowSize: cWindow
              });
              
              finalAnswer = secondResult.answer;
              finalChunks = secondResult.ragResult.chunks;
            }
            setWebSearchProgress(null);
          }

          finalContent = finalAnswer;
          finalSources = finalChunks;
          
          // Set metadata for UI indicators
          finalMetadata = {
            ragQuality: result.quality?.overall,
            ragMetrics: result.metrics,
            faithfulness: result.faithfulness
          };
        }
      } else {
        // Conversation mode
        const maxHistory = Math.max(1, Math.round(hWeight * 20));
        const history = messages.slice(-maxHistory).map(m => ({ role: m.role, content: m.content }));
        
        let customAppPrompt = '';
        if (activeTool && activeTool.type === 'app') {
          const app = extensionsSignal.value.customApps.find(a => a.id === activeTool.id) || 
                      builtInApps.find(a => a.id === activeTool.id);
          if (app) {
            customAppPrompt = `\n\n=== PRIORIDAD CRÍTICA: APP SELECCIONADA: ${app.name} ===\nInstrucciones específicas: ${app.instructions}\nSolo genera la URL técnica para esta app. IGNORA cualquier otra herramienta.\nURL de ejemplo: ${app.exampleUrl || (app as any).url}`;
          }
        }
        
        const systemPrompt = `Eres un asistente inteligente local. ${canvasContext}${memoryContext}\n${getExtensionsSystemPrompt()}${customAppPrompt}`;
        const chatMsgs = [{ role: 'system', content: systemPrompt }, ...history];
        
        const isMcpIntent = mcpTools.length > 0 || content.match(/\/(notion|weather|google|search)/i);

        if (isMcpIntent && mcpTools.length > 0) {
           const useSpecialized = await getSetting('useSpecializedToolModel');
           const canHandleNative = chatEngine instanceof WebLLMEngine && chatModelId?.includes('8b');
           
           let toolEngine;
           if (useSpecialized && !canHandleNative) {
             if (!EngineManager.isToolEngineReady()) {
               setWebSearchProgress({ step: 'searching', progress: 0, message: 'Descargando modelo de herramientas...' });
               toolEngine = await EngineManager.getToolEngine((progress, msg) => {
                 setWebSearchProgress({ step: 'searching', progress, message: `Descargando: ${msg} (${Math.round(progress)}%)` });
               });
               setWebSearchProgress(null);
             } else {
               toolEngine = await EngineManager.getToolEngine();
             }
           } else {
             toolEngine = chatEngine;
           }
           
           let currentMsgs = [...chatMsgs];
           let loops = 0;
           let lastResContent = '';

           while (loops < 5) {
             let isToolCallDetected = false;
             let loopAccumulated = '';
             const res = await toolEngine.chat(currentMsgs, { 
               tools: mcpTools, 
               onStream: (c) => { 
                 loopAccumulated += c;
                 if (loopAccumulated.includes('{') || loopAccumulated.includes('###')) { 
                   isToolCallDetected = true; 
                   setCurrentResponse(''); 
                 }
                 if (!isToolCallDetected) { 
                   finalContent += c;
                   setCurrentResponse(finalContent);
                   processAudioChunk(c);
                   setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: finalContent } : m));
                 } 
               } 
             });

             if (res.tool_calls && res.tool_calls.length > 0) {
                currentMsgs.push(res);
                const toolCallMsg = { id: generateUUID(), role: 'assistant', content: res.content || '', timestamp: Date.now(), tool_calls: res.tool_calls };
                setMessages(prev => [...prev.filter(m => m.id !== assistantId), toolCallMsg as any]);
                await addMessage(conversationId, toolCallMsg as any);
                
                for (const call of res.tool_calls) {
                   const fakeName = call.function.name;
                   const realName = toolNameMap.get(fakeName) || fakeName;
                   setWebSearchProgress({ step: 'searching' as any, progress: 50, message: `Ejecutando ${realName}...` });
                   let result;
                   try {
                     let args = call.function.arguments;
                     if (typeof args === 'string') { try { args = JSON.parse(args); } catch (e) { args = { data: args }; } }
                     result = await mcpManager.callTool(activeServerName, realName, args);
                   } catch (e: any) { result = { error: e.message }; }
                   
                   const toolMsg = { id: generateUUID(), role: 'tool', content: JSON.stringify(result, null, 2), timestamp: Date.now(), metadata: { toolName: realName } };
                   currentMsgs.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
                   setMessages(prev => [...prev, toolMsg as any]);
                   await addMessage(conversationId, toolMsg as any);
                }
                
                // Prepare new assistant turn
                const nextId = generateUUID();
                setMessages(prev => [...prev, { id: nextId, role: 'assistant', content: '', timestamp: Date.now(), streaming: true }]);
                
                // @ts-ignore - Update assistantId for subsequent turns
                assistantId = nextId; 
                
                loops++;
                finalContent = '';
                setCurrentResponse('');
             } else {
                lastResContent = res.content || '';
                break;
             }
           }

           if (loops > 0 && (!lastResContent || lastResContent.length < 5)) {
              await chatEngine.generateText(currentMsgs as any, { onStream: (c) => { 
                finalContent += c;
                setCurrentResponse(finalContent); 
                processAudioChunk(c);
                // Need to find the latest assistant message to update
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last.role === 'assistant') return prev.map(m => m.id === last.id ? { ...m, content: last.content + c } : m);
                  return prev;
                });
              } });
           } else {
              finalContent = lastResContent;
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: finalContent, streaming: false } : m));
           }
        } else {
            await chatEngine.generateText(chatMsgs as any, { onStream: (c) => { 
              finalContent += c;
              setCurrentResponse(finalContent); 
              processAudioChunk(c);
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: finalContent } : m));
            } });
        }
      }

      // Finalize the message
      const finalizedAssistantMsg = { 
        id: assistantId, 
        role: 'assistant', 
        content: finalContent, 
        timestamp: Date.now(),
        sources: finalSources as any,
        streaming: false,
        metadata: finalMetadata
      };

      setMessages(prev => prev.map(m => m.id === assistantId ? finalizedAssistantMsg as any : m));
      setCurrentResponse('');
      setWebSearchProgress(null);
      finishAudioStreaming(finalContent);
      
      // Save to DB using the PRE-GENERATED ID
      await addMessage(conversationId, {
        id: assistantId,
        role: 'assistant',
        content: finalContent,
        sources: finalSources,
        metadata: finalMetadata
      });

      // Refresh conversation list/title in background
      if (isFirstMessage) {
        generatingTitleIdSignal.value = conversationId!;
        aiGenerateTitle(originalContent).then(async (aiTitle) => {
          await updateConversationTitle(conversationId!, aiTitle);
          const updated = await getConversation(conversationId!);
          if (updated) conversationsStore.update(conversationId!, updated);
        }).catch(err => console.error("Title generation failed", err))
          .finally(() => {
            generatingTitleIdSignal.value = null;
          });
      } else {
        const updated = await getConversation(conversationId);
        if (updated) conversationsStore.update(conversationId, updated);
      }

      // Handlers for document generation or extension intent
      if (isDocumentGenerationRequest(originalContent)) {
        canvasStore.open(markdownToHTML(finalContent));
      }
      setTimeout(() => processExtensionIntent(finalContent, activeTool?.id), 500);

    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev.filter(m => m.id !== assistantId), { id: generateUUID(), role: 'assistant', content: 'Error: ' + error.message, timestamp: Date.now() }]);
    } finally { 
      setIsGenerating(false); 
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg)]">
      <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full custom-scrollbar">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-4">
            <img src="/inledai.svg" width={64} className="animate-in zoom-in duration-500" />
            <h3 className="text-xl font-bold">{i18nStore.t('chat.welcome')}</h3>
            {!canChat && <p className="text-sm text-amber-500 mt-2">{i18nStore.t('chat.stepsRequired')}</p>}
          </div>
        ) : (
          <div className="space-y-6">
            {messages.map(m => {
              if (!m) return null;
              if (m.role === 'tool') {
                return (
                  <div key={m.id} className="flex justify-center animate-in fade-in slide-in-from-top-2">
                                          <div className="max-w-2xl w-full bg-[var(--color-bg-tertiary)]/40 border border-[var(--color-border)] rounded-xl p-4 shadow-sm">
                                            <div className="flex items-center gap-2 text-[var(--color-text-tertiary)] text-[10px] font-bold uppercase tracking-widest mb-2">
                                              <Server size={12} className="text-green-500" />
                                              <span>{i18nStore.t('mcp.toolResult').replace('{name}', (m.metadata?.toolName || 'Herramienta').toUpperCase())}</span>
                                            </div>
                                            <pre className="text-[11px] font-mono text-[var(--color-text-secondary)] overflow-x-auto whitespace-pre-wrap max-h-40 leading-relaxed custom-scrollbar">                        {m.content}
                      </pre>
                    </div>
                  </div>
                );
              }
              if (m.role === 'assistant' && (m as any).tool_calls) {
                 const calls = (m as any).tool_calls;
                 // If there's no content, only show the pill
                 return (
                   <div key={m.id} className="space-y-4">
                     {m.content && <Message message={m} onOpenInCanvas={handleOpenInCanvas} />}
                                            <div className="flex justify-center">
                                              <div className="flex items-center gap-2.5 px-4 py-2 bg-blue-500/5 border border-blue-500/20 rounded-full shadow-sm animate-pulse">
                                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                <span className="text-xs font-semibold text-blue-500">
                                                  {i18nStore.t('mcp.using').replace('{name}', calls.map((t:any) => t.function.name.split('__')[1] || t.function.name).join(', '))}
                                                </span>
                                              </div>
                                            </div>                   </div>
                 );
              }
              // Skip empty assistant messages
              if (m.role === 'assistant' && !m.content && !(m as any).tool_calls) return null;
              
              return <Message key={m.id} message={m} onOpenInCanvas={handleOpenInCanvas} onRegenerate={() => handleRegenerate(m.id)} />;
            })}
            {isGenerating && !currentResponse && !webSearchProgress && (
              <div className="flex gap-3 animate-slideUp">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center shadow-lg"><Sparkles size={16} color="black" /></div>
                <div className="flex items-center gap-1.5 px-4 py-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            {isGenerating && currentResponse && (
              <div className="flex gap-3 animate-slideUp">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center shadow-lg"><Sparkles size={16} color="black" /></div>
                <div className="flex-1 p-4 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl shadow-sm"><MarkdownRenderer content={currentResponse} /></div>
              </div>
            )}
            {webSearchProgress && <div className="px-10"><WebSearchProgress {...webSearchProgress} /></div>}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}
      </div>
      <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto">
          <ChatInput onSend={handleSendMessage} disabled={!canChat} loading={isGenerating} supportsVision={!!modelsStore.chat?.requiresGPU} />
        </div>
      </div>
      {pendingUrls && confirmationResolver && <UrlConfirmationModal urls={pendingUrls} onConfirm={confirmationResolver} onCancel={() => confirmationResolver(null)} />}
    </div>
  );
}
