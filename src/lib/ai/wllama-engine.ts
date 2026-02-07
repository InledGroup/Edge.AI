// Wllama Engine - Pure WebAssembly CPU inference
// Adapted for local-first architecture (no external cache dependencies)

// @ts-ignore
import { Wllama } from './wllama-lib.js';
import type { GenerationOptions, ProgressCallback } from './webllm-engine';
import { detectWasmFeatures, getRecommendedWllamaBuild, getOptimalThreadCount } from './wasm-features';
import { i18nStore } from '../stores/i18n';

/**
 * Wllama Engine for pure WebAssembly CPU inference
 * Fallback option when WebGPU is not available
 * Uses llama.cpp compiled to WASM - no ONNX Runtime needed
 */
export class WllamaEngine {
  private wllama: any | null = null;
  private modelUrl: string = '';
  private isInitialized: boolean = false;
  private initializing: boolean = false;

  constructor() {
    console.log('🤖 Wllama Engine created (Pure WASM CPU backend)');
  }

  /**
   * Initialize the Wllama engine with a GGUF model
   * Uses small quantized models optimized for CPU
   */
  async initialize(
    modelUrl?: string,
    onProgress?: ProgressCallback
  ): Promise<void> {
    if (this.initializing) {
      console.warn('⚠️ Wllama initialization already in progress, ignoring call.');
      return;
    }

    if (this.isInitialized && this.modelUrl === modelUrl && this.wllama) {
      console.log('✅ Wllama already initialized');
      return;
    }

    this.initializing = true;

    try {
      // CLEANUP: Aggressively ensure no previous instance exists
      if (this.wllama) {
        console.log('♻️ Cleaning up previous Wllama instance...');
        try {
          await this.wllama.exit();
        } catch (e) {
          console.warn('Error closing previous instance (ignoring):', e);
        }
        this.wllama = null;
        this.isInitialized = false;
      }

      console.log('🚀 Initializing Wllama (WebAssembly CPU)...');
      onProgress?.(0, i18nStore.t('models.progress.loadingWasm'));

      // Detect WASM features (SIMD, threads, bulk memory)
      const wasmFeatures = await detectWasmFeatures();
      const recommendedBuild = getRecommendedWllamaBuild(wasmFeatures);
      const optimalThreads = getOptimalThreadCount(wasmFeatures);

      console.log(`🎯 Using ${recommendedBuild.description} (${recommendedBuild.speedMultiplier}x speed)`);
      console.log(`🧵 Using ${optimalThreads} threads`);

      // Use a small, CPU-optimized model if none specified
      // Qwen2-0.5B-Instruct Q4_K_M is very small and fast for CPU (about 350MB)
      const defaultModelUrl = modelUrl || 'https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf';

      this.modelUrl = defaultModelUrl;

      // Multi-threading often causes "Module already initialized" or worker conflicts in some environments
      console.log('🛡️  Using multi-thread mode when available');
      
      const config = {
        'single-thread/wllama.wasm': '/wllama/single-thread/wllama.wasm',
        'multi-thread/wllama.wasm': '/wllama/multi-thread/wllama.wasm',
        'multi-thread/wllama.worker.mjs': '/wllama/multi-thread/wllama.worker.mjs',
      };

      // GLOBAL CLEANUP: Attempt to remove any existing Emscripten Module global
      if (typeof window !== 'undefined' && (window as any).Module) {
        console.warn('🧹 Cleaning up lingering global Module object...');
        try {
          // @ts-ignore
          delete (window as any).Module;
        } catch (e) {}
      }

      try {
        this.wllama = new Wllama(config);
      } catch (err: any) {
        // If "Module is already initialized", it implies global pollution from a previous run.
        console.error('CRITICAL: Failed to create Wllama instance:', err);
        throw new Error(`Wllama creation failed: ${err.message}`);
      }

      onProgress?.(10, i18nStore.t('models.progress.verifyingCache'));

      // Use Wllama's built-in cache manager (OPFS)
      // This will cache the model locally and avoid re-downloading
      console.log('💾 [Wllama] Checking OPFS cache for model...');
      const loadStartTime = Date.now();
      let isLoadingFromCache = false;
      let lastLoaded = 0;

      const loadModel = async (attempt: number) => {
        try {
          console.log(`📡 [Wllama] Starting load attempt ${attempt} for ${this.modelUrl}`);
          
          await this.wllama!.loadModelFromUrl(this.modelUrl, {
            n_ctx: 4096,
            embeddings: true, // Enable embeddings support
            n_threads: optimalThreads, // Use optimal threads for max speed
            useCache: attempt === 1, // Only use cache on first attempt
            progressCallback: ({ loaded, total }: any) => {
              if (total > 0) {
                // Detect if loading from cache (instant progress jumps)
                if (loaded > lastLoaded + 50 * 1024 * 1024 && Date.now() - loadStartTime < 2000) {
                  isLoadingFromCache = true;
                }
                
                // Log every 10MB to avoid console flooding but keep track
                if (loaded > lastLoaded + 10 * 1024 * 1024 || loaded === total) {
                   console.log(`📥 [Wllama] Download progress: ${Math.round(loaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`);
                }
                
                lastLoaded = loaded;

                const percent = Math.round((loaded / total) * 70);
                const loadedMB = Math.round(loaded / 1024 / 1024);
                const totalMB = Math.round(total / 1024 / 1024);

                const cacheStatus = isLoadingFromCache ? ` (${i18nStore.t('models.progress.fromCache')} OPFS ⚡)` : ` (${i18nStore.t('models.progress.downloading')})`;
                onProgress?.(10 + percent, `${loadedMB}MB / ${totalMB}MB${cacheStatus}`);

                if (loaded === total && isLoadingFromCache) {
                  console.log('✅ [Wllama] Model loaded from OPFS cache (no download needed!)');
                }
              }
            },
          });
        } catch (err: any) {
          console.error(`❌ [Wllama] Load error on attempt ${attempt}:`, err);
          
          if (attempt < 2) {
            console.warn(`⚠️ Attempt ${attempt} failed, retrying WITHOUT CACHE in 2s...`);
            onProgress?.(10, `${i18nStore.t('models.progress.retry')} (${attempt}/2)...`);
            
            // Cleanup and wait before retry
            try {
              await this.wllama?.exit();
            } catch (e) {}
            
            await new Promise(r => setTimeout(r, 2000));
            
            // Re-create instance for retry
            this.wllama = new Wllama(config);
            await loadModel(attempt + 1);
          } else {
            throw err;
          }
        }
      };

      await loadModel(1);

      const loadTime = Date.now() - loadStartTime;
      if (loadTime < 5000) {
        console.log(`⚡ [Wllama] Model loaded in ${loadTime}ms - likely from cache!`);
      } else {
        console.log(`📥 [Wllama] Model downloaded and cached in ${Math.round(loadTime / 1000)}s`);
      }

      onProgress?.(95, i18nStore.t('models.progress.modelProcessed'));

      this.isInitialized = true;

      console.log('✅ Wllama initialized successfully (WASM/CPU)');
      onProgress?.(100, i18nStore.t('models.progress.modelReady') + ' (CPU)');
    } catch (error) {
      console.error('❌ Failed to initialize Wllama:', error);
      this.isInitialized = false;
      
      // Cleanup partially initialized instance
      if (this.wllama) {
        try {
          await this.wllama.exit();
        } catch (e) { console.warn('Error cleaning up after failure:', e); }
        this.wllama = null;
      }
      
      throw new Error(
        `Failed to initialize Wllama: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Generate embeddings for a text (for semantic search)
   * Wllama supports embeddings natively
   */
  async generateEmbedding(text: string): Promise<Float32Array> {
    if (!this.isInitialized || !this.wllama) {
      throw new Error('Wllama engine not initialized');
    }

    try {
      // IMPORTANT: Truncate text to max 512 chars for faster embedding generation
      // Wllama with CPU is very slow with long texts
      const maxLength = 512;
      const truncatedText = text.length > maxLength ? text.substring(0, maxLength) : text;

      if (text.length > maxLength) {
        console.log(`⚠️ Truncating text from ${text.length} to ${maxLength} chars for embedding`);
      }

      console.log(`🔢 Generating embedding for ${truncatedText.length} chars...`);
      const startTime = Date.now();

      // Wllama supports embeddings via createEmbedding
      const result = await this.wllama.createEmbedding(truncatedText);

      const elapsed = Date.now() - startTime;
      console.log(`✅ Embedding generated in ${elapsed}ms`);

      return result;
    } catch (error) {
      console.error('❌ Wllama embedding failed:', error);
      throw error;
    }
  }

  /**
   * Generate text response using Wllama
   * Supports streaming for better UX
   */
  async generateText(
    input: string | { role: string; content: string | any[] }[],
    options: GenerationOptions = {}
  ): Promise<string> {
    if (!this.isInitialized || !this.wllama) {
      throw new Error('Wllama engine not initialized');
    }

    const {
      temperature = 0.7,
      maxTokens = 512,
      stop = [],
      onStream,
    } = options;

    try {
      console.log('💬 Generating text with Wllama (CPU)...');

      // IMPORTANT: Disable embeddings mode before text generation
      await this.wllama.setOptions({ embeddings: false });

      let prompt = '';
      let effectiveStop = [...(stop || [])];

      // Prepare input for template processing
      let messages: { role: string; content: string }[] = [];
      const extractedImages: string[] = [];
      
      if (Array.isArray(input)) {
        messages = input.map(msg => {
          if (Array.isArray(msg.content)) {
            // Handle mixed content (text + image)
            const textPart = msg.content.find((p: any) => p.type === 'text');
            const imageParts = msg.content.filter((p: any) => p.type === 'image_url');
            
            if (imageParts.length > 0) {
              imageParts.forEach((part: any) => {
                // Extract base64 data from data URL if present
                const url = part.image_url.url;
                if (url.startsWith('data:image')) {
                  // Keep the full data URL, wllama might handle parsing
                  extractedImages.push(url);
                } else {
                  extractedImages.push(url);
                }
              });
              console.log(`🖼️ Extracted ${imageParts.length} images for Wllama`);
            }
            
            return {
              role: msg.role,
              content: textPart ? textPart.text : ''
            };
          } else {
            return {
              role: msg.role,
              content: msg.content as string
            };
          }
        });
      } else {
        // Raw string
        messages = [{ role: 'user', content: input }];
      }

      // Detect model type for template
      const isQwen = this.modelUrl.toLowerCase().includes('qwen') || this.modelUrl.toLowerCase().includes('smollm') || this.modelUrl.toLowerCase().includes('lfm');
      const isLlama = this.modelUrl.toLowerCase().includes('llama') && !this.modelUrl.toLowerCase().includes('tiny');
      const isPhi = this.modelUrl.toLowerCase().includes('phi');

      if (isQwen) {
        // ChatML Template (Qwen, SmolLM, TinyLlama)
        prompt = messages.map(msg => 
          `<|im_start|>${msg.role}\n${msg.content}<|im_end|>`
        ).join('\n') + '\n<|im_start|>assistant\n';
        
        effectiveStop.push('<|im_end|>');
        effectiveStop.push('<|im_start|>');
      } else if (isLlama) {
        // Llama 3 Template
        prompt = `<|begin_of_text|>` + messages.map(msg => 
          `<|start_header_id|>${msg.role}<|end_header_id|>\n\n${msg.content}<|eot_id|>`
        ).join('') + `<|start_header_id|>assistant<|end_header_id|>\n\n`;
        
        effectiveStop.push('<|eot_id|>');
        effectiveStop.push('<|end_of_text|>');
      } else if (isPhi) {
        // Phi-3 Template
        prompt = messages.map(msg => 
          `<|${msg.role}|>\n${msg.content}<|end|>`
        ).join('\n') + '\n<|assistant|}\n';
        
        effectiveStop.push('<|end|>');
      } else {
        // Fallback: standard chat format
        prompt = messages.map(msg => 
          `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
        ).join('\n') + '\nAssistant:';
      }
      
      let fullResponse = '';

      if (onStream) {
        // Streaming mode
        await this.wllama.createCompletion(prompt, {
          nPredict: maxTokens,
          temp: temperature,
          stop: effectiveStop, // Pass stop tokens
          images: extractedImages, // Pass extracted images
          onNewToken: (_token: any, _piece: any, currentText: any) => {
            // Send incremental chunks
            const newChunk = currentText.slice(fullResponse.length);
            if (newChunk) {
              fullResponse = currentText;
              onStream(newChunk);
            }
          },
        });
      } else {
        // Non-streaming mode
        const result = await this.wllama.createCompletion(prompt, {
          nPredict: maxTokens,
          temp: temperature,
          stop: effectiveStop, // Pass stop tokens
          images: extractedImages, // Pass extracted images
        });
        fullResponse = result;
      }

      // Re-enable embeddings after text generation
      await this.wllama.setOptions({ embeddings: true });

      console.log('✅ Generated', fullResponse.length, 'characters (CPU)');
      return fullResponse;
    } catch (error) {
      console.error('❌ Text generation failed:', error);
      throw new Error(
        `Failed to generate text: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate embeddings in batch (parallel processing with concurrency limit)
   */
  async generateEmbeddingsBatch(
    texts: string[],
    maxConcurrent = 4,
    onProgress?: (progress: number, status: string) => void
  ): Promise<Float32Array[]> {
    if (!this.isInitialized || !this.wllama) {
      throw new Error('Wllama engine not initialized');
    }

    console.log(`🔢 Generating ${texts.length} embeddings in batch (concurrency=${maxConcurrent})...
`);

    const results: Float32Array[] = new Array(texts.length);
    const queue = texts.map((text, idx) => ({ text, idx }));
    let completed = 0;

    // Process in parallel with concurrency limit
    const workers = Array(maxConcurrent)
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;

          const { text, idx } = item;
          const truncated = text.substring(0, 512); // Truncate for speed

          try {
            const embedding = await this.wllama!.createEmbedding(truncated);
            results[idx] = embedding;
          } catch (error) {
            console.warn(`⚠️ Failed to generate embedding for text ${idx}:`, error);
            // Fallback: zero vector
            results[idx] = new Float32Array(384);
          }

          completed++;

          // Report progress every 5 completions
          if (completed % 5 === 0 || completed === texts.length) {
            const progress = Math.round((completed / texts.length) * 100);
            onProgress?.(progress, `${i18nStore.t('models.progress.embeddings')}: ${completed}/${texts.length}`);
          }
        }
      });

    await Promise.all(workers);

    console.log(`✅ Generated ${texts.length} embeddings in batch`);
    return results;
  }

  /**
   * Get the current backend being used
   */
  getBackend(): 'wasm' {
    return 'wasm';
  }

  /**
   * Check if the engine is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.wllama !== null;
  }

  /**
   * Get the current model URL
   */
  getModelUrl(): string {
    return this.modelUrl;
  }

  /**
   * Reset/unload the model (free memory)
   */
  async reset(): Promise<void> {
    if (this.wllama) {
      console.log('🔄 Resetting Wllama engine...');
      try {
        await this.wllama.exit();
      } catch (error) {
        console.warn('Error during Wllama exit:', error);
      }
      this.wllama = null;
      this.isInitialized = false;
      this.modelUrl = '';
      console.log('✅ Wllama engine reset');
    }
  }
}