// Engine Manager - Singleton pattern for AI model instances
// Ensures models are initialized once and reused across the app

import { WebLLMEngine } from './webllm-engine';
import { WllamaEngine } from './wllama-engine';
import type { ProgressCallback } from './webllm-engine';
import { getModelById } from './model-registry';

/**
 * Global singleton instances of AI engines
 * These are shared across the entire application
 */
class EngineManager {
  private static chatEngineInstance: WebLLMEngine | WllamaEngine | null = null;
  private static embeddingEngineInstance: WllamaEngine | null = null;
  private static chatModelName: string = '';
  private static embeddingModelName: string = '';

  /**
   * Initialize or get the chat engine (WebLLM with Wllama fallback)
   * Returns existing instance if already initialized with same model
   */
  static async getChatEngine(
    modelName?: string,
    onProgress?: ProgressCallback
  ): Promise<WebLLMEngine | WllamaEngine> {
    // If no instance exists, start with WebLLM
    if (!this.chatEngineInstance) {
      console.log('🆕 Creating new WebLLM chat engine instance');
      this.chatEngineInstance = new WebLLMEngine();
    }

    // If model name provided and different from current, reinitialize
    if (modelName && modelName !== this.chatModelName) {
      console.log(`🔄 Initializing chat engine with model: ${modelName}`);
      
      try {
        // First try: WebLLM (GPU)
        // Only try WebLLM if the current instance is a WebLLMEngine or if we haven't decided yet
        if (this.chatEngineInstance instanceof WebLLMEngine) {
           await this.chatEngineInstance.initialize(modelName, onProgress);
        } else {
           // If we are already using Wllama, maybe we should try WebLLM again?
           // No, if we are in Wllama mode, it's likely because GPU failed previously or user chose it.
           // BUT if the user explicitly selected a model that is WebLLM-capable, we should maybe try GPU again?
           // For now, let's assume if we are switching models, we try WebLLM first unless we know it fails.
           // Actually, easiest is to force try WebLLM if the model supports it.
           
           // Check if model requires WebGPU or if we should try it
           const modelMeta = getModelById(modelName);
           if (modelMeta?.engine === 'webllm') {
             console.log('🔄 Attempting to switch back to WebLLM for this model...');
             this.chatEngineInstance = new WebLLMEngine();
             await this.chatEngineInstance.initialize(modelName, onProgress);
           } else {
             // It's a Wllama model
             const wllamaInstance = this.chatEngineInstance as WllamaEngine;
             if (modelMeta?.ggufUrl) {
                await wllamaInstance.initialize(modelMeta.ggufUrl, onProgress);
             } else {
                throw new Error(`Model ${modelName} missing GGUF URL`);
             }
           }
        }
      } catch (error: any) {
        console.error('❌ WebLLM initialization failed:', error);
        
        // Check for GPU limit errors or other fatal WebGPU errors
        const isGpuLimitError = error.message?.includes('maxComputeWorkgroupStorageSize') || 
                                error.message?.includes('WebGPU') ||
                                error.message?.includes('adapter');
                                
        if (isGpuLimitError) {
          console.warn('⚠️ GPU limitations detected. Falling back to CPU (Wllama)...');
          onProgress?.(10, 'GPU no compatible/soportada. Cambiando a modo CPU...');
          
          // Find GGUF URL for fallback
          const modelMeta = getModelById(modelName);
          if (modelMeta && modelMeta.ggufUrl) {
            console.log(`🔄 Fallback: Using GGUF version of ${modelName}: ${modelMeta.ggufUrl}`);
            
            // Switch to WllamaEngine
            this.chatEngineInstance = new WllamaEngine();
            await this.chatEngineInstance.initialize(modelMeta.ggufUrl, onProgress);
            console.log('✅ Fallback to Wllama successful');
          } else {
            throw new Error(`WebLLM failed and no CPU fallback (GGUF URL) found for model ${modelName}`);
          }
        } else {
          // Re-throw if it's not a GPU error (e.g. network error)
          throw error;
        }
      }
      
      this.chatModelName = modelName;
    }

    // Verify engine is ready
    if (!this.chatEngineInstance.isReady()) {
      throw new Error(
        'Chat engine not initialized. Please load the chat model first from Model Selector.'
      );
    }

    return this.chatEngineInstance;
  }

  /**
   * Initialize or get the embedding engine (Wllama)
   * Returns existing instance if already initialized
   */
  static async getEmbeddingEngine(
    modelName?: string,
    onProgress?: ProgressCallback
  ): Promise<WllamaEngine> {
    // If no instance exists, create one
    if (!this.embeddingEngineInstance) {
      console.log('🆕 Creating new Wllama embedding engine instance');
      this.embeddingEngineInstance = new WllamaEngine();
    }

    // If model name provided and different from current, reinitialize
    if (modelName && modelName !== this.embeddingModelName) {
      console.log(`🔄 Initializing embedding engine with model: ${modelName || 'default'}`);
      await this.embeddingEngineInstance.initialize(modelName, onProgress);
      this.embeddingModelName = modelName || 'default';
    }

    // Verify engine is ready
    if (!this.embeddingEngineInstance.isReady()) {
      throw new Error(
        'Embedding engine not initialized. Please load the embedding model first from Model Selector.'
      );
    }

    return this.embeddingEngineInstance;
  }

  /**
   * Check if chat engine is ready
   */
  static isChatEngineReady(): boolean {
    return this.chatEngineInstance?.isReady() ?? false;
  }

  /**
   * Check if embedding engine is ready
   */
  static isEmbeddingEngineReady(): boolean {
    return this.embeddingEngineInstance?.isReady() ?? false;
  }

  /**
   * Set the chat engine instance (called by ModelSelector after initialization)
   */
  static setChatEngine(engine: WebLLMEngine | WllamaEngine, modelName: string): void {
    this.chatEngineInstance = engine;
    this.chatModelName = modelName;
    console.log('✅ Chat engine instance registered:', modelName);
  }

  /**
   * Set the embedding engine instance (called by ModelSelector after initialization)
   */
  static setEmbeddingEngine(engine: WllamaEngine, modelName: string): void {
    this.embeddingEngineInstance = engine;
    this.embeddingModelName = modelName;
    console.log('✅ Embedding engine instance registered:', modelName);
  }

  /**
   * Reset chat engine (free memory)
   */
  static async resetChatEngine(): Promise<void> {
    if (this.chatEngineInstance) {
      await this.chatEngineInstance.reset();
      this.chatEngineInstance = null;
      this.chatModelName = '';
      console.log('🔄 Chat engine reset');
    }
  }

  /**
   * Reset embedding engine (free memory)
   */
  static async resetEmbeddingEngine(): Promise<void> {
    if (this.embeddingEngineInstance) {
      await this.embeddingEngineInstance.reset();
      this.embeddingEngineInstance = null;
      this.embeddingModelName = '';
      console.log('🔄 Embedding engine reset');
    }
  }

  /**
   * Reset all engines
   */
  static async resetAll(): Promise<void> {
    await Promise.all([
      this.resetChatEngine(),
      this.resetEmbeddingEngine()
    ]);
    console.log('🔄 All engines reset');
  }

  /**
   * Get current model names
   */
  static getModelNames(): { chat: string; embedding: string } {
    return {
      chat: this.chatModelName,
      embedding: this.embeddingModelName
    };
  }
}

export default EngineManager;
