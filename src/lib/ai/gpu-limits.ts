// GPU Limits Detection and Configuration
// Detects actual WebGPU limits and recommends optimal model sizes

export interface GPUTierConfig {
  maxBufferSize: number;
  maxStorageBufferBinding: number;
  maxUniformBufferBinding: number;
  recommendedModelSize: number;
  tier: 'mobile' | 'integrated' | 'discrete';
}

export const GPU_TIERS = {
  mobile: {
    maxBufferSize: 256 * 1024 * 1024,      // 256MB
    maxStorageBufferBinding: 128 * 1024 * 1024,
    maxUniformBufferBinding: 64 * 1024,
    recommendedModelSize: 350 * 1024 * 1024, // Q4_K_M 0.5B
    tier: 'mobile' as const,
  },
  integrated: {
    maxBufferSize: 1024 * 1024 * 1024,     // 1GB
    maxStorageBufferBinding: 512 * 1024 * 1024,
    maxUniformBufferBinding: 64 * 1024,
    recommendedModelSize: 900 * 1024 * 1024, // Q4_K_M 1.5B
    tier: 'integrated' as const,
  },
  discrete: {
    maxBufferSize: 4096 * 1024 * 1024,     // 4GB
    maxStorageBufferBinding: 2048 * 1024 * 1024,
    maxUniformBufferBinding: 64 * 1024,
    recommendedModelSize: 1900 * 1024 * 1024, // Q4_F16 3B
    tier: 'discrete' as const,
  },
};

/**
 * Probe actual GPU limits from WebGPU adapter
 * Returns actual limits and recommended tier
 */
export async function probeActualLimits(): Promise<GPUTierConfig | null> {
  try {
    if (!navigator.gpu) {
      console.log('❌ WebGPU not available');
      return null;
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      console.log('❌ WebGPU adapter not available');
      return null;
    }

    const limits = adapter.limits;
    const maxBufferSize = limits.maxBufferSize;

    console.log('🔍 Detected GPU limits:', {
      maxBufferSize: `${Math.round(maxBufferSize / 1024 / 1024)}MB`,
      maxStorageBufferBinding: `${Math.round(limits.maxStorageBufferBindingSize / 1024 / 1024)}MB`,
      maxComputeWorkgroupSizeX: limits.maxComputeWorkgroupSizeX,
    });

    // Determine tier based on max buffer size
    let tier: 'mobile' | 'integrated' | 'discrete';
    if (maxBufferSize >= 2_000_000_000) {
      tier = 'discrete'; // >= 2GB
    } else if (maxBufferSize >= 800_000_000) {
      tier = 'integrated'; // >= 800MB
    } else {
      tier = 'mobile'; // < 800MB
    }

    const config: GPUTierConfig = {
      maxBufferSize: limits.maxBufferSize,
      maxStorageBufferBinding: limits.maxStorageBufferBindingSize,
      maxUniformBufferBinding: limits.maxUniformBufferBindingSize,
      recommendedModelSize: Math.floor(maxBufferSize * 0.7), // 70% safety margin
      tier,
    };

    console.log(`✅ GPU Tier: ${tier.toUpperCase()}`);
    return config;
  } catch (error) {
    console.warn('⚠️ Failed to probe GPU limits:', error);
    return null;
  }
}

/**
 * Get WebGPU configuration based on GPU tier
 */
export function getWebGPUConfig(tier: 'mobile' | 'integrated' | 'discrete'): {
  max_batch_size: number;
  max_window_size: number;
  recommended_context: number;
} {
  const configs = {
    mobile: {
      max_batch_size: 32,
      max_window_size: 1024,
      recommended_context: 512,
    },
    integrated: {
      max_batch_size: 128,
      max_window_size: 2048,
      recommended_context: 1024,
    },
    discrete: {
      max_batch_size: 256,
      max_window_size: 4096,
      recommended_context: 2048,
    },
  };

  return configs[tier];
}
