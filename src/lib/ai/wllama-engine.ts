// Wllama Engine - Pure WebAssembly CPU inference
// Adapted for local-first architecture (no external cache dependencies)

// @ts-ignore
import { Wllama } from './wllama-lib.js';
import type { GenerationOptions, ProgressCallback } from './webllm-engine';
import { detectWasmFeatures, getOptimalThreadCount } from './wasm-features';
import { i18nStore } from '../stores/i18n';

/**
 * Wllama Engine for pure WebAssembly CPU inference
 */
export class WllamaEngine {
  private wllama: any | null = null;
  private modelUrl: string = '';
  private isInitialized: boolean = false;
  private initializing: boolean = false;
  private currentCtxSize: number = 0;

  constructor() {
    console.log('🤖 Wllama Engine created');
  }

  /**
   * Initialize the Wllama engine with a GGUF model
   */
  async initialize(
    modelUrl?: string,
    onProgress?: ProgressCallback
  ): Promise<void> {
    if (this.initializing) return;

    // OPTIMIZATION: 8192 is enough for tool calling and keeps CPU fast.
    const targetCtxSize = 8192; 

    if (this.isInitialized && this.modelUrl === modelUrl && this.wllama && this.currentCtxSize === targetCtxSize) {
      console.log('✅ Wllama already initialized');
      return;
    }

    this.initializing = true;

    try {
      if (this.wllama) {
        await this.wllama.exit();
        this.wllama = null;
      }

      console.log('🚀 Initializing Wllama (WebAssembly CPU)...');
      onProgress?.(0, i18nStore.t('models.progress.loadingWasm'));

      const wasmFeatures = await detectWasmFeatures();
      const optimalThreads = getOptimalThreadCount(wasmFeatures);

      this.modelUrl = modelUrl || 'https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf';

      const config = {
        'single-thread/wllama.wasm': '/wllama/single-thread/wllama.wasm',
        'multi-thread/wllama.wasm': '/wllama/multi-thread/wllama.wasm',
        'multi-thread/wllama.worker.mjs': '/wllama/multi-thread/wllama.worker.mjs',
      };

      if (typeof window !== 'undefined' && (window as any).Module) {
        try { delete (window as any).Module; } catch (e) {}
      }

      this.wllama = new Wllama(config);
      
      const loadStartTime = Date.now();
      let lastLoaded = 0;

      const loadModel = async (attempt: number) => {
        console.log(`📡 [Wllama] Starting load attempt ${attempt} (n_ctx: ${targetCtxSize})`);
        
        await this.wllama!.loadModelFromUrl(this.modelUrl, {
          n_ctx: targetCtxSize,
          embeddings: true,
          n_threads: optimalThreads,
          useCache: attempt === 1,
          progressCallback: ({ loaded, total }: any) => {
            if (total > 0) {
              const percent = Math.round((loaded / total) * 70);
              onProgress?.(10 + percent, `${Math.round(loaded/1024/1024)}MB / ${Math.round(total/1024/1024)}MB`);
            }
          },
        });
      };

      await loadModel(1);
      this.currentCtxSize = targetCtxSize;
      this.isInitialized = true;
      onProgress?.(100, i18nStore.t('models.progress.modelReady') + ' (CPU)');
    } catch (error) {
      console.error('❌ Failed to initialize Wllama:', error);
      this.isInitialized = false;
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Advanced chat with tools
   */
  async chat(messages: any[], options: any = {}): Promise<any> {
    if (!this.isInitialized || !this.wllama) throw new Error('Wllama not initialized');

    const { temperature = 0.7, maxTokens = 1024, topP = 0.95, tools, onStream, onAudio } = options;

    try {
       // Convert messages to tool-friendly format
       let processedMessages = messages.map(m => {
         if (m.role === 'tool') return { role: 'user', content: `RESULT: ${m.content}` };
         return m;
       });
       
       if (tools && tools.length > 0) {
         const toolSignatures = tools.map((t: any) => {
           const props = t.function?.parameters?.properties || t.parameters?.properties || {};
           const argList = Object.keys(props).join(', ');
           return `- ${t.function?.name || t.name}(${argList}): ${t.function?.description || t.description || ''}`;
         }).join('\n');

         const toolSystemPrompt = `
# AVAILABLE INTERNAL FUNCTIONS
${toolSignatures}

# MANDATORY PROTOCOL
If you need to use a function to answer, you MUST respond ONLY with this JSON block:
{ "tool": "function_name", "args": { "param": "value" } }

RULES:
- Respond ONLY with JSON.
- NO conversational text.
- NO markdown blocks.
- Use the EXACT function name.
- If NO function is needed, reply normally in text.

EJEMPLO:
Usuario: "Busca mis notas"
Asistente: { "tool": "search", "args": { "query": "notas" } }
`;
         
         const sysIndex = processedMessages.findIndex(m => m.role === 'system');
         if (sysIndex >= 0) processedMessages[sysIndex].content = `${toolSystemPrompt}\n\n${processedMessages[sysIndex].content}`;
         else processedMessages.unshift({ role: 'system', content: toolSystemPrompt });
       }

       let fullContent = '';
       const wrappedOnStream = (token: string) => {
         fullContent += token;
         onStream?.(token);
       };

       console.log('🛠️ Wllama: Executing tool loop...');
       
       await this.generateText(processedMessages, {
         temperature: tools ? 0.1 : temperature,
         maxTokens,
         topP,
         stop: ['<|end_of_text|>', '<|im_end|>', '```'],
         onStream: wrappedOnStream,
         onAudio
       });

       const toolCall = this.extractToolCall(fullContent);

       return { 
         role: 'assistant', 
         content: toolCall ? '' : fullContent, 
         tool_calls: toolCall ? [toolCall] : undefined 
       };
    } catch (error) {
       console.error('Wllama chat error:', error);
       throw error;
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
          if (data.tool) {
            return {
              id: 'call_' + Math.random().toString(36).substr(2, 9),
              type: 'function',
              function: { 
                name: data.tool, 
                arguments: typeof data.args === 'string' ? data.args : JSON.stringify(data.args || {}) 
              }
            };
          }
        } catch (e) {}
      }
    }
    return null;
  }

  /**
   * Generate text response
   */
  async generateText(
    input: string | { role: string; content: string | any[] }[],
    options: GenerationOptions = {}
  ): Promise<string> {
    if (!this.isInitialized || !this.wllama) throw new Error('Wllama not initialized');

    const { temperature = 0.7, maxTokens = 512, stop = [], onStream, onAudio } = options;

    try {
      await this.wllama.setOptions({ embeddings: false });

      let messages: { role: string; content: string }[] = [];
      if (Array.isArray(input)) {
        messages = input.map(msg => ({
          role: msg.role,
          content: Array.isArray(msg.content) ? (msg.content.find((p:any) => p.type === 'text')?.text || '') : msg.content as string
        }));
      } else {
        messages = [{ role: 'user', content: input }];
      }

      const prompt = messages.map(msg => `<|im_start|>${msg.role}\n${msg.content}<|im_end|>`).join('\n') + '\n<|im_start|>assistant\n';
      const effectiveStop = [...(stop || []), '<|im_end|>', '<|im_start|>', '<|end_of_text|>'];
      
      const isAudioModel = this.modelUrl.includes('lfm-2-audio');
      // Audio streaming state
      let inAudioSegment = false;
      let mimiBuffer: number[] = [];
      const AUDIO_VOCAB_START = 65536;
      const CODEBOOKS = 8;
      const CODEBOOK_SIZE = 2048;

      let fullResponse = '';
      if (onStream) {
        await this.wllama.createCompletion(prompt, {
          nPredict: maxTokens,
          temp: temperature,
          stop: effectiveStop,
          onNewToken: (tokenId: number, piece: Uint8Array | number[], _currentText: any) => {
            
            // --- LFM Audio Token Handling ---
            if (isAudioModel && tokenId >= AUDIO_VOCAB_START) {
              // Extract codebook index and value
              // Assuming tokens are interleaved: C0, C1, ..., C7
              const audioVal = tokenId - AUDIO_VOCAB_START;
              const codebookIdx = Math.floor(audioVal / CODEBOOK_SIZE);
              const codeValue = audioVal % CODEBOOK_SIZE;
              
              mimiBuffer.push(codeValue);
              
              // When we have a full frame (8 codebooks)
              if (mimiBuffer.length === CODEBOOKS) {
                if (onAudio) {
                  // Pass as an array of 8 codes
                  onAudio(new Uint8Array(mimiBuffer)); 
                }
                mimiBuffer = [];
              }
              return; // Don't detokenize audio codes as text
            }
            // --------------------------------

            // Detokenize text
            let textChunk = '';
            if (piece instanceof Uint8Array || Array.isArray(piece)) {
               textChunk = new TextDecoder().decode(new Uint8Array(piece));
            }

            if (textChunk) {
              fullResponse += textChunk;
              onStream(textChunk);
            }
          },
        } as any);
      } else {
        fullResponse = await this.wllama.createCompletion(prompt, { nPredict: maxTokens, temp: temperature, stop: effectiveStop } as any);
      }

      await this.wllama.setOptions({ embeddings: true });
      return fullResponse;
    } catch (error) {
      throw error;
    }
  }

  async generateEmbedding(text: string): Promise<Float32Array> {
    const truncated = text.substring(0, 512);
    return await this.wllama.createEmbedding(truncated);
  }

  async generateEmbeddingsBatch(texts: string[], maxConcurrent = 4, onProgress?: any): Promise<Float32Array[]> {
    const results: Float32Array[] = [];
    for (let i = 0; i < texts.length; i++) {
      results.push(await this.generateEmbedding(texts[i]));
      onProgress?.(Math.round(((i + 1) / texts.length) * 100), `Embed: ${i + 1}/${texts.length}`);
    }
    return results;
  }

  getBackend(): 'wasm' { return 'wasm'; }
  isReady(): boolean { return this.isInitialized && this.wllama !== null; }
  getModelUrl(): string { return this.modelUrl; }
  async reset() { if (this.wllama) { await this.wllama.exit(); this.wllama = null; this.isInitialized = false; } }
}
