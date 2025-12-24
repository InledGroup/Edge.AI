// Engine Manager - Singleton pattern for AI model instances
// Ensures models are initialized once and reused across the app

import { WebLLMEngine } from './webllm-engine';
import { WllamaEngine } from './wllama-engine';
import type { ProgressCallback } from './webllm-engine';

/**
 * Global singleton instances of AI engines
 * These are shared across the entire application
 */
class EngineManager {
  private static chatEngineInstance: WebLLMEngine | null = null;
  private static embeddingEngineInstance: WllamaEngine | null = null;
  private static chatModelName: string = '';
  private static embeddingModelName: string = '';

  /**
   * Initialize or get the chat engine (WebLLM)
   * Returns existing instance if already initialized with same model
   */
  static async getChatEngine(
    modelName?: string,
    onProgress?: ProgressCallback
  ): Promise<WebLLMEngine> {
    // If no instance exists, create one
    if (!this.chatEngineInstance) {
      console.log('🆕 Creating new WebLLM chat engine instance');
      this.chatEngineInstance = new WebLLMEngine();
    }

    // If model name provided and different from current, reinitialize
    if (modelName && modelName !== this.chatModelName) {
      console.log(`🔄 Initializing chat engine with model: ${modelName}`);
      await this.chatEngineInstance.initialize(modelName, onProgress);
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
  static setChatEngine(engine: WebLLMEngine, modelName: string): void {
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
