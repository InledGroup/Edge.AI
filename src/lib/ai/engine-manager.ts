import { WebLLMEngine } from './webllm-engine';
import { WllamaEngine } from './wllama-engine';
import { TransformersEngine } from './transformers-engine';
import type { ProgressCallback } from './webllm-engine';
import { getModelById } from './model-registry';
import { modelsStore } from '../stores';

let chatEngineInstance: WebLLMEngine | WllamaEngine | TransformersEngine | null = null;
let embeddingEngineInstance: WebLLMEngine | WllamaEngine | TransformersEngine | null = null;
let toolEngineInstance: WllamaEngine | null = null; // Specialized for MCP tools
let liveEngineInstance: WllamaEngine | TransformersEngine | null = null;
let liveInitializationPromise: Promise<WllamaEngine | TransformersEngine> | null = null;
let toolInitializationPromise: Promise<WllamaEngine> | null = null;

let chatModelName: string = '';
let embeddingModelName: string = '';
let liveModelName: string = '';
const TOOL_MODEL_URL = 'https://huggingface.co/LiquidAI/LFM2-1.2B-Tool-GGUF/resolve/main/LFM2-1.2B-Tool-Q4_0.gguf';

export const EngineManager = {
  async getChatEngine(modelName?: string, onProgress?: ProgressCallback): Promise<WebLLMEngine | WllamaEngine | TransformersEngine> {
    const targetId = modelName || modelsStore.chat?.id || chatModelName;
    if (!targetId) throw new Error('No chat model selected');

    if (!chatEngineInstance || targetId !== chatModelName) {
      console.log(`🔄 Initializing chat engine with model: ${targetId}`);
      const meta = getModelById(targetId);
      if (!meta) throw new Error(`Model ${targetId} not found`);
      
      if (meta.engine === 'transformers') {
        chatEngineInstance = new TransformersEngine();
        await (chatEngineInstance as TransformersEngine).initialize(meta.hfModelId || targetId, onProgress);
      } else if (meta.engine === 'webllm' || meta.requiresWebGPU) {
        chatEngineInstance = new WebLLMEngine();
        await (chatEngineInstance as WebLLMEngine).initialize(meta.webllmModelId || targetId, onProgress);
      } else {
        chatEngineInstance = new WllamaEngine();
        await (chatEngineInstance as WllamaEngine).initialize(meta.ggufUrl || targetId, onProgress);
      }
      chatModelName = targetId;
    }
    return chatEngineInstance!;
  },

  async getEmbeddingEngine(modelName?: string, onProgress?: ProgressCallback): Promise<WebLLMEngine | WllamaEngine | TransformersEngine> {
    const targetId = modelName || modelsStore.embedding?.id || embeddingModelName;
    if (!targetId) throw new Error('No embedding model selected');

    if (!embeddingEngineInstance || targetId !== embeddingModelName) {
      console.log(`🔄 Initializing embedding engine with model: ${targetId}`);
      const meta = getModelById(targetId);
      if (!meta) throw new Error(`Model ${targetId} not found`);

      if (meta.engine === 'transformers') {
        embeddingEngineInstance = new TransformersEngine();
        await (embeddingEngineInstance as TransformersEngine).initialize(meta.hfModelId || targetId, onProgress);
      } else if (meta.engine === 'webllm' || meta.webllmModelId) {
        embeddingEngineInstance = new WebLLMEngine();
        await (embeddingEngineInstance as WebLLMEngine).initialize(meta.webllmModelId || targetId, onProgress);
      } else {
        embeddingEngineInstance = new WllamaEngine();
        await (embeddingEngineInstance as WllamaEngine).initialize(meta.ggufUrl || targetId, onProgress);
      }
      embeddingModelName = targetId;
    }
    return embeddingEngineInstance!;
  },

  /**
   * Get the specialized Tool Engine (LiquidAI LFM2-1.2B-Tool)
   */
  async getToolEngine(onProgress?: ProgressCallback): Promise<WllamaEngine> {
    if (toolInitializationPromise) return toolInitializationPromise;
    if (toolEngineInstance && toolEngineInstance.isReady()) return toolEngineInstance;

    toolInitializationPromise = (async () => {
      try {
        console.log('🛠️ Initializing Specialized Tool Engine...');
        const engine = new WllamaEngine();
        await engine.initialize(TOOL_MODEL_URL, onProgress);
        toolEngineInstance = engine;
        return engine;
      } finally {
        toolInitializationPromise = null;
      }
    })();
    return toolInitializationPromise;
  },

  setChatEngine(engine: WebLLMEngine | WllamaEngine | TransformersEngine, name: string) {
    chatEngineInstance = engine;
    chatModelName = name;
  },

  setEmbeddingEngine(engine: WebLLMEngine | WllamaEngine | TransformersEngine, name: string) {
    embeddingEngineInstance = engine;
    embeddingModelName = name;
  },

  async getLiveEngine(modelName: string = 'lfm-2-audio-1.5b', onProgress?: ProgressCallback): Promise<WllamaEngine | TransformersEngine> {
    if (liveInitializationPromise) return liveInitializationPromise;
    if (liveEngineInstance && modelName === liveModelName && liveEngineInstance.isReady()) {
      return liveEngineInstance;
    }

    liveInitializationPromise = (async () => {
      try {
        const meta = getModelById(modelName);
        let engine: WllamaEngine | TransformersEngine;
        
        if (meta?.engine === 'transformers') {
           engine = new TransformersEngine();
           await engine.initialize(meta.hfModelId || modelName, onProgress);
        } else {
           engine = new WllamaEngine();
           await engine.initialize(meta?.ggufUrl || modelName, onProgress);
        }
        
        liveEngineInstance = engine;
        liveModelName = modelName;
        return engine;
      } finally {
        liveInitializationPromise = null;
      }
    })();
    return liveInitializationPromise;
  },

  isChatEngineReady() { return !!chatEngineInstance?.isReady(); },
  isLiveEngineReady() { return !!liveEngineInstance?.isReady(); },
  isToolEngineReady() { return !!toolEngineInstance?.isReady(); },
  isEmbeddingEngineReady() { return !!embeddingEngineInstance?.isReady(); },

  async resetChatEngine() {
    if (chatEngineInstance) {
      await chatEngineInstance.reset();
      chatEngineInstance = null;
      chatModelName = '';
    }
  },

  async resetLiveEngine() {
    if (liveEngineInstance) {
      await liveEngineInstance.reset();
      liveEngineInstance = null;
      liveModelName = '';
    }
  },

  async resetToolEngine() {
    if (toolEngineInstance) {
      await toolEngineInstance.reset();
      toolEngineInstance = null;
    }
  },

  async resetEmbeddingEngine() {
    if (embeddingEngineInstance) {
      await embeddingEngineInstance.reset();
      embeddingEngineInstance = null;
      embeddingModelName = '';
    }
  },

  async resetAll() {
    await Promise.all([
      this.resetChatEngine(),
      this.resetLiveEngine(),
      this.resetToolEngine(),
      this.resetEmbeddingEngine()
    ]);
  },

  getModelNames() {
    return { chat: chatModelName, embedding: embeddingModelName, live: liveModelName };
  }
};

export default EngineManager;
