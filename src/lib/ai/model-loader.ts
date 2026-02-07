/**
 * Model Auto-Loader
 * Automatically loads saved default models on app startup
 */

import { getDefaultModelIds } from './model-settings';
import { getModelById } from './model-registry';
import { WebLLMEngine } from './webllm-engine';
import { WllamaEngine } from './wllama-engine';
import EngineManager from './engine-manager';
import { modelsStore } from '@/lib/stores';
import { detectDeviceProfile } from './device-profile';

/**
 * Auto-load default models if they exist
 * Returns true if models were loaded, false if not configured yet
 */
export async function autoLoadModels(
  onProgress?: (type: 'chat' | 'embedding', progress: number, message: string) => void
): Promise<boolean> {
  const { chatModelId, embeddingModelId } = getDefaultModelIds();

  // No default models saved yet
  if (!chatModelId || !embeddingModelId) {
    console.log('⚠️ No default models configured');
    return false;
  }

  // Ensure persistent storage for mobile devices
  if (navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      console.log(`💾 Storage persistence enabled: ${isPersisted}`);
    } catch (e) {
      console.warn('Failed to request storage persistence:', e);
    }
  }

  console.log('🔄 Auto-loading saved models:', { chatModelId, embeddingModelId });

  try {
    // Load models sequentially to avoid OPFS access handle conflicts
    // Especially critical on mobile devices where OPFS resources are limited
    await loadSavedChatModel(chatModelId, onProgress);
    await loadSavedEmbeddingModel(embeddingModelId, onProgress);

    console.log('✅ Models auto-loaded successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to auto-load models:', error);
    return false;
  }
}

/**
 * Load saved chat model
 */
async function loadSavedChatModel(
  modelId: string,
  onProgress?: (type: 'chat' | 'embedding', progress: number, message: string) => void
): Promise<void> {
  const model = getModelById(modelId);
  if (!model) {
    throw new Error(`Model ${modelId} not found in registry`);
  }

  modelsStore.setChatLoading(true);

  try {
    // Detect device capabilities to choose engine
    const deviceProfile = await detectDeviceProfile();

    let engine: WebLLMEngine | WllamaEngine;
    let engineName: string;
    let modelUrl: string;

    if (deviceProfile.hasWebGPU && model.webllmModelId) {
      // Use WebLLM with GPU
      console.log('🚀 Loading chat model with WebLLM (GPU)');
      engine = new WebLLMEngine();
      engineName = 'webllm';
      modelUrl = model.webllmModelId;

      await engine.initialize(modelUrl, (progress, status) => {
        onProgress?.('chat', progress, status);
      });
    } else if (model.ggufUrl) {
      // Use Wllama with CPU
      console.log('🚀 Loading chat model with Wllama (CPU)');
      engine = new WllamaEngine();
      engineName = 'wllama';
      modelUrl = model.ggufUrl;

      await engine.initialize(modelUrl, (progress, status) => {
        onProgress?.('chat', progress, status);
      });
    } else {
      throw new Error('No compatible model URL found');
    }

    // Register engine
    EngineManager.setChatEngine(engine, model.id);

    // Update store
    modelsStore.setChatModel({
      id: model.id,
      name: model.displayName,
      type: 'chat',
      engine: engineName,
      contextSize: model.contextSize,
      requiresGPU: model.requiresWebGPU,
      sizeGB: model.sizeGB
    });

    console.log('✅ Chat model loaded:', model.displayName);
  } finally {
    modelsStore.setChatLoading(false);
  }
}

/**
 * Load saved embedding model
 */
async function loadSavedEmbeddingModel(
  modelId: string,
  onProgress?: (type: 'chat' | 'embedding', progress: number, message: string) => void
): Promise<void> {
  const model = getModelById(modelId);
  if (!model) {
    throw new Error(`Model ${modelId} not found in registry`);
  }

  modelsStore.setEmbeddingLoading(true);

  try {
    let engine: WllamaEngine | WebLLMEngine;
    let engineName: string;

    // Check if model uses WebLLM (e.g. Snowflake Arctic GPU)
    if (model.engine === 'webllm' && model.webllmModelId) {
       console.log('🚀 Loading embedding model with WebLLM (GPU)');
       const webllmEngine = new WebLLMEngine();
       engine = webllmEngine;
       engineName = 'webllm';
       
       await webllmEngine.initialize(model.webllmModelId, (progress, status) => {
          onProgress?.('embedding', progress, status);
       });
    } else {
      // Default to Wllama (CPU)
      const wllamaEngine = new WllamaEngine();
      engine = wllamaEngine;
      engineName = 'wllama';
      const modelUrl = model.ggufUrl;

      if (!modelUrl) {
        throw new Error('No GGUF URL for embedding model');
      }

      console.log('🚀 Loading embedding model with Wllama');

      await wllamaEngine.initialize(modelUrl, (progress, status) => {
        onProgress?.('embedding', progress, status);
      });
    }

    // Register engine
    // @ts-ignore
    EngineManager.setEmbeddingEngine(engine, model.id);

    // Update store
    modelsStore.setEmbeddingModel({
      id: model.id,
      name: model.displayName,
      type: 'embedding',
      engine: engineName,
      contextSize: model.contextSize,
      requiresGPU: model.requiresWebGPU,
      sizeGB: model.sizeGB
    });

    console.log('✅ Embedding model loaded:', model.displayName);
  } finally {
    modelsStore.setEmbeddingLoading(false);
  }
}
