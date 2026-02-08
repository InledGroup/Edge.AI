// ChatInterface - Complete chat interface with RAG & Specialized MCP Support

import { useState, useEffect, useRef } from 'preact/hooks';
import { Sparkles, AlertCircle, Server } from 'lucide-preact';
import { Message } from './Message';
import { ChatInput } from './ChatInput';
import { WebSearchProgress } from './WebSearchProgress';
import { UrlConfirmationModal } from './UrlConfirmationModal';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import { conversationsStore, modelsReady, hasReadyDocuments, canvasStore, canvasSignal, modelsStore } from '@/lib/stores';
import { i18nStore } from '@/lib/stores/i18n';
import type { Message as MessageType } from '@/types';
import { completeRAGFlow } from '@/lib/rag/rag-pipeline';
import EngineManager from '@/lib/ai/engine-manager';
import { WebLLMEngine } from '@/lib/ai/webllm-engine';
import { addMessage, getOrCreateConversation, getConversation, generateTitle, updateConversationTitle } from '@/lib/db/conversations';
import { getRAGSettings, getWebSearchSettings, getSetting } from '@/lib/db/settings';
import { getMemories, addMemory } from '@/lib/db/memories';
import { WebRAGOrchestrator } from '@/lib/web-search';
import { generateUUID } from '@/lib/utils';
import { speechService, isVoiceModeEnabled } from '@/lib/voice/speech-service';
import { mcpManager } from '@/lib/ai/mcp-manager';

// Helper functions moved out of component
const isDocumentGenerationRequest = (message: string): boolean => {
  const lowerMessage = message.toLowerCase().trim();
  const keywords = ['genera un documento', 'crea un documento', 'escribe un documento', 'redacta un documento', 'genera un informe', 'crea un informe'];
  return keywords.some(keyword => lowerMessage.includes(keyword)) || (message.length > 30 && /^(genera|crea|escribe|redacta)/i.test(message));
};

const markdownToHTML = (md: string) => {
  return md.replace(/^# (.*$)/gim, '<h1>$1</h1>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
};

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

  async function handleSendMessage(content: string, mode: 'web' | 'local' | 'smart' | 'conversation', images?: string[]) {
    if (!isModelsReady) { alert(i18nStore.t('chat.loadModelsFirst')); return; }

    const originalContent = content; 
    let assistantPrompt = content;   
    let effectiveMode = mode;

    // 1. Detect MCP Trigger (Slash command or Keyword)
    let mcpTools: any[] = [];
    let activeServerName = '';
    const toolNameMap = new Map<string, string>();

    const mcpMatch = content.match(/\/(\w+)/);
    let serverToUse = mcpMatch ? mcpMatch[1] : null;

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

    const userMessage: MessageType = { id: generateUUID(), role: 'user', content: originalContent, images, timestamp: Date.now() };
    setMessages(prev => [...prev, userMessage]);

    let conversationId = conversationsStore.activeId;
    let isNewConversation = false;
    if (!conversationId) {
      const conv = await getOrCreateConversation();
      conversationId = conv.id;
      isNewConversation = true;
      conversationsStore.add(conv);
    }
    await addMessage(conversationId, userMessage);

    if (isNewConversation) {
      const title = generateTitle(originalContent);
      await updateConversationTitle(conversationId, title);
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

    try {
      const chatEngine = await EngineManager.getChatEngine();
      const chatModelId = modelsStore.chat?.id;
      const memories = await getMemories();
      const memoryContext = memories.length > 0 ? `\n\nRECUERDOS:\n${memories.map(m => `- ${m.content}`).join('\n')}` : '';
      let canvasContext = '';
      if (canvasSignal.value.isOpen && canvasSignal.value.content) {
        canvasContext = `\n=== DOCUMENTO ABIERTO ===\n${canvasSignal.value.content.replace(/<[^>]*>/g, ' ').substring(0, 1000)}\n===`;
      }

      let assistantMessage: MessageType | null = null;

      if (effectiveMode === 'web') {
        const embeddingEngine = await EngineManager.getEmbeddingEngine();
        const orchestrator = await WebRAGOrchestrator.create(chatEngine, embeddingEngine);
        const tempId = generateUUID();
        setMessages(prev => [...prev, { id: tempId, role: 'assistant', content: '', timestamp: Date.now(), streaming: true }]);
        const res = await orchestrator.search(originalContent, {
          onToken: (t) => {
            setCurrentResponse(prev => prev + t);
            processAudioChunk(t);
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, content: m.content + t } : m));
          }
        });
        assistantMessage = { id: tempId, role: 'assistant', content: res.answer, timestamp: Date.now() } as any;
      } else if (effectiveMode === 'local') {
        const embeddingEngine = await EngineManager.getEmbeddingEngine();
        const settings = await getRAGSettings();
        let streamedText = '';
        const { answer, ragResult } = await completeRAGFlow(assistantPrompt, embeddingEngine, chatEngine, settings.topK, undefined, messages.slice(-5).map(m => ({ role: m.role, content: m.content })), (c) => {
          streamedText += c;
          setCurrentResponse(streamedText);
          processAudioChunk(c);
        }, { additionalContext: canvasContext + memoryContext });
        assistantMessage = { id: generateUUID(), role: 'assistant', content: answer, timestamp: Date.now(), sources: ragResult.chunks };
      } else {
        const history = [...messages.slice(-10), userMessage].map(m => ({ role: m.role, content: m.content }));
        const systemPrompt = `Eres un asistente inteligente local. ${canvasContext}${memoryContext}`;
        const chatMsgs = [{ role: 'system', content: systemPrompt }, ...history];
        
        let answer = '';
        let streamedText = '';
        const isMcpIntent = mcpTools.length > 0 || content.match(/\/(notion|weather|google|search)/i);

        if (isMcpIntent && mcpTools.length > 0) {
           const useSpecialized = await getSetting('useSpecializedToolModel');
           const canHandleNative = chatEngine instanceof WebLLMEngine && chatModelId?.includes('8b');
           const toolEngine = (useSpecialized && !canHandleNative) ? await EngineManager.getToolEngine() : chatEngine;
           
           let currentMsgs = [...chatMsgs];
           if (toolEngine !== chatEngine) {
             currentMsgs[0].content += `\n\nCRITICAL: User is interacting with ${activeServerName}. If you need information, call a function IMMEDIATELY using JSON. Do NOT explain.`;
           }

           let loops = 0;
           let lastResContent = '';

           while (loops < 5) {
             let isToolCallDetected = false;
             let accumulatedText = '';
             const res = await toolEngine.chat(currentMsgs, { 
               tools: mcpTools, 
               onStream: (c) => { 
                 accumulatedText += c;
                 if (accumulatedText.includes('{') || accumulatedText.includes('###')) { isToolCallDetected = true; setCurrentResponse(''); }
                 if (!isToolCallDetected) { setCurrentResponse(accumulatedText); processAudioChunk(c); } 
               } 
             });

             if (res.tool_calls && res.tool_calls.length > 0) {
                currentMsgs.push(res);
                // Persist the assistant's intention to call a tool
                const toolCallMsg = { 
                  id: generateUUID(), 
                  role: 'assistant', 
                  content: res.content || '', 
                  timestamp: Date.now(), 
                  tool_calls: res.tool_calls 
                };
                setMessages(prev => [...prev, toolCallMsg as any]);
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
                   
                   const toolMsg = { 
                     id: generateUUID(), 
                     role: 'tool', 
                     content: JSON.stringify(result, null, 2), 
                     timestamp: Date.now(), 
                     metadata: { toolName: realName } 
                   };
                   
                   currentMsgs.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
                   setMessages(prev => [...prev, toolMsg as any]);
                   await addMessage(conversationId, toolMsg as any);
                }
                loops++;
                setCurrentResponse('');
             } else {
                lastResContent = res.content || '';
                break;
             }
           }

           // Final summarization turn if needed
           if (loops > 0 && (!lastResContent || lastResContent.length < 5)) {
              console.log("🏁 Forcing final summarization turn...");
              answer = await chatEngine.generateText(currentMsgs as any, { onStream: (c) => { streamedText += c; setCurrentResponse(streamedText); processAudioChunk(c); } });
           } else {
              answer = lastResContent;
              if (!streamedText && !currentResponse) setCurrentResponse(answer);
           }
        } else {
            answer = await chatEngine.generateText(chatMsgs as any, { onStream: (c) => { streamedText += c; setCurrentResponse(streamedText); processAudioChunk(c); } });
        }
        assistantMessage = (answer || streamedText) ? { id: generateUUID(), role: 'assistant', content: answer || streamedText, timestamp: Date.now() } : null;
      }

      if (assistantMessage) {
        if (effectiveMode !== 'web') setMessages(prev => [...prev, assistantMessage!]);
        setCurrentResponse('');
        setWebSearchProgress(null);
        finishAudioStreaming(assistantMessage.content);
        await addMessage(conversationId, assistantMessage);
      }

      if (assistantMessage && isDocumentGenerationRequest(originalContent)) {
        canvasStore.open(markdownToHTML(assistantMessage.content));
      }
    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, { id: generateUUID(), role: 'assistant', content: 'Error: ' + error.message, timestamp: Date.now() }]);
    } finally { setIsGenerating(false); }
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
              
              return <Message key={m.id} message={m} onOpenInCanvas={handleOpenInCanvas} />;
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
