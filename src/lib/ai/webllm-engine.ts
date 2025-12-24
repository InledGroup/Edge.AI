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
      console.log('⚙️ WebGPU config:', webgpuConfig);

      // Create MLCEngine instance - requires WebGPU
      this.engine = new webllm.MLCEngine();

      onProgress?.(20, `Cargando modelo ${modelName}...`);

      // Load the model with optimized configuration
      console.log(`📥 Downloading WebLLM model: ${modelName}`);
      await this.engine.reload(modelName, {
        context_window_size: webgpuConfig.max_window_size,
        // @ts-ignore - advanced options
        max_batch_size: webgpuConfig.max_batch_size,
        // @ts-ignore - initProgressCallback exists but might not be in types
        initProgressCallback: (report: webllm.InitProgressReport) => {
          const progress = Math.round(report.progress * 70) + 20; // 20-90%
          const status = report.text || 'Cargando...';
          onProgress?.(progress, status);
          console.log(`[WebLLM] ${Math.round(report.progress * 100)}% - ${status}`);
        },
      });

      console.log('✅ WebLLM model loaded successfully');

      // WARM-UP: Generate 1 token to initialize GPU pipeline
      console.log('🔥 Warming up GPU pipeline...');
      onProgress?.(95, 'Calentando modelo...');

      await this.engine.chat.completions.create({
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1,
        temperature: 0.7,
      });

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
   * NOTE: WebLLM doesn't support embeddings
   * This method should NOT be called - use WllamaEngine instead
   */
  async generateEmbedding(text: string): Promise<Float32Array> {
    throw new Error(
      'WebLLM does not support embeddings. Use WllamaEngine for embeddings instead.'
    );
  }

  /**
   * Generate text response using WebLLM
   * Supports streaming for better UX
   */
  async generateText(
    prompt: string,
    options: GenerationOptions = {}
  ): Promise<string> {
    if (!this.isInitialized || !this.engine) {
      throw new Error('WebLLM engine not initialized');
    }

    const {
      temperature = 0.7,
      maxTokens = 512,
      topP = 0.95,
      onStream,
    } = options;

    try {
      console.log('💬 Generating text with WebLLM...');

      if (onStream) {
        // Streaming mode
        let fullResponse = '';

        const completion = await this.engine.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: maxTokens,
          top_p: topP,
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
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: maxTokens,
          top_p: topP,
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
