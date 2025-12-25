/**
 * Model Registry
 * Centralized catalog of available AI models with metadata
 */

export interface ModelMetadata {
  // Identity
  id: string;
  name: string;
  displayName: string;
  description: string;

  // Type
  type: 'chat' | 'embedding';

  // Engine
  engine: 'webllm' | 'wllama';

  // Model URLs
  webllmModelId?: string;  // For WebLLM (MLC models)
  ggufUrl?: string;        // For Wllama (GGUF models)

  // Size
  sizeGB: number;

  // Performance characteristics
  speed: 'very-fast' | 'fast' | 'medium' | 'slow';
  quality: 'basic' | 'good' | 'excellent';
  quantization?: 'q4' | 'q5' | 'q8' | 'f16';

  // Requirements
  minMemoryGB: number;
  preferredMemoryGB: number;
  requiresWebGPU: boolean;

  // Context
  contextSize: number;

  // Tags for categorization
  tags: string[];
}

/**
 * Complete registry of available models
 */
export const MODEL_REGISTRY: ModelMetadata[] = [
  // ========================================================================
  // CHAT MODELS - Small (< 1GB)
  // ========================================================================
  {
    id: 'smollm2-135m',
    name: 'SmolLM2-135M-Instruct',
    displayName: 'SmolLM2 135M (Ultra Rápido)',
    description: 'Modelo ultraligero ideal para dispositivos limitados. Respuestas muy rápidas con calidad básica.',
    type: 'chat',
    engine: 'webllm',
    webllmModelId: 'SmolLM2-135M-Instruct-q0f16-MLC',
    ggufUrl: 'https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct-GGUF/resolve/main/smollm2-135m-instruct-q4_k_m.gguf',
    sizeGB: 0.08,
    speed: 'very-fast',
    quality: 'basic',
    quantization: 'q4',
    minMemoryGB: 1,
    preferredMemoryGB: 2,
    requiresWebGPU: false,
    contextSize: 2048,
    tags: ['tiny', 'fast', 'basic']
  },
  {
    id: 'smollm2-360m',
    name: 'SmolLM2-360M-Instruct',
    displayName: 'SmolLM2 360M (Rápido)',
    description: 'Modelo pequeño pero capaz. Buen equilibrio entre velocidad y calidad.',
    type: 'chat',
    engine: 'webllm',
    webllmModelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    ggufUrl: 'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q4_k_m.gguf',
    sizeGB: 0.22,
    speed: 'very-fast',
    quality: 'good',
    quantization: 'q4',
    minMemoryGB: 1,
    preferredMemoryGB: 2,
    requiresWebGPU: false,
    contextSize: 2048,
    tags: ['small', 'fast', 'balanced']
  },
  {
    id: 'qwen2-0.5b',
    name: 'Qwen2.5-0.5B-Instruct',
    displayName: 'Qwen2.5 0.5B (Rápido)',
    description: 'Modelo ligero de Alibaba. Excelente para tareas simples con poca latencia.',
    type: 'chat',
    engine: 'webllm',
    webllmModelId: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    ggufUrl: 'https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf',
    sizeGB: 0.35,
    speed: 'very-fast',
    quality: 'good',
    quantization: 'q4',
    minMemoryGB: 1,
    preferredMemoryGB: 2,
    requiresWebGPU: false,
    contextSize: 2048,
    tags: ['small', 'fast', 'qwen']
  },

  // ========================================================================
  // CHAT MODELS - Medium (1-2GB)
  // ========================================================================
  {
    id: 'tinyllama-1.1b',
    name: 'TinyLlama-1.1B-Chat',
    displayName: 'TinyLlama 1.1B (Equilibrado)',
    description: 'Modelo compacto basado en Llama. Buena calidad con requisitos moderados.',
    type: 'chat',
    engine: 'webllm',
    webllmModelId: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC',
    ggufUrl: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    sizeGB: 0.67,
    speed: 'fast',
    quality: 'good',
    quantization: 'q4',
    minMemoryGB: 2,
    preferredMemoryGB: 4,
    requiresWebGPU: false,
    contextSize: 2048,
    tags: ['medium', 'llama', 'balanced']
  },
  {
    id: 'llama-3.2-1b',
    name: 'Llama-3.2-1B-Instruct',
    displayName: 'Llama 3.2 1B (Alta Calidad)',
    description: 'Modelo oficial de Meta. Excelente calidad en tamaño compacto.',
    type: 'chat',
    engine: 'webllm',
    webllmModelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    ggufUrl: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    sizeGB: 0.76,
    speed: 'fast',
    quality: 'excellent',
    quantization: 'q4',
    minMemoryGB: 2,
    preferredMemoryGB: 4,
    requiresWebGPU: false,
    contextSize: 2048,
    tags: ['medium', 'llama', 'quality']
  },
  {
    id: 'qwen2-1.5b',
    name: 'Qwen2.5-1.5B-Instruct',
    displayName: 'Qwen2.5 1.5B (Recomendado)',
    description: 'Modelo equilibrado de Alibaba. Excelente relación calidad/rendimiento.',
    type: 'chat',
    engine: 'webllm',
    webllmModelId: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    ggufUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    sizeGB: 1.0,
    speed: 'fast',
    quality: 'excellent',
    quantization: 'q4',
    minMemoryGB: 2,
    preferredMemoryGB: 4,
    requiresWebGPU: false,
    contextSize: 2048,
    tags: ['medium', 'qwen', 'recommended']
  },

  // ========================================================================
  // CHAT MODELS - Large (3GB+)
  // ========================================================================
  {
    id: 'llama-3.2-3b',
    name: 'Llama-3.2-3B-Instruct',
    displayName: 'Llama 3.2 3B (Máxima Calidad)',
    description: 'Modelo grande de Meta. Máxima calidad, requiere WebGPU y buena memoria.',
    type: 'chat',
    engine: 'webllm',
    webllmModelId: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    ggufUrl: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeGB: 2.0,
    speed: 'medium',
    quality: 'excellent',
    quantization: 'q4',
    minMemoryGB: 4,
    preferredMemoryGB: 8,
    requiresWebGPU: true,
    contextSize: 4096,
    tags: ['large', 'llama', 'quality', 'gpu']
  },
  {
    id: 'phi-3.5-mini',
    name: 'Phi-3.5-mini-instruct',
    displayName: 'Phi 3.5 Mini (Avanzado)',
    description: 'Modelo de Microsoft Research. Alta capacidad de razonamiento, requiere WebGPU.',
    type: 'chat',
    engine: 'webllm',
    webllmModelId: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    ggufUrl: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
    sizeGB: 2.4,
    speed: 'medium',
    quality: 'excellent',
    quantization: 'q4',
    minMemoryGB: 4,
    preferredMemoryGB: 8,
    requiresWebGPU: true,
    contextSize: 4096,
    tags: ['large', 'phi', 'reasoning', 'gpu']
  },

  // ========================================================================
  // EMBEDDING MODELS
  // ========================================================================
  {
    id: 'qwen2-0.5b-embed',
    name: 'Qwen2-0.5B-Embeddings',
    displayName: 'Qwen2 0.5B (Embeddings)',
    description: 'Modelo ligero para búsqueda semántica. Funciona en CPU sin problemas.',
    type: 'embedding',
    engine: 'wllama',
    ggufUrl: 'https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf',
    sizeGB: 0.35,
    speed: 'very-fast',
    quality: 'good',
    quantization: 'q4',
    minMemoryGB: 1,
    preferredMemoryGB: 2,
    requiresWebGPU: false,
    contextSize: 2048,
    tags: ['embedding', 'fast']
  }
];

/**
 * Get model by ID
 */
export function getModelById(id: string): ModelMetadata | undefined {
  return MODEL_REGISTRY.find(m => m.id === id);
}

/**
 * Get all chat models
 */
export function getChatModels(): ModelMetadata[] {
  return MODEL_REGISTRY.filter(m => m.type === 'chat');
}

/**
 * Get all embedding models
 */
export function getEmbeddingModels(): ModelMetadata[] {
  return MODEL_REGISTRY.filter(m => m.type === 'embedding');
}

/**
 * Get models by tag
 */
export function getModelsByTag(tag: string): ModelMetadata[] {
  return MODEL_REGISTRY.filter(m => m.tags.includes(tag));
}
