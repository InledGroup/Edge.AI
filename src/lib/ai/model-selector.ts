// Intelligent Model Selection
// Selects optimal model and quantization based on device capabilities

import type { GPUTierConfig } from './gpu-limits';

export interface ModelRecommendation {
  modelName: string;
  displayName: string;
  size: string;
  quantization: string;
  reason: string;
}

/**
 * Select optimal model quantization based on device capabilities
 * Q4_K_M: Best balance of quality/speed (default)
 * Q0_F16: Ultra-small for very limited devices
 */
export function selectOptimalModel(
  memoryGB: number,
  hasWebGPU: boolean,
  gpuConfig: GPUTierConfig | null
): ModelRecommendation {
  // Critical: < 2GB RAM - use smallest model
  if (memoryGB < 2) {
    return {
      modelName: 'SmolLM2-135M-Instruct-q0f16-MLC',
      displayName: 'SmolLM2 135M',
      size: '135MB',
      quantization: 'Q0_F16',
      reason: 'Dispositivo con muy poca RAM (<2GB)',
    };
  }

  // No WebGPU: CPU-only, prioritize speed over quality
  if (!hasWebGPU) {
    if (memoryGB >= 4) {
      return {
        modelName: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
        displayName: 'Qwen 2.5 0.5B',
        size: '350MB',
        quantization: 'Q4_F16',
        reason: 'Sin WebGPU, modelo pequeño para CPU',
      };
    }

    return {
      modelName: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
      displayName: 'SmolLM2 360M',
      size: '200MB',
      quantization: 'Q4_F16',
      reason: 'Sin WebGPU, RAM limitada',
    };
  }

  // With WebGPU: use GPU tier to decide
  if (gpuConfig) {
    const tier = gpuConfig.tier;

    if (tier === 'discrete' && memoryGB >= 8) {
      return {
        modelName: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
        displayName: 'Phi-3.5 Mini',
        size: '1.9GB',
        quantization: 'Q4_F16',
        reason: 'GPU discreta, mejor calidad',
      };
    }

    if (tier === 'integrated' && memoryGB >= 6) {
      return {
        modelName: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        displayName: 'Llama 3.2 1B',
        size: '700MB',
        quantization: 'Q4_F16',
        reason: 'GPU integrada, buen balance',
      };
    }

    if (tier === 'discrete' && memoryGB >= 6) {
      return {
        modelName: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        displayName: 'Llama 3.2 1B',
        size: '700MB',
        quantization: 'Q4_F16',
        reason: 'GPU discreta con RAM moderada',
      };
    }
  }

  // Safe default: works on most devices with WebGPU
  return {
    modelName: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    displayName: 'Qwen 2.5 0.5B',
    size: '350MB',
    quantization: 'Q4_F16',
    reason: 'Modelo por defecto, compatible con la mayoría de dispositivos',
  };
}

/**
 * Validate if a model can run on the device
 */
export function validateModelForDevice(
  modelName: string,
  memoryGB: number,
  gpuConfig: GPUTierConfig | null
): { canRun: boolean; reason?: string } {
  // Model size estimates (in MB)
  const modelSizes: Record<string, number> = {
    'SmolLM2-135M-Instruct-q0f16-MLC': 135,
    'SmolLM2-360M-Instruct-q4f16_1-MLC': 200,
    'Qwen2.5-0.5B-Instruct-q4f16_1-MLC': 350,
    'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC': 550,
    'Llama-3.2-1B-Instruct-q4f16_1-MLC': 700,
    'Qwen2.5-1.5B-Instruct-q4f16_1-MLC': 900,
    'Phi-3.5-mini-instruct-q4f16_1-MLC': 1900,
    'Llama-3.2-3B-Instruct-q4f16_1-MLC': 1600,
  };

  const modelSize = modelSizes[modelName] || 500;
  const modelSizeGB = modelSize / 1024;

  // Check RAM
  if (modelSizeGB > memoryGB * 0.6) {
    // Model should use max 60% of RAM
    return {
      canRun: false,
      reason: `Modelo requiere ${modelSize}MB, pero el dispositivo solo tiene ${memoryGB}GB RAM`,
    };
  }

  // Check GPU buffer size if WebGPU
  if (gpuConfig) {
    const modelSizeBytes = modelSize * 1024 * 1024;
    if (modelSizeBytes > gpuConfig.recommendedModelSize) {
      return {
        canRun: false,
        reason: `Modelo demasiado grande para GPU (${modelSize}MB vs ${Math.round(gpuConfig.recommendedModelSize / 1024 / 1024)}MB límite)`,
      };
    }
  }

  return { canRun: true };
}
