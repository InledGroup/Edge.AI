// Device capability detection for AI model selection
// Detects WebGPU support, memory, and recommends the best backend

import { probeActualLimits, type GPUTierConfig } from './gpu-limits';
import { selectOptimalModel, type ModelRecommendation } from './model-selector';

export interface DeviceCapabilities {
  hasWebGPU: boolean;
  gpuTier: 'none' | 'low' | 'medium' | 'high';
  gpuConfig: GPUTierConfig | null;
  estimatedMemoryGB: number;
  hasSufficientMemory: boolean;
  recommendedBackend: 'huggingface' | 'webllm-gpu' | 'wllama-cpu';
  recommendedModel: string;
  modelRecommendation: ModelRecommendation | null;
  canUseWebLLM: boolean;
}

/**
 * Check if WebGPU is available in the browser
 * Now uses probeActualLimits for more detailed detection
 */
export async function checkWebGPU(): Promise<boolean> {
  const gpuConfig = await probeActualLimits();
  return gpuConfig !== null;
}

/**
 * Estimate GPU tier based on actual GPU limits
 * Now uses probeActualLimits for accurate detection
 */
async function estimateGPUTier(): Promise<'none' | 'low' | 'medium' | 'high'> {
  const gpuConfig = await probeActualLimits();

  if (!gpuConfig) return 'none';

  // Map GPUTierConfig tier to our tier system
  switch (gpuConfig.tier) {
    case 'discrete':
      return 'high';
    case 'integrated':
      return 'medium';
    case 'mobile':
      return 'low';
    default:
      return 'none';
  }
}

/**
 * Estimate device memory (RAM) in GB
 */
function estimateMemory(): number {
  try {
    // @ts-ignore - deviceMemory is experimental
    if (navigator.deviceMemory) {
      // @ts-ignore
      return navigator.deviceMemory as number;
    }

    // Fallback: estimate based on hardware concurrency (rough heuristic)
    const cores = navigator.hardwareConcurrency || 2;
    if (cores >= 8) return 8;
    if (cores >= 4) return 4;
    return 2;
  } catch (error) {
    console.warn('Memory estimation failed, assuming 4GB');
    return 4;
  }
}

/**
 * Check if device has sufficient memory for WebLLM
 * Minimum: 4GB for small models, 8GB+ recommended for larger models
 */
function checkSufficientMemory(memoryGB: number): boolean {
  return memoryGB >= 4;
}

/**
 * Recommend the best model based on device capabilities
 * Now uses intelligent model selector
 */
function recommendModel(capabilities: Partial<DeviceCapabilities>): string {
  const { hasWebGPU, estimatedMemoryGB, gpuConfig } = capabilities;

  const recommendation = selectOptimalModel(
    estimatedMemoryGB || 4,
    hasWebGPU || false,
    gpuConfig || null
  );

  console.log(`📊 Model recommendation: ${recommendation.displayName} (${recommendation.reason})`);

  return recommendation.modelName;
}

/**
 * Recommend the best AI backend based on device capabilities
 * IMPORTANT: This does NOT check if HuggingFace API key is available.
 * The recommendation is based purely on device capabilities.
 * HuggingFace backend will only be used if the user explicitly provides an API key.
 */
function recommendBackend(
  hasWebGPU: boolean,
  gpuTier: 'none' | 'low' | 'medium' | 'high',
  hasSufficientMemory: boolean
): 'huggingface' | 'webllm-gpu' | 'wllama-cpu' {
  // If WebGPU is available and memory is sufficient, use WebLLM with GPU
  if (hasWebGPU && hasSufficientMemory && (gpuTier === 'medium' || gpuTier === 'high')) {
    return 'webllm-gpu';
  }

  // CRITICAL: If no WebGPU or insufficient memory, ALWAYS fallback to Wllama CPU
  // This handles:
  // - Desktop without GPU (uses wllama)
  // - Mobile with low memory (uses wllama with small model)
  // - Any device where WebGPU is not available
  console.log('⚠️ No WebGPU available or insufficient memory, using Wllama (CPU/WASM)');
  return 'wllama-cpu';
}

/**
 * Detect all device capabilities and return recommendations
 */
export async function detectDeviceCapabilities(): Promise<DeviceCapabilities> {
  console.log('🔍 Detecting device capabilities...');

  const gpuConfig = await probeActualLimits();
  const hasWebGPU = gpuConfig !== null;
  const gpuTier = await estimateGPUTier();
  const estimatedMemoryGB = estimateMemory();
  const hasSufficientMemory = checkSufficientMemory(estimatedMemoryGB);

  // Get model recommendation
  const modelRecommendation = selectOptimalModel(
    estimatedMemoryGB,
    hasWebGPU,
    gpuConfig
  );

  const capabilities: DeviceCapabilities = {
    hasWebGPU,
    gpuTier,
    gpuConfig,
    estimatedMemoryGB,
    hasSufficientMemory,
    recommendedBackend: 'wllama-cpu', // will be set below
    recommendedModel: modelRecommendation.modelName,
    modelRecommendation,
    canUseWebLLM: hasWebGPU && hasSufficientMemory,
  };

  capabilities.recommendedBackend = recommendBackend(
    hasWebGPU,
    gpuTier,
    hasSufficientMemory
  );

  console.log('📊 Device capabilities:', {
    WebGPU: hasWebGPU ? '✅' : '❌',
    'GPU Tier': gpuTier,
    'GPU Config': gpuConfig ? `${gpuConfig.tier} (${Math.round(gpuConfig.maxBufferSize / 1024 / 1024)}MB buffer)` : 'N/A',
    'Memory (GB)': estimatedMemoryGB,
    'Sufficient Memory': hasSufficientMemory ? '✅' : '❌',
    'Recommended Backend': capabilities.recommendedBackend,
    'Recommended Model': `${modelRecommendation.displayName} (${modelRecommendation.size})`,
    'Reason': modelRecommendation.reason,
  });

  return capabilities;
}

/**
 * Get a human-readable description of the backend
 */
export function getBackendDescription(
  backend: 'huggingface' | 'webllm-gpu' | 'webllm-cpu'
): string {
  switch (backend) {
    case 'huggingface':
      return '🚀 HuggingFace API (rápido, requiere conexión)';
    case 'webllm-gpu':
      return '⚡ WebLLM con GPU (rápido, funciona offline)';
    case 'webllm-cpu':
      return '🐢 WebLLM con CPU (lento, funciona offline)';
  }
}

/**
 * Check if a specific model is available for WebLLM
 * All WebLLM models end with '-MLC' suffix
 */
export function isWebLLMModel(modelName: string): boolean {
  // All WebLLM models end with '-MLC' or '-MLC-1k' or similar patterns
  return modelName.includes('-MLC');
}

/**
 * Get list of available WebLLM models with metadata
 */
export interface WebLLMModelInfo {
  name: string;
  displayName: string;
  size: string;
  description: string;
  minMemoryGB: number;
  recommended: boolean;
}

export function getAvailableWebLLMModels(): WebLLMModelInfo[] {
  return [
    {
      name: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      displayName: 'Llama 3.2 1B (Recomendado)',
      size: '~700 MB',
      description: 'Rápido y eficiente. Meta Llama 3.2',
      minMemoryGB: 2,
      recommended: true,
    },
    {
      name: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
      displayName: 'Llama 3.2 3B',
      size: '~1.6 GB',
      description: 'Mejor calidad. Meta Llama 3.2',
      minMemoryGB: 4,
      recommended: true,
    },
    {
      name: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
      displayName: 'Phi-3.5 Mini',
      size: '~1.9 GB',
      description: 'Versátil y potente. Microsoft Phi-3.5',
      minMemoryGB: 6,
      recommended: true,
    },
    {
      name: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
      displayName: 'Qwen 2.5 1.5B',
      size: '~900 MB',
      description: 'Equilibrado. Alibaba Qwen 2.5',
      minMemoryGB: 3,
      recommended: true,
    },
    {
      name: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC',
      displayName: 'TinyLlama 1.1B',
      size: '~550 MB',
      description: 'Muy ligero, calidad básica',
      minMemoryGB: 2,
      recommended: false,
    },
    {
      name: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
      displayName: 'Qwen 2.5 0.5B',
      size: '~300 MB',
      description: 'Modelo pequeño, rápido en CPU',
      minMemoryGB: 2,
      recommended: false,
    },
    {
      name: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
      displayName: 'SmolLM2 360M',
      size: '~200 MB',
      description: 'Ultraligero para dispositivos limitados',
      minMemoryGB: 1,
      recommended: false,
    },
    {
      name: 'SmolLM2-135M-Instruct-q0f16-MLC',
      displayName: 'SmolLM2 135M (Mínimo)',
      size: '~135 MB',
      description: 'El más pequeño disponible',
      minMemoryGB: 1,
      recommended: false,
    },
  ];
}
