// WebLLM Engine - Local AI inference in the browser
// Supports WebGPU (fast) - adapted for local-first architecture

import * as webllm from '@mlc-ai/web-llm';
import { probeActualLimits, getWebGPUConfig } from './gpu-limits';

/**
 * Get all available model IDs from the current WebLLM version
 */
export function getAvailableModelIds(): string[] {
  try {
    const models = webllm.prebuiltAppConfig.model_list.map((model) => model.model_id);
    console.log('📋 Available WebLLM models:', models);
    return models;
  } catch (error) {
    console.error('Failed to get available models:', error);
    return [];
  }
}

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  onStream?: (chunk: string) => void;
}

export interface ProgressCallback {
  (progress: number, status: string): void;
}

/**
 * WebLLM Engine for local AI inference
 * Requires WebGPU - no CPU fallback
 */
export class WebLLMEngine {
  private engine: webllm.MLCEngine | null = null;
  private modelName: string = '';
  private isInitialized: boolean = false;
  private backend: 'webgpu' = 'webgpu';

  constructor() {
    console.log('🤖 WebLLM Engine created');
  }

  /**
   * Initialize the WebLLM engine with a specific model
   * REQUIRES WebGPU - throws error if not available
   */
  async initialize(
    modelName: string,
    onProgress?: ProgressCallback
  ): Promise<void> {
    if (this.isInitialized && this.modelName === modelName) {
      console.log('✅ WebLLM already initialized with', modelName);
      return;
    }

    try {
      console.log('🚀 Initializing WebLLM with model:', modelName);
      onProgress?.(0, 'Inicializando WebLLM...');

      // Probe actual GPU limits
      const gpuLimits = await probeActualLimits();
      if (!gpuLimits) {
        throw new Error('WebGPU is required for WebLLM but is not available');
      }

      console.log('✅ WebGPU available, using GPU backend');
      console.log(`🎯 GPU Tier: ${gpuLimits.tier.toUpperCase()}`);

      onProgress?.(10, 'Usando backend: GPU (WebGPU)');

      // Get optimal WebGPU configuration based on GPU tier
      const webgpuConfig = getWebGPUConfig(gpuLimits.tier);
      
      // Override config for embedding models (Snowflake Arctic)
      // WebLLM Embedding requires context_window_size === prefill_chunk_size
      const isEmbeddingModel = modelName.toLowerCase().includes('embed');
      const overrideConfig = isEmbeddingModel 
        ? {
            context_window_size: 512, // Force small context for embeddings
            // @ts-ignore
            prefill_chunk_size: 512,  // Must match context window
            max_batch_size: 32        // Keep batch size reasonable
          }
        : {
            context_window_size: webgpuConfig.max_window_size,
            // @ts-ignore
            max_batch_size: webgpuConfig.max_batch_size,
          };

      console.log('⚙️ WebGPU config:', { ...webgpuConfig, ...overrideConfig });

      // Create MLCEngine instance - requires WebGPU
      this.engine = new webllm.MLCEngine();

      onProgress?.(20, `Verificando caché del modelo...`);

      // Load the model with optimized configuration
      // WebLLM automatically uses IndexedDB cache for models
      console.log(`💾 [WebLLM] Checking IndexedDB cache for model: ${modelName}`);
      const loadStartTime = Date.now();
      let firstProgressTime = 0;

      await this.engine.reload(modelName, {
        ...overrideConfig,
        // @ts-ignore - initProgressCallback exists but might not be in types
        initProgressCallback: (report: webllm.InitProgressReport) => {
          if (firstProgressTime === 0) {
            firstProgressTime = Date.now();
          }

          const progress = Math.round(report.progress * 70) + 20; // 20-90%
          let status = report.text || 'Cargando...';

          // Detect cache usage based on progress speed
          const elapsed = Date.now() - loadStartTime;
          const isLikelyFromCache = elapsed < 3000 && report.progress > 0.1;

          if (isLikelyFromCache && !status.includes('caché')) {
            status += ' (desde caché IndexedDB ⚡)';
          } else if (!isLikelyFromCache && report.text?.includes('download')) {
            status += ' (descargando...)';
          }

          onProgress?.(progress, status);
          console.log(`[WebLLM] ${Math.round(report.progress * 100)}% - ${report.text}`);
        },
      });

      const loadTime = Date.now() - loadStartTime;
      if (loadTime < 10000) {
        console.log(`⚡ [WebLLM] Model loaded in ${Math.round(loadTime / 1000)}s - likely from IndexedDB cache!`);
      } else {
        console.log(`📥 [WebLLM] Model downloaded and cached in ${Math.round(loadTime / 1000)}s`);
      }
      console.log('✅ WebLLM model loaded successfully');

      // WARM-UP: Generate 1 token to initialize GPU pipeline
      console.log('🔥 Warming up GPU pipeline...');
      onProgress?.(95, 'Calentando modelo...');

      if (isEmbeddingModel) {
        // Warm up embedding pipeline
        // @ts-ignore
        if (this.engine.embeddings) {
           // @ts-ignore
           await this.engine.embeddings.create({
             input: "warmup",
             model: modelName
           });
        }
      } else {
        // Warm up chat pipeline
        await this.engine.chat.completions.create({
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 1,
          temperature: 0.7,
        });
      }

      console.log('✅ Model warmed up, ready for inference');

      this.modelName = modelName;
      this.isInitialized = true;

      console.log(`✅ WebLLM initialized successfully with ${this.backend.toUpperCase()}`);
      onProgress?.(100, 'Modelo listo (GPU)');
    } catch (error) {
      console.error('❌ Failed to initialize WebLLM:', error);
      this.isInitialized = false;
      throw new Error(
        `Failed to initialize WebLLM: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate embeddings for a text (for semantic search)
   * WebLLM now supports embeddings via the embeddings.create API
   */
  async generateEmbedding(text: string): Promise<Float32Array> {
    if (!this.isInitialized || !this.engine) {
      throw new Error('WebLLM engine not initialized');
    }

    try {
      console.log(`🔢 Generating embedding for ${text.length} chars (WebGPU)...`);
      const startTime = Date.now();

      // Check if engine supports embeddings
      // @ts-ignore
      if (!this.engine.embeddings) {
        throw new Error('This WebLLM version or model does not support embeddings');
      }

      // @ts-ignore
      const response = await this.engine.embeddings.create({
        input: text,
        model: this.modelName
      });

      const embedding = response.data[0].embedding;
      const result = new Float32Array(embedding);

      const elapsed = Date.now() - startTime;
      console.log(`✅ Embedding generated in ${elapsed}ms (GPU)`);

      return result;
    } catch (error) {
      console.error('❌ WebLLM embedding failed:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings in batch
   */
  async generateEmbeddingsBatch(
    texts: string[],
    maxConcurrent = 4, // Ignored for WebLLM as we send full batch
    onProgress?: (progress: number, status: string) => void
  ): Promise<Float32Array[]> {
    if (!this.isInitialized || !this.engine) {
      throw new Error('WebLLM engine not initialized');
    }

    try {
      console.log(`🔢 Generating ${texts.length} embeddings in batch (WebGPU)...`);
      const startTime = Date.now();

      // @ts-ignore
      if (!this.engine.embeddings) {
        throw new Error('This WebLLM version or model does not support embeddings');
      }

      // WebLLM supports batch input directly
      // @ts-ignore
      const response = await this.engine.embeddings.create({
        input: texts,
        model: this.modelName
      });

      // Map responses to Float32Array
      // @ts-ignore
      const results = response.data.map((item: any) => new Float32Array(item.embedding));

      const elapsed = Date.now() - startTime;
      console.log(`✅ Generated ${texts.length} embeddings in ${elapsed}ms (GPU Batch)`);
      
      return results;
    } catch (error) {
      console.error('❌ WebLLM batch embedding failed:', error);
      
      // Fallback: Process one by one if batch fails
      console.warn('⚠️ Batch failed, trying sequential processing...');
      const results: Float32Array[] = [];
      for (let i = 0; i < texts.length; i++) {
        const res = await this.generateEmbedding(texts[i]);
        results.push(res);
        onProgress?.(Math.round(((i + 1) / texts.length) * 100), `Embeddings: ${i + 1}/${texts.length}`);
      }
      return results;
    }
  }

  /**
   * Generate text response using WebLLM
   * Supports streaming for better UX
   */
  async generateText(
    input: string | { role: string; content: string }[],
    options: GenerationOptions = {}
  ): Promise<string> {
    if (!this.isInitialized || !this.engine) {
      throw new Error('WebLLM engine not initialized');
    }

    const {
      temperature = 0.7,
      maxTokens = 512,
      topP = 0.95,
      stop,
      onStream,
    } = options;

    try {
      console.log('💬 Generating text with WebLLM...');

      // Prepare messages
      const messages = Array.isArray(input) 
        ? input 
        : [{ role: 'user', content: input }];

      // @ts-ignore - WebLLM types might be strict about role strings
      const chatMessages = messages.map(m => ({ role: m.role, content: m.content }));

      if (onStream) {
        // Streaming mode
        let fullResponse = '';

        const completion = await this.engine.chat.completions.create({
          messages: chatMessages,
          temperature,
          max_tokens: maxTokens,
          top_p: topP,
          stop, // Pass stop tokens
          stream: true,
        });

        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;
            onStream(content);
          }
        }

        console.log('✅ Generated', fullResponse.length, 'characters');
        return fullResponse;
      } else {
        // Non-streaming mode
        const response = await this.engine.chat.completions.create({
          messages: chatMessages,
          temperature,
          max_tokens: maxTokens,
          top_p: topP,
          stop, // Pass stop tokens
          stream: false,
        });

        const generatedText = response.choices[0]?.message?.content || '';
        console.log('✅ Generated', generatedText.length, 'characters');
        return generatedText;
      }
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
  getBackend(): 'webgpu' {
    return this.backend;
  }

  /**
   * Check if the engine is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.engine !== null;
  }

  /**
   * Get the current model name
   */
  getModelName(): string {
    return this.modelName;
  }

  /**
   * Reset/unload the model (free memory)
   */
  async reset(): Promise<void> {
    if (this.engine) {
      console.log('🔄 Resetting WebLLM engine...');
      // WebLLM doesn't have an explicit unload, but we can recreate the engine
      this.engine = null;
      this.isInitialized = false;
      this.modelName = '';
      console.log('✅ WebLLM engine reset');
    }
  }

  /**
   * Get runtime statistics (if available)
   */
  async getRuntimeStats(): Promise<any> {
    if (!this.engine) return null;

    try {
      // @ts-ignore - runtimeStatsText might not be in types
      const stats = await this.engine.runtimeStatsText?.();
      return stats;
    } catch (error) {
      console.warn('Could not get runtime stats:', error);
      return null;
    }
  }
}
