// Wllama Engine - Ultra Optimized for CPU Performance
// @ts-ignore
import { Wllama } from './wllama-lib.js';
import type { GenerationOptions, ProgressCallback } from './webllm-engine';
import { detectWasmFeatures } from './wasm-features';
import { i18nStore } from '../stores/i18n';

// GLOBAL LOCK: Shared across all instances to prevent CPU thrashing
// Using a static property to ensure it's truly global
let GLOBAL_GENERATION_LOCK = false;

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
   * Initialize the Wllama engine
   */
  async initialize(
    modelUrl?: string,
    onProgress?: ProgressCallback,
    threadOverride?: number
  ): Promise<void> {
    if (this.initializing) return;

    // OPTIMIZATION: Context size management
    // Reducing context size to 2048 for CPU to avoid massive prefill times
    const isEmbeddingOrTool = threadOverride !== undefined && threadOverride <= 4;
    const targetCtxSize = isEmbeddingOrTool ? 512 : 2048; 

    if (this.isInitialized && this.modelUrl === modelUrl && this.wllama && this.currentCtxSize === targetCtxSize) {
      return;
    }

    this.initializing = true;

    try {
      if (this.wllama) {
        try {
          await this.wllama.exit();
        } catch (e) {
          console.warn('Wllama exit error:', e);
        }
        this.wllama = null;
      }

      const wasmFeatures = await detectWasmFeatures();
      
      const cores = navigator.hardwareConcurrency || 4;
      let optimalThreads = threadOverride || (cores > 2 ? cores - 1 : cores);
      optimalThreads = Math.min(optimalThreads, 8); 
      
      if (isEmbeddingOrTool) {
        optimalThreads = Math.min(optimalThreads, 4);
      }

      // INCREASED: 512 is the standard for llama.cpp, 128 was causing logit errors
      const nBatch = 512; 

      this.modelUrl = modelUrl || 'https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf';

      const config = {
        'single-thread/wllama.wasm': '/wllama/single-thread/wllama.wasm',
        'multi-thread/wllama.wasm': '/wllama/multi-thread/wllama.wasm',
        'multi-thread/wllama.worker.mjs': '/wllama/multi-thread/wllama.worker.mjs',
      };

      this.wllama = new Wllama(config);
      const useEmbeddings = isEmbeddingOrTool;

      await this.wllama!.loadModelFromUrl(this.modelUrl, {
        n_ctx: targetCtxSize,
        embeddings: useEmbeddings,
        n_threads: optimalThreads,
        n_batch: nBatch,
        // ENABLE Flash Attention if SIMD is available, it fixes V cache padding issues
        flash_attn: wasmFeatures.simd, 
        useCache: true,
        progressCallback: ({ loaded, total }: any) => {
          if (total > 0) {
            onProgress?.(10 + Math.round((loaded / total) * 70), `${Math.round(loaded/1024/1024)}MB / ${Math.round(total/1024/1024)}MB`);
          }
        },
      });

      this.currentCtxSize = targetCtxSize;
      this.isInitialized = true;
      onProgress?.(100, i18nStore.t('models.progress.modelReady'));
    } catch (error) {
      console.error('❌ Wllama Init Error:', error);
      this.isInitialized = false;
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Generate text response
   */
  async generateText(
    input: string | { role: string; content: string | any[] }[],
    options: GenerationOptions = {}
  ): Promise<string> {
    if (!this.isInitialized || !this.wllama) throw new Error('Wllama not initialized');

    // REMOVED GLOBAL LOCK: It's better to have CPU contention than a 30s deadlock
    // Wllama instances run in their own workers, so they are isolated.
    
    const { temperature = 0.7, maxTokens = 512, topP = 0.9, signal, onStream } = options;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      let messages: { role: string; content: string }[] = [];
      if (Array.isArray(input)) {
        messages = input.map(msg => ({
          role: msg.role,
          content: Array.isArray(msg.content) ? (msg.content.find((p:any) => p.type === 'text')?.text || '') : msg.content as string
        }));
      } else {
        messages = [{ role: 'user', content: input }];
      }

      let prompt = '';
      try {
        prompt = await this.wllama.formatChat(messages, true);
      } catch (e) {
        prompt = messages.map(msg => `<|im_start|>${msg.role}\n${msg.content}<|im_end|>`).join('\n') + '\n<|im_start|>assistant\n';
      }

      let fullResponse = '';
      await this.wllama.createCompletion(prompt, {
        nPredict: maxTokens,
        sampling: { temp: temperature, top_p: topP },
        onNewToken: (tokenId: number, piece: Uint8Array | number[]) => {
          if (signal?.aborted) throw new Error('AbortError');
          const textChunk = new TextDecoder().decode(new Uint8Array(piece));
          if (textChunk) {
            fullResponse += textChunk;
            onStream?.(textChunk);
          }
        },
      });
      return fullResponse;
    } catch (error: any) {
      if (error.message === 'AbortError' || signal?.aborted) return fullResponse;
      throw error;
    }
  }

  async chat(messages: any[], options: any = {}): Promise<any> {
    const res = await this.generateText(messages, options);
    return { role: 'assistant', content: res };
  }

  async generateEmbedding(text: string): Promise<Float32Array> {
    if (!this.isInitialized || !this.wllama) throw new Error('Wllama not initialized');
    
    try {
      const safeText = text.substring(0, 512); 
      return await this.wllama.createEmbedding(safeText);
    } catch (e) {
      console.error('Embedding error:', e);
      return new Float32Array(1536).fill(0); // Return empty as fallback
    }
  }

  async generateEmbeddingsBatch(texts: string[], maxConcurrent = 1, onProgress?: any): Promise<Float32Array[]> {
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
  getContextWindowSize(): number { return this.currentCtxSize || 4096; }
  async reset() { if (this.wllama) { await this.wllama.exit(); this.wllama = null; this.isInitialized = false; } }
}
