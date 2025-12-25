/**
 * Model Scoring System
 * Calculates compatibility scores for models based on device capabilities
 */

import type { DeviceProfile } from './device-profile';
import type { ModelMetadata } from './model-registry';

export interface ModelScore {
  model: ModelMetadata;
  score: number; // 0-100
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  warnings: string[];
  recommendation: 'excellent' | 'good' | 'usable' | 'not-recommended';
}

/**
 * Score a single model against device capabilities
 */
export function scoreModel(
  model: ModelMetadata,
  device: DeviceProfile
): ModelScore {
  let score = 100;
  const reasons: string[] = [];
  const warnings: string[] = [];

  // ========================================================================
  // MEMORY CHECK (most critical)
  // ========================================================================
  if (model.minMemoryGB > device.estimatedAvailableMemoryGB) {
    score -= 50;
    warnings.push(`Requiere ${model.minMemoryGB}GB, solo hay ~${device.estimatedAvailableMemoryGB.toFixed(1)}GB disponibles`);
  } else if (model.preferredMemoryGB > device.estimatedAvailableMemoryGB) {
    score -= 20;
    warnings.push('Memoria justa, puede tener limitaciones');
  } else {
    reasons.push('Memoria suficiente');
  }

  // ========================================================================
  // WEBGPU CHECK
  // ========================================================================
  if (model.requiresWebGPU && !device.hasWebGPU) {
    score -= 60;
    warnings.push('Modelo requiere WebGPU (no disponible)');
  } else if (model.requiresWebGPU && device.hasWebGPU) {
    score += 10;
    reasons.push('Aprovecha aceleración GPU');
  } else if (!model.requiresWebGPU) {
    reasons.push('Funciona sin GPU');
  }

  // ========================================================================
  // GPU TIER BONUS (if applicable)
  // ========================================================================
  if (device.hasWebGPU && model.requiresWebGPU) {
    switch (device.gpuTier) {
      case 'high':
        score += 15;
        reasons.push('GPU potente detectada');
        break;
      case 'medium':
        score += 5;
        break;
      case 'low':
        score -= 10;
        warnings.push('GPU básica, puede ser lento');
        break;
    }
  }

  // ========================================================================
  // MODEL SIZE vs MEMORY
  // ========================================================================
  const memoryUsageRatio = model.sizeGB / device.estimatedAvailableMemoryGB;

  if (memoryUsageRatio < 0.3) {
    score += 5;
    reasons.push('Modelo ligero para tu dispositivo');
  } else if (memoryUsageRatio > 0.7) {
    score -= 15;
    warnings.push('Modelo grande, usará mucha memoria');
  }

  // ========================================================================
  // CPU CORES (for non-GPU models)
  // ========================================================================
  if (!device.hasWebGPU && device.logicalCores >= 6) {
    score += 5;
    reasons.push('Multi-core ayudará con CPU');
  } else if (!device.hasWebGPU && device.logicalCores <= 2) {
    score -= 10;
    warnings.push('Pocos cores, puede ser lento en CPU');
  }

  // ========================================================================
  // WASM THREADS (for Wllama engine)
  // ========================================================================
  if (model.engine === 'wllama' && device.hasWASMThreads) {
    score += 5;
    reasons.push('Soporta multi-threading WASM');
  } else if (model.engine === 'wllama' && !device.hasWASMThreads) {
    score -= 10;
    warnings.push('Sin threading, rendimiento limitado');
  }

  // ========================================================================
  // DEVICE CLASS BONUSES
  // ========================================================================
  if (device.deviceClass === 'high-end' && model.sizeGB >= 2) {
    score += 10;
    reasons.push('Tu dispositivo puede con modelos grandes');
  } else if (device.deviceClass === 'low-end' && model.sizeGB < 0.5) {
    score += 10;
    reasons.push('Modelo optimizado para dispositivos básicos');
  } else if (device.deviceClass === 'low-end' && model.sizeGB > 1.5) {
    score -= 20;
    warnings.push('Modelo demasiado grande para este dispositivo');
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low';
  if (warnings.length === 0) {
    confidence = 'high';
  } else if (warnings.length <= 1) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  // Determine recommendation
  let recommendation: 'excellent' | 'good' | 'usable' | 'not-recommended';
  if (score >= 80) {
    recommendation = 'excellent';
  } else if (score >= 60) {
    recommendation = 'good';
  } else if (score >= 40) {
    recommendation = 'usable';
  } else {
    recommendation = 'not-recommended';
  }

  return {
    model,
    score,
    confidence,
    reasons,
    warnings,
    recommendation
  };
}

/**
 * Score all models and return sorted by score
 */
export function scoreAllModels(
  models: ModelMetadata[],
  device: DeviceProfile
): ModelScore[] {
  return models
    .map(model => scoreModel(model, device))
    .sort((a, b) => b.score - a.score);
}

/**
 * Get the best recommended model for chat
 */
export function getBestChatModel(
  chatModels: ModelMetadata[],
  device: DeviceProfile
): ModelScore {
  const scores = scoreAllModels(chatModels, device);

  // Find first model with at least 'good' recommendation
  const goodModel = scores.find(s => s.recommendation === 'excellent' || s.recommendation === 'good');

  return goodModel || scores[0];
}

/**
 * Get the best recommended model for embeddings
 */
export function getBestEmbeddingModel(
  embeddingModels: ModelMetadata[],
  device: DeviceProfile
): ModelScore {
  const scores = scoreAllModels(embeddingModels, device);
  return scores[0]; // Usually just one embedding model, take the best
}

/**
 * Format score as percentage string
 */
export function formatScore(score: number): string {
  return `${Math.round(score)}%`;
}

/**
 * Get color class for score
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-yellow-500';
  if (score >= 40) return 'text-orange-500';
  return 'text-red-500';
}

/**
 * Get emoji for recommendation
 */
export function getRecommendationEmoji(recommendation: 'excellent' | 'good' | 'usable' | 'not-recommended'): string {
  switch (recommendation) {
    case 'excellent': return '✨';
    case 'good': return '✓';
    case 'usable': return '⚠️';
    case 'not-recommended': return '❌';
  }
}
