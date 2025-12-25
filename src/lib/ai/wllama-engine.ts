// Wllama Engine - Pure WebAssembly CPU inference
// Adapted for local-first architecture (no external cache dependencies)

import { Wllama } from '@wllama/wllama';
import type { GenerationOptions, ProgressCallback } from './webllm-engine';
import { detectWasmFeatures, getRecommendedWllamaBuild, getOptimalThreadCount } from './wasm-features';

/**
 * Wllama Engine for pure WebAssembly CPU inference
 * Fallback option when WebGPU is not available
 * Uses llama.cpp compiled to WASM - no ONNX Runtime needed
 */
export class WllamaEngine {
  private wllama: Wllama | null = null;
  private modelUrl: string = '';
  private isInitialized: boolean = false;

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
    if (this.isInitialized && this.modelUrl === modelUrl) {
      console.log('✅ Wllama already initialized');
      return;
    }

    try {
      console.log('🚀 Initializing Wllama (WebAssembly CPU)...');
      onProgress?.(0, 'Inicializando motor WASM...');

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

      // Create Wllama instance with optimized WASM build
      // Point to WASM files in public directory
      const isMultiThread = recommendedBuild.path.includes('multi-thread');
      const basePath = isMultiThread
        ? '/wllama/multi-thread/wllama'
        : '/wllama/single-thread/wllama';

      // Configure paths for both single-thread and multi-thread variants
      const config: Record<string, string> = {
        'single-thread/wllama.wasm': basePath + '.wasm',
        'single-thread/wllama.js': basePath + '.js',
      };

      // Add multi-thread worker if using multi-thread build
      if (isMultiThread) {
        config['multi-thread/wllama.wasm'] = basePath + '.wasm';
        config['multi-thread/wllama.js'] = basePath + '.js';
        config['multi-thread/wllama.worker.mjs'] = '/wllama/multi-thread/wllama.worker.mjs';
      }

      this.wllama = new Wllama(config);

      onProgress?.(10, 'Verificando caché...');

      // Use Wllama's built-in cache manager (OPFS)
      // This will cache the model locally and avoid re-downloading
      console.log('💾 [Wllama] Checking OPFS cache for model...');
      const loadStartTime = Date.now();
      let isLoadingFromCache = false;
      let lastLoaded = 0;

      await this.wllama.loadModelFromUrl(this.modelUrl, {
        n_ctx: 2048,
        embeddings: true, // Enable embeddings support
        n_threads: optimalThreads, // Use optimal thread count
        progressCallback: ({ loaded, total }) => {
          if (total > 0) {
            // Detect if loading from cache (instant progress jumps)
            if (loaded > lastLoaded + 50 * 1024 * 1024 && Date.now() - loadStartTime < 1000) {
              isLoadingFromCache = true;
            }
            lastLoaded = loaded;

            const percent = Math.round((loaded / total) * 70);
            const loadedMB = Math.round(loaded / 1024 / 1024);
            const totalMB = Math.round(total / 1024 / 1024);

            const cacheStatus = isLoadingFromCache ? ' (desde caché OPFS ⚡)' : ' (descargando...)';
            onProgress?.(10 + percent, `${loadedMB}MB / ${totalMB}MB${cacheStatus}`);

            if (loaded === total && isLoadingFromCache) {
              console.log('✅ [Wllama] Model loaded from OPFS cache (no download needed!)');
            }
          }
        },
      });

      const loadTime = Date.now() - loadStartTime;
      if (loadTime < 5000) {
        console.log(`⚡ [Wllama] Model loaded in ${loadTime}ms - likely from cache!`);
      } else {
        console.log(`📥 [Wllama] Model downloaded and cached in ${Math.round(loadTime / 1000)}s`);
      }

      onProgress?.(95, 'Modelo procesado...');

      this.isInitialized = true;

      console.log('✅ Wllama initialized successfully (WASM/CPU)');
      onProgress?.(100, 'Modelo cargado (CPU)');
    } catch (error) {
      console.error('❌ Failed to initialize Wllama:', error);
      this.isInitialized = false;
      throw new Error(
        `Failed to initialize Wllama: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
      // IMPORTANT: Truncate text to max 256 chars for faster embedding generation
      // Wllama with CPU is very slow with long texts
      const maxLength = 256;
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
    prompt: string,
    options: GenerationOptions = {}
  ): Promise<string> {
    if (!this.isInitialized || !this.wllama) {
      throw new Error('Wllama engine not initialized');
    }

    const {
      temperature = 0.7,
      maxTokens = 512,
      onStream,
    } = options;

    try {
      console.log('💬 Generating text with Wllama (CPU)...');

      // IMPORTANT: Disable embeddings mode before text generation
      await this.wllama.setOptions({ embeddings: false });

      let fullResponse = '';

      if (onStream) {
        // Streaming mode
        await this.wllama.createCompletion(prompt, {
          nPredict: maxTokens,
          temp: temperature,
          onNewToken: (_token, _piece, currentText) => {
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

    console.log(`🔢 Generating ${texts.length} embeddings in batch (concurrency=${maxConcurrent})...`);

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
          const truncated = text.substring(0, 256); // Truncate for speed

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
            onProgress?.(progress, `Embeddings: ${completed}/${texts.length}`);
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
