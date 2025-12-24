// Wllama Engine - Pure WebAssembly CPU inference
// Uses llama.cpp via WebAssembly (no ONNX Runtime dependencies)

import { Wllama } from '@wllama/wllama';
import type { GenerationOptions, ProgressCallback } from './webllm-engine';
import { detectWasmFeatures, getRecommendedWllamaBuild, getOptimalThreadCount } from './wasm-features';
import { multiLevelCache } from '../cache/multi-level-cache';

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
      const wasmPath = recommendedBuild.path;
      this.wllama = new Wllama({
        [`${wasmPath}`]: `https://unpkg.com/@wllama/wllama@2.3.7/esm/${wasmPath}`,
        [`${wasmPath.replace('.wasm', '.js')}`]: `https://unpkg.com/@wllama/wllama@2.3.7/esm/${wasmPath.replace('.wasm', '.js')}`,
      });

      onProgress?.(10, 'Comprobando caché...');

      // Initialize cache if not already done
      await multiLevelCache.init();

      // Try to get model from L3 cache (Cache API)
      let modelBlob = await multiLevelCache.getModel(this.modelUrl);

      if (modelBlob) {
        console.log('✅ Model found in cache');
        onProgress?.(50, 'Cargando desde caché...');
      } else {
        console.log('📥 Model not in cache, downloading...');
        onProgress?.(10, 'Descargando modelo...');

        // Download model manually with progress tracking
        const response = await fetch(this.modelUrl);
        if (!response.ok) {
          throw new Error(`Failed to download model: ${response.statusText}`);
        }

        const contentLength = parseInt(response.headers.get('content-length') || '0');
        const reader = response.body?.getReader();

        if (!reader) {
          throw new Error('Cannot read response body');
        }

        const chunks: Uint8Array[] = [];
        let receivedLength = 0;

        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          chunks.push(value);
          receivedLength += value.length;

          if (contentLength > 0) {
            const percent = Math.round((receivedLength / contentLength) * 70);
            onProgress?.(10 + percent, `Descargando: ${Math.round(receivedLength / 1024 / 1024)}MB`);
          }
        }

        // Combine chunks into single Uint8Array
        const modelBuffer = new Uint8Array(receivedLength);
        let position = 0;
        for (const chunk of chunks) {
          modelBuffer.set(chunk, position);
          position += chunk.length;
        }

        console.log('✅ Model downloaded, caching for future use...');
        onProgress?.(85, 'Guardando en caché...');

        // Create blob and cache it
        modelBlob = new Blob([modelBuffer], { type: 'application/octet-stream' });

        // Cache the model for future use (non-blocking)
        multiLevelCache.setModel(this.modelUrl, modelBlob).catch((error) => {
          console.warn('⚠️ Failed to cache model (non-fatal):', error);
        });
      }

      console.log('✅ Model ready, loading into Wllama...');
      onProgress?.(90, 'Cargando modelo en memoria...');

      // Load model from blob array with optimal configuration
      await this.wllama.loadModel([modelBlob], {
        n_ctx: 2048,
        embeddings: true, // Enable embeddings support
        n_threads: optimalThreads, // Use optimal thread count
      });

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
  async generateEmbedding(text: string): Promise<number[]> {
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

      return Array.from(result);
    } catch (error) {
      console.warn('⚠️ Wllama embedding failed, using fallback:', error);

      // Fallback: simple hash-based embedding
      const embedding = new Array(384).fill(0);
      for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        embedding[i % 384] += charCode / 1000;
      }

      // Normalize
      const magnitude = Math.sqrt(
        embedding.reduce((sum, val) => sum + val * val, 0)
      );
      return embedding.map((val) => val / magnitude);
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
      // Wllama doesn't allow createCompletion when embeddings is enabled
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

      // Re-enable embeddings after text generation for future embedding calls
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
   * Generate embeddings in batch (parallel processing with concurrency limit)
   * Much faster than sequential processing
   */
  async generateEmbeddingsBatch(
    texts: string[],
    maxConcurrent = 4,
    onProgress?: (progress: number, status: string) => void
  ): Promise<number[][]> {
    if (!this.isInitialized || !this.wllama) {
      throw new Error('Wllama engine not initialized');
    }

    console.log(`🔢 Generating ${texts.length} embeddings in batch (concurrency=${maxConcurrent})...`);

    const results: number[][] = new Array(texts.length);
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
            results[idx] = Array.from(embedding);
          } catch (error) {
            console.warn(`⚠️ Failed to generate embedding for text ${idx}:`, error);
            // Fallback: zero vector
            results[idx] = new Array(384).fill(0);
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
