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
  engine: 'webllm' | 'wllama' | 'transformers';
  secondaryEngine?: 'transformers'; // For multimodal processing

  // Model URLs
  webllmModelId?: string;  // For WebLLM (MLC models)
  ggufUrl?: string;        // For Wllama (GGUF models)
  hfModelId?: string;      // For Transformers.js (HF Repo ID)

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

  // Capabilities
  supportsVision?: boolean;

  // Tags for categorization
  tags: string[];
}

/**
 * Complete registry of available models
 */
export const MODEL_REGISTRY: ModelMetadata[] = [
  // ========================================================================
  // VISION MODELS
  // ========================================================================
  {
    id: 'phi-3.5-vision',
    name: 'Phi-3.5-vision-instruct',
    displayName: 'Phi-3.5 Vision (Multimodal)',
    description: 'Modelo avanzado de Microsoft con capacidad de visión nativa. Puede ver y analizar imágenes.',
    type: 'chat',
    engine: 'webllm',
    webllmModelId: 'Phi-3.5-vision-instruct-q4f32_1-MLC',
    sizeGB: 2.4,
    speed: 'medium',
    quality: 'excellent',
    quantization: 'q4',
    minMemoryGB: 4,
    preferredMemoryGB: 8,
    requiresWebGPU: true,
    contextSize: 4096,
    supportsVision: true,
    tags: ['large', 'phi', 'vision', 'gpu']
  },

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
    id: 'lfm-2-audio-1.5b',
    name: 'LFM2-Audio-1.5B',
    displayName: 'LFM2 Audio 1.5B (Live)',
    description: 'Modelo especializado en conversación por voz. Ideal para el modo Live.',
    type: 'chat',
    engine: 'wllama',
    secondaryEngine: 'transformers',
    ggufUrl: 'https://huggingface.co/LiquidAI/LFM2-Audio-1.5B-GGUF/resolve/main/LFM2-Audio-1.5B-Q8_0.gguf',
    hfModelId: 'kyutai/mimi', // Using the standard Mimi repo for decoding
    sizeGB: 1.6,
    speed: 'fast',
    quality: 'good',
    quantization: 'q8',
    minMemoryGB: 3,
    preferredMemoryGB: 6,
    requiresWebGPU: false,
    contextSize: 4096,
    tags: ['medium', 'audio', 'live']
  },
  {
    id: 'lfm-2.5-1.6b-q4',
    name: 'LFM-2.5-1.6B-Q4',
    displayName: 'LFM 2.5 1.6B (Ligero)',
    description: 'Modelo LiquidAI eficiente. Arquitectura innovadora y rápida (1.1GB).',
    type: 'chat',
    engine: 'wllama',
    ggufUrl: 'https://huggingface.co/LiquidAI/LFM2.5-VL-1.6B-GGUF/resolve/main/LFM2.5-VL-1.6B-Q4_0.gguf',
    sizeGB: 1.1,
    speed: 'fast',
    quality: 'good',
    quantization: 'q4',
    minMemoryGB: 2,
    preferredMemoryGB: 4,
    requiresWebGPU: false,
    contextSize: 4096,
    tags: ['medium', 'liquid', 'balanced']
  },
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
  {
    id: 'lfm2-1.2b-tool',
    name: 'LFM2-1.2B-Tool',
    displayName: 'LFM2 Tool (Agente/Emergencia)',
    description: 'Activar solo en caso de fallo repetitivo de otros modelos. Nota: Este modelo es más lento.',
    type: 'chat',
    engine: 'wllama',
    ggufUrl: 'https://huggingface.co/LiquidAI/LFM2-1.2B-Tool-GGUF/resolve/main/LFM2-1.2B-Tool-Q4_0.gguf',
    sizeGB: 0.7,
    speed: 'very-fast',
    quality: 'excellent',
    quantization: 'q4',
    minMemoryGB: 2,
    preferredMemoryGB: 4,
    requiresWebGPU: false,
    contextSize: 8192,
    tags: ['specialized', 'tool', 'agent']
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
    name: 'Qwen2-0.5B-Instruct',
    displayName: 'Qwen2 0.5B (CPU / Seguro)',
    description: 'Opción clásica y segura. Funciona siempre en CPU.',
    type: 'embedding',
    engine: 'wllama',
    ggufUrl: 'https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf',
    sizeGB: 0.35,
    speed: 'fast',
    quality: 'good',
    quantization: 'q4',
    minMemoryGB: 1,
    preferredMemoryGB: 2,
    requiresWebGPU: false,
    contextSize: 2048,
    tags: ['embedding', 'cpu', 'reliable']
  },
  {
    id: 'snowflake-arctic-embed-m-gpu',
    name: 'Snowflake Arctic Embed M',
    displayName: 'Arctic Embed M (GPU / Ultra Rápido)',
    description: 'Modelo profesional de embeddings. Requiere WebGPU. Muy alta precisión.',
    type: 'embedding',
    engine: 'webllm',
    webllmModelId: 'snowflake-arctic-embed-m-q0f32-MLC-b32',
    sizeGB: 0.1, // ~100MB
    speed: 'very-fast',
    quality: 'excellent',
    quantization: 'q0f32',
    minMemoryGB: 2,
    preferredMemoryGB: 4,
    requiresWebGPU: true,
    contextSize: 512,
    tags: ['embedding', 'gpu', 'recommended']
  },
  {
    id: 'snowflake-arctic-embed-s-gpu',
    name: 'Snowflake Arctic Embed S',
    displayName: 'Arctic Embed S (GPU / Instantáneo)',
    description: 'Versión ligera de Arctic. Instantáneo en WebGPU.',
    type: 'embedding',
    engine: 'webllm',
    webllmModelId: 'snowflake-arctic-embed-s-q0f32-MLC-b32',
    sizeGB: 0.03, // ~30MB
    speed: 'very-fast',
    quality: 'good',
    quantization: 'q0f32',
    minMemoryGB: 1,
    preferredMemoryGB: 2,
    requiresWebGPU: true,
    contextSize: 512,
    tags: ['embedding', 'gpu', 'fast']
  },

  // ========================================================================
  // ADVANCED RAG MODELS (Fudan High-Perf)
  // ========================================================================
  {
    id: 'bge-m3',
    name: 'BGE-M3',
    displayName: 'BGE-M3 (Dense Embedding)',
    description: 'Modelo de embedding denso de alto rendimiento para búsqueda semántica.',
    type: 'embedding',
    engine: 'transformers',
    hfModelId: 'Xenova/bge-m3',
    sizeGB: 1.1,
    speed: 'fast',
    quality: 'excellent',
    minMemoryGB: 2,
    preferredMemoryGB: 4,
    requiresWebGPU: false,
    contextSize: 8192,
    tags: ['advanced-rag', 'embedding', 'transformers']
  },
  {
    id: 'bge-reranker',
    name: 'bge-reranker-base',
    displayName: 'BGE Reranker (Cross-Encoder)',
    description: 'Modelo de alta precisión para reordenar documentos por relevancia.',
    type: 'chat', 
    engine: 'transformers',
    hfModelId: 'Xenova/bge-reranker-base',
    sizeGB: 0.8,
    speed: 'fast',
    quality: 'excellent',
    minMemoryGB: 2,
    preferredMemoryGB: 4,
    requiresWebGPU: false,
    contextSize: 512,
    tags: ['advanced-rag', 'reranker', 'transformers']
  },
  {
    id: 'bert-multilingual',
    name: 'bert-base-multilingual-cased',
    displayName: 'BERT Multilingual (Classifier)',
    description: 'Modelo para clasificación de consultas y detección de intención.',
    type: 'chat',
    engine: 'transformers',
    hfModelId: 'Xenova/bert-base-multilingual-cased',
    sizeGB: 0.7,
    speed: 'fast',
    quality: 'excellent',
    minMemoryGB: 1,
    preferredMemoryGB: 2,
    requiresWebGPU: false,
    contextSize: 512,
    tags: ['advanced-rag', 'classifier', 'transformers']
  },
  {
    id: 'flan-t5-large',
    name: 'flan-t5-base-ONNX',
    displayName: 'Flan-T5 Base (ONNX)',
    description: 'Modelo estable para generación de hipótesis y compresión de contexto.',
    type: 'chat',
    engine: 'transformers',
    hfModelId: 'onnx-community/flan-t5-base-ONNX',
    sizeGB: 1.1,
    speed: 'medium',
    quality: 'excellent',
    minMemoryGB: 4,
    preferredMemoryGB: 8,
    requiresWebGPU: false,
    contextSize: 2048,
    tags: ['advanced-rag', 'generator', 'transformers']
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
