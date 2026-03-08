// WebLLM Engine - Local AI inference in the browser
// Supports WebGPU (fast) - adapted for local-first architecture

import * as webllm from '@mlc-ai/web-llm';
import { probeActualLimits, getWebGPUConfig } from './gpu-limits';
import { i18nStore } from '../stores/i18n';
import { getModelById } from './model-registry';

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  tools?: any[];
  tool_choice?: any;
  signal?: AbortSignal;
  onStream?: (chunk: string) => void;
  onAudio?: (audio: Float32Array | Uint8Array) => void;
}

export interface ProgressCallback {
  (progress: number, status: string): void;
}

/**
 * WebLLM Engine for local AI inference
 */
export class WebLLMEngine {
  private engine: webllm.MLCEngine | null = null;
  private modelName: string = '';
  private isInitialized: boolean = false;
  private backend: 'webgpu' = 'webgpu';
  private needsReload: boolean = false;

  constructor() {
    console.log('🤖 WebLLM Engine created');
  }

  async initialize(modelName: string, onProgress?: ProgressCallback): Promise<void> {
    if (this.isInitialized && this.modelName === modelName && !this.needsReload) return;
    try {
      console.log('🚀 Initializing WebLLM:', modelName);
      
      // Cleanup existing engine to free GPU memory
      if (this.engine) {
        try {
          console.log('🧹 WebLLM: Unloading previous engine instance...');
          await this.engine.unload();
        } catch (e) {}
        this.engine = null;
      }

      onProgress?.(0, i18nStore.t('models.progress.initializing'));
      const gpuLimits = await probeActualLimits();
      if (!gpuLimits) throw new Error('WebGPU not available');

      const webgpuConfig = getWebGPUConfig(gpuLimits.tier);
      
      const isEmbeddingModel = modelName.toLowerCase().includes('embed');
      const overrideConfig = isEmbeddingModel 
        ? {
            context_window_size: 512,
            prefill_chunk_size: 512,
          }
        : {
            context_window_size: webgpuConfig.max_window_size,
          };

      this.engine = new webllm.MLCEngine();
      await this.engine.reload(modelName, {
        ...overrideConfig,
        initProgressCallback: (report: webllm.InitProgressReport) => {
          const progress = Math.round(report.progress * 70) + 20;
          onProgress?.(progress, report.text || i18nStore.t('models.progress.downloading'));
        },
      });

      this.modelName = modelName;
      this.isInitialized = true;
      this.needsReload = false;
      onProgress?.(100, i18nStore.t('models.progress.modelReady'));
    } catch (error) {
      console.error('❌ WebLLM Error:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  async chat(messages: any[], options: GenerationOptions = {}): Promise<any> {
    // Check if we need to recover from a previous stuck state
    if (this.needsReload) {
      console.log('🔄 WebLLM: Recovering from previous abort, reloading engine...');
      await this.initialize(this.modelName);
    }

    if (!this.isInitialized || !this.engine) throw new Error('WebLLM not initialized');
    const { temperature = 0.7, maxTokens = 512, topP = 0.95, stop, tools, onStream, signal } = options;

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const abortHandler = () => {
      if (this.engine) {
        console.log('🛑 WebLLM: Abort triggered. Marking engine for reload.');
        this.engine.interruptGenerate();
        this.needsReload = true; 
      }
    };
    
    if (signal) {
      signal.addEventListener('abort', abortHandler);
    }

    try {
      const nativeToolModels = ['Hermes-2-Pro', 'Hermes-3', 'Llama-3.1-8B-Instruct'];
      const supportsNativeTools = nativeToolModels.some(m => this.modelName.includes(m));
      
      let useNativeTools = supportsNativeTools && !!tools;
      
      // ALWAYS map 'tool' role to 'user' if not using native tools, 
      // regardless of whether we are currently requesting tools or summarizing.
      let processedMessages = messages.map(m => {
        if (!useNativeTools && m.role === 'tool') {
          return {
            role: 'user',
            content: `[TOOL RESULT]: ${m.content}`
          };
        }
        return m;
      });

      if (!useNativeTools && tools && tools.length > 0) {
        console.log('🛠️ WebLLM: Using aggressive prompt tool calling');
        const toolSignatures = tools.map((t: any) => {
          const props = t.function?.parameters?.properties || t.parameters?.properties || {};
          const argList = Object.keys(props).join(', ');
          return `- ${t.function?.name || t.name}(${argList}): ${t.function?.description || t.description || ''}`;
        }).join('\n');

        const toolSystemPrompt = `### CRITICAL PROTOCOL: TOOL CALLING
You have access to these FUNCTIONS:
${toolSignatures}

To use a function, you MUST respond ONLY with a JSON object:
{ "tool": "function_name", "args": { "key": "value" } }

RULES:
- Respond ONLY with JSON if a function is needed.
- NO conversational text.
- NO markdown blocks.
- If NO function is needed, reply normally.

EXAMPLE:
User: "list items"
Assistant: {"tool": "some__list_items", "args": {}}`;
        
        const sysIndex = processedMessages.findIndex(m => m.role === 'system');
        if (sysIndex >= 0) processedMessages[sysIndex].content = `${toolSystemPrompt}\n\n${processedMessages[sysIndex].content}`;
        else processedMessages.unshift({ role: 'system', content: toolSystemPrompt });
      }

      let finalMessage: any = { role: 'assistant', content: '' };

      if (onStream) {
        const completion = await this.engine.chat.completions.create({
          messages: processedMessages as any,
          temperature: useNativeTools ? temperature : 0.1,
          max_tokens: maxTokens,
          top_p: topP,
          stop: useNativeTools ? stop : ['<|end_of_text|>', '<|im_end|>', '```'],
          tools: useNativeTools ? tools : undefined,
          stream: true,
        });

        for await (const chunk of completion) {
          if (signal?.aborted) break;
          const delta = chunk.choices[0]?.delta;
          if (delta) {
             if (delta.content) {
               finalMessage.content += delta.content;
               onStream(delta.content);
             }
             if (delta.tool_calls) {
               if (!finalMessage.tool_calls) finalMessage.tool_calls = [];
               for (const tc of delta.tool_calls) {
                  const idx = tc.index;
                  if (!finalMessage.tool_calls[idx]) finalMessage.tool_calls[idx] = { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } };
                  if (tc.function?.name) finalMessage.tool_calls[idx].function.name += tc.function.name;
                  if (tc.function?.arguments) finalMessage.tool_calls[idx].function.arguments += tc.function.arguments;
               }
             }
          }
        }
      } else {
        const response = await this.engine.chat.completions.create({
          messages: processedMessages as any,
          temperature: useNativeTools ? temperature : 0.1,
          max_tokens: maxTokens,
          top_p: topP,
          stop: useNativeTools ? stop : ['<|end_of_text|>', '<|im_end|>', '```'],
          tools: useNativeTools ? tools : undefined,
          stream: false,
        });
        const msg = response.choices[0]?.message;
        finalMessage.content = msg?.content || '';
        finalMessage.tool_calls = msg?.tool_calls;
      }

      if (!useNativeTools && finalMessage.content.includes('{')) {
         const tc = this.extractToolCall(finalMessage.content);
         if (tc) {
            finalMessage.tool_calls = [tc];
            finalMessage.content = '';
         }
      }
      return finalMessage;
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && (error.message.includes('abort') || error.message.includes('cancel')))) {
        console.log('✅ WebLLM: Generation aborted successfully');
        return finalMessage;
      }
      
      if (error instanceof Error && error.message.includes('busy')) {
        console.warn('🔄 WebLLM: Engine busy, forcing reload next time...');
        this.needsReload = true;
      }
      
      console.error('❌ Chat completion failed:', error);
      throw error;
    } finally {
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    }
  }

  private extractToolCall(text: string): any | null {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace <= firstBrace) return null;

    for (let i = lastBrace; i > firstBrace; i--) {
      if (cleaned[i] === '}') {
        const candidate = cleaned.substring(firstBrace, i + 1);
        try {
          const data = JSON.parse(candidate);
          if (data.tool) return {
            id: 'call_' + Math.random().toString(36).substr(2, 9),
            type: 'function',
            function: { name: data.tool, arguments: typeof data.args === 'string' ? data.args : JSON.stringify(data.args || {}) }
          };
        } catch (e) {}
      }
    }
    return null;
  }

  async generateText(input: string | { role: string; content: string | any[] }[], options: GenerationOptions = {}): Promise<string> {
    if (this.needsReload) {
      console.log('🔄 WebLLM: Recovering from previous abort, reloading engine...');
      await this.initialize(this.modelName);
    }

    if (!this.isInitialized || !this.engine) throw new Error('WebLLM not initialized');
    
    let messages = Array.isArray(input) ? input : [{ role: 'user', content: input }];
    const { signal, onStream } = options;
    
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const abortHandler = () => {
      if (this.engine) {
        console.log('🛑 WebLLM: Abort triggered. Marking engine for reload.');
        this.engine.interruptGenerate();
        this.needsReload = true;
      }
    };
    
    if (signal) signal.addEventListener('abort', abortHandler);
    
    try {
      // Fix for "Role is not supported: tool" in generateText
      // Map tool outputs to user messages for non-native models
      const nativeToolModels = ['Hermes-2-Pro', 'Hermes-3', 'Llama-3.1-8B-Instruct'];
      const supportsNativeTools = nativeToolModels.some(m => this.modelName.includes(m));
      
      if (!supportsNativeTools) {
        messages = messages.map(m => {
          if (m.role === 'tool') {
            return { role: 'user', content: `[TOOL RESULT]: ${m.content}` };
          }
          return m;
        });
      }
      
      let fullResponse = '';
      if (onStream) {
        const completion = await this.engine.chat.completions.create({ 
          messages: messages as any, 
          ...options, 
          stream: true 
        });
        for await (const chunk of completion) {
          if (signal?.aborted) break;
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            onStream(content);
          }
        }
      } else {
        const response = await this.engine.chat.completions.create({ 
          messages: messages as any, 
          ...options, 
          stream: false 
        });
        fullResponse = response.choices[0]?.message?.content || '';
      }
      return fullResponse;
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && (error.message.includes('abort') || error.message.includes('cancel')))) {
        return fullResponse;
      }
      
      if (error instanceof Error && error.message.includes('busy')) {
        console.warn('🔄 WebLLM: Engine busy, forcing reload next time...');
        this.needsReload = true;
      }
      
      throw error;
    } finally {
      if (signal) signal.removeEventListener('abort', abortHandler);
    }
  }

  async generateEmbedding(text: string): Promise<Float32Array> {
    if (!this.isInitialized || !this.engine) throw new Error('WebLLM not initialized');
    // @ts-ignore
    const res = await this.engine.embeddings.create({ input: text });
    return new Float32Array(res.data[0].embedding);
  }

  async generateEmbeddingsBatch(texts: string[], maxConcurrent = 4, onProgress?: any): Promise<Float32Array[]> {
    if (!this.isInitialized || !this.engine) throw new Error('WebLLM not initialized');
    // @ts-ignore
    const res = await this.engine.embeddings.create({ input: texts });
    return res.data.map((item: any) => new Float32Array(item.embedding));
  }

  getBackend(): 'webgpu' { return this.backend; }
  isReady(): boolean { return this.isInitialized && this.engine !== null; }
  getModelName(): string { return this.modelName; }
  
  /**
   * Get the context window size for the current model
   */
  getContextWindowSize(): number {
    // Try to get from engine if possible, otherwise fallback to standard values
    return (this.engine as any)?.config?.context_window_size || 4096;
  }

  async reset() { this.engine = null; this.isInitialized = false; }
}