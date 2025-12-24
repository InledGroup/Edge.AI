// ModelSelector Island - Select and load AI models

import { useState, useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ProgressBar } from './ui/ProgressBar';
import { modelsStore, modelsReady } from '@/lib/stores';
import { Check, X, CheckCircle2, Cpu, Zap } from 'lucide-preact';
import { probeActualLimits } from '@/lib/ai/gpu-limits';
import { selectOptimalModel } from '@/lib/ai/model-selector';
import { WebLLMEngine } from '@/lib/ai/webllm-engine';
import { WllamaEngine } from '@/lib/ai/wllama-engine';
import EngineManager from '@/lib/ai/engine-manager';

interface LoadingState {
  progress: number;
  message: string;
}

const chatLoadingState = signal<LoadingState | null>(null);
const embeddingLoadingState = signal<LoadingState | null>(null);
const capabilities = signal<{
  hasWebGPU: boolean;
  memoryGB: number;
  gpuTier?: string;
} | null>(null);

/**
 * Convert MLC model name to GGUF model URL for Wllama
 * Maps WebLLM model names to their GGUF equivalents
 */
function convertToGGUFModel(mlcModelName: string): string {
  // Map of MLC models to GGUF URLs
  const modelMap: Record<string, string> = {
    // SmolLM2 models
    'SmolLM2-135M-Instruct-q0f16-MLC':
      'https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct-GGUF/resolve/main/smollm2-135m-instruct-q4_k_m.gguf',
    'SmolLM2-360M-Instruct-q4f16_1-MLC':
      'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q4_k_m.gguf',

    // Qwen models
    'Qwen2.5-0.5B-Instruct-q4f16_1-MLC':
      'https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf',
    'Qwen2.5-1.5B-Instruct-q4f16_1-MLC':
      'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',

    // TinyLlama
    'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC':
      'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',

    // Llama models
    'Llama-3.2-1B-Instruct-q4f16_1-MLC':
      'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    'Llama-3.2-3B-Instruct-q4f16_1-MLC':
      'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',

    // Phi models
    'Phi-3.5-mini-instruct-q4f16_1-MLC':
      'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
  };

  // If we have a direct mapping, use it
  if (modelMap[mlcModelName]) {
    return modelMap[mlcModelName];
  }

  // Default fallback: Qwen2-0.5B (smallest, fastest)
  console.warn(`⚠️ No GGUF mapping for ${mlcModelName}, using default Qwen2-0.5B`);
  return 'https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf';
}

export function ModelSelector() {
  const [initialized, setInitialized] = useState(false);
  const [autoLoadAttempted, setAutoLoadAttempted] = useState(false);

  useEffect(() => {
    detectCapabilities();
    setInitialized(true);
  }, []);

  // Auto-load models after capabilities are detected
  useEffect(() => {
    if (initialized && capabilities.value && !autoLoadAttempted) {
      setAutoLoadAttempted(true);
      console.log('🚀 Auto-loading models...');

      // Load both models automatically
      loadChatModel().catch(err => {
        console.error('Failed to auto-load chat model:', err);
      });

      loadEmbeddingModel().catch(err => {
        console.error('Failed to auto-load embedding model:', err);
      });
    }
  }, [initialized, capabilities.value, autoLoadAttempted]);

  async function detectCapabilities() {
    try {
      const gpuLimits = await probeActualLimits();
      const hasWebGPU = gpuLimits !== null;

      // Estimate available memory (rough)
      const memoryGB = (navigator as any).deviceMemory || 4;

      capabilities.value = {
        hasWebGPU,
        memoryGB,
        gpuTier: gpuLimits?.tier
      };

      console.log('💻 Capabilities:', capabilities.value);
    } catch (error) {
      console.error('Failed to detect capabilities:', error);
      capabilities.value = {
        hasWebGPU: false,
        memoryGB: 4
      };
    }
  }

  async function loadChatModel() {
    if (!capabilities.value) {
      alert('Capabilities not detected yet');
      return;
    }

    try {
      modelsStore.setChatLoading(true);
      chatLoadingState.value = { progress: 0, message: 'Inicializando...' };

      // Get recommended model
      const recommended = selectOptimalModel(
        capabilities.value.memoryGB,
        capabilities.value.hasWebGPU,
        null // TODO: pass GPU config
      );

      console.log('🎯 Recommended chat model:', recommended);

      // CRITICAL: Choose engine based on WebGPU availability
      let engine: WebLLMEngine | WllamaEngine;
      let engineName: string;
      let modelUrl: string;

      if (capabilities.value.hasWebGPU) {
        // Use WebLLM with GPU
        console.log('🚀 Using WebLLM (GPU acceleration)');
        engine = new WebLLMEngine();
        engineName = 'webllm';
        modelUrl = recommended.modelName;

        await engine.initialize(modelUrl, (progress, status) => {
          chatLoadingState.value = { progress, message: status };
        });
      } else {
        // Use Wllama with CPU (no WebGPU)
        console.log('🚀 Using Wllama (CPU, no WebGPU available)');
        engine = new WllamaEngine();
        engineName = 'wllama';

        // Convert MLC model name to GGUF URL
        modelUrl = convertToGGUFModel(recommended.modelName);
        console.log(`📦 Loading GGUF model: ${modelUrl}`);

        await engine.initialize(modelUrl, (progress, status) => {
          chatLoadingState.value = { progress, message: status };
        });
      }

      // Register engine instance in global manager
      EngineManager.setChatEngine(engine, recommended.modelName);

      modelsStore.setChatModel({
        id: recommended.modelName,
        name: recommended.displayName,
        type: 'chat',
        engine: engineName,
        contextSize: 2048,
        requiresGPU: capabilities.value.hasWebGPU,
        sizeGB: parseFloat(recommended.size) / 1000
      });

      chatLoadingState.value = null;
      console.log('✅ Chat model loaded');
    } catch (error) {
      console.error('❌ Failed to load chat model:', error);
      alert(`Error loading model: ${error}`);
      chatLoadingState.value = null;
    } finally {
      modelsStore.setChatLoading(false);
    }
  }

  async function loadEmbeddingModel() {
    try {
      modelsStore.setEmbeddingLoading(true);
      embeddingLoadingState.value = { progress: 0, message: 'Inicializando...' };

      const engine = new WllamaEngine();

      // Use default small model for embeddings
      await engine.initialize(undefined, (progress, status) => {
        embeddingLoadingState.value = { progress, message: status };
      });

      // Register engine instance in global manager
      EngineManager.setEmbeddingEngine(engine, 'qwen2-0.5b-embed');

      modelsStore.setEmbeddingModel({
        id: 'qwen2-0.5b-embed',
        name: 'Qwen2 0.5B (Embeddings)',
        type: 'embedding',
        engine: 'wllama',
        contextSize: 2048,
        requiresGPU: false,
        sizeGB: 0.35
      });

      embeddingLoadingState.value = null;
      console.log('✅ Embedding model loaded');
    } catch (error) {
      console.error('❌ Failed to load embedding model:', error);
      alert(`Error loading embedding model: ${error}`);
      embeddingLoadingState.value = null;
    } finally {
      modelsStore.setEmbeddingLoading(false);
    }
  }

  if (!initialized) {
    return (
      <Card>
        <div className="text-center py-8">
          <div className="spinner text-[var(--color-primary)] mx-auto mb-2" />
          <p className="text-sm text-[var(--color-text-secondary)]">
            Detectando capacidades...
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">Modelos de IA</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Carga los modelos necesarios para el funcionamiento local
          </p>
        </div>

        {/* Capabilities Info */}
        {capabilities.value && (
          <div className="text-xs text-[var(--color-text-tertiary)] space-y-1">
            <div className="flex items-center gap-1.5">
              {capabilities.value.hasWebGPU ? (
                <Zap size={12} className="text-amber-400" />
              ) : (
                <Cpu size={12} />
              )}
              {capabilities.value.hasWebGPU ? 'WebGPU disponible' : 'Solo CPU'}
            </div>
            {capabilities.value.gpuTier && (
              <div>Tier: {capabilities.value.gpuTier}</div>
            )}
            <div>Memoria: ~{capabilities.value.memoryGB}GB</div>
          </div>
        )}

        {/* Chat Model */}
        <div className="border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="font-medium">Modelo de Chat</h4>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Para generar respuestas
              </p>
            </div>
            <div>
              {modelsStore.chat ? (
                <span className="text-sm text-[var(--color-success)] font-medium">
                  ✓ Cargado
                </span>
              ) : (
                <Button
                  onClick={loadChatModel}
                  loading={modelsStore.chatLoading}
                  disabled={modelsStore.chatLoading}
                  size="sm"
                >
                  Cargar
                </Button>
              )}
            </div>
          </div>

          {chatLoadingState.value && (
            <ProgressBar
              progress={chatLoadingState.value.progress}
              label={chatLoadingState.value.message}
              size="sm"
            />
          )}

          {modelsStore.chat && (
            <div className="mt-2 text-xs text-[var(--color-text-tertiary)]">
              {modelsStore.chat.name} ({modelsStore.chat.engine})
            </div>
          )}
        </div>

        {/* Embedding Model */}
        <div className="border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h4 className="font-medium">Modelo de Embeddings</h4>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Para búsqueda semántica
              </p>
            </div>
            <div>
              {modelsStore.embedding ? (
                <span className="text-sm text-[var(--color-success)] font-medium">
                  ✓ Cargado
                </span>
              ) : (
                <Button
                  onClick={loadEmbeddingModel}
                  loading={modelsStore.embeddingLoading}
                  disabled={modelsStore.embeddingLoading}
                  size="sm"
                >
                  Cargar
                </Button>
              )}
            </div>
          </div>

          {embeddingLoadingState.value && (
            <ProgressBar
              progress={embeddingLoadingState.value.progress}
              label={embeddingLoadingState.value.message}
              size="sm"
            />
          )}

          {modelsStore.embedding && (
            <div className="mt-2 text-xs text-[var(--color-text-tertiary)]">
              {modelsStore.embedding.name} ({modelsStore.embedding.engine})
            </div>
          )}
        </div>

        {/* Status Summary */}
        {modelsReady.value && (
          <div className="bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-[var(--color-success)]" />
            <p className="text-sm text-[var(--color-success)] font-medium">
              Todos los modelos listos
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
