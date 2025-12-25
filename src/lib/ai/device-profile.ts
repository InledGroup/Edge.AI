/**
 * Device Profile Detection
 * Detects hardware capabilities for AI model recommendations
 */

export interface DeviceProfile {
  // GPU capabilities
  hasWebGPU: boolean;
  gpuTier?: 'low' | 'medium' | 'high';

  // Memory
  memoryGB: number;
  estimatedAvailableMemoryGB: number;

  // CPU
  logicalCores: number;

  // WASM/Threading
  hasSharedArrayBuffer: boolean;
  hasWASMThreads: boolean;

  // Derived properties
  recommendedBackend: 'webgpu' | 'wasm' | 'cpu';
  deviceClass: 'high-end' | 'mid-range' | 'low-end';
}

/**
 * Detect all device capabilities
 */
export async function detectDeviceProfile(): Promise<DeviceProfile> {
  const hasWebGPU = await checkWebGPU();
  const gpuTier = hasWebGPU ? await estimateGPUTier() : undefined;
  const memoryGB = detectMemory();
  const logicalCores = detectCores();
  const hasSharedArrayBuffer = checkSharedArrayBuffer();
  const hasWASMThreads = checkWASMThreads();

  // Calculate available memory (conservative estimate)
  const estimatedAvailableMemoryGB = Math.max(1, memoryGB * 0.3);

  // Determine recommended backend
  const recommendedBackend = determineBackend(hasWebGPU, hasWASMThreads);

  // Classify device
  const deviceClass = classifyDevice(memoryGB, hasWebGPU, logicalCores);

  const profile: DeviceProfile = {
    hasWebGPU,
    gpuTier,
    memoryGB,
    estimatedAvailableMemoryGB,
    logicalCores,
    hasSharedArrayBuffer,
    hasWASMThreads,
    recommendedBackend,
    deviceClass
  };

  console.log('🔍 Device Profile:', profile);

  return profile;
}

/**
 * Check if WebGPU is available
 */
async function checkWebGPU(): Promise<boolean> {
  try {
    if (!navigator.gpu) {
      return false;
    }

    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch (error) {
    console.warn('WebGPU check failed:', error);
    return false;
  }
}

/**
 * Estimate GPU tier based on limits
 */
async function estimateGPUTier(): Promise<'low' | 'medium' | 'high'> {
  try {
    if (!navigator.gpu) return 'low';

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return 'low';

    const limits = adapter.limits;

    // Use max buffer size as a proxy for GPU capability
    const maxBufferSize = limits.maxBufferSize || 0;
    const maxComputeWorkgroupsPerDimension = limits.maxComputeWorkgroupsPerDimension || 0;

    // High-end: Modern discrete GPUs
    if (maxBufferSize > 2_000_000_000 && maxComputeWorkgroupsPerDimension >= 65535) {
      return 'high';
    }

    // Medium: Integrated GPUs, older discrete
    if (maxBufferSize > 500_000_000) {
      return 'medium';
    }

    return 'low';
  } catch (error) {
    console.warn('GPU tier estimation failed:', error);
    return 'low';
  }
}

/**
 * Detect system memory
 */
function detectMemory(): number {
  // Try modern Device Memory API
  const deviceMemory = (navigator as any).deviceMemory;
  if (deviceMemory && typeof deviceMemory === 'number') {
    return deviceMemory;
  }

  // Fallback: estimate based on cores (very rough)
  const cores = detectCores();
  if (cores >= 8) return 16;
  if (cores >= 4) return 8;
  return 4;
}

/**
 * Detect logical CPU cores
 */
function detectCores(): number {
  return navigator.hardwareConcurrency || 4;
}

/**
 * Check SharedArrayBuffer support
 */
function checkSharedArrayBuffer(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}

/**
 * Check WASM threads support
 */
function checkWASMThreads(): boolean {
  return checkSharedArrayBuffer() && typeof Atomics !== 'undefined';
}

/**
 * Determine best backend for this device
 */
function determineBackend(
  hasWebGPU: boolean,
  hasWASMThreads: boolean
): 'webgpu' | 'wasm' | 'cpu' {
  if (hasWebGPU) return 'webgpu';
  if (hasWASMThreads) return 'wasm';
  return 'cpu';
}

/**
 * Classify device into performance tiers
 */
function classifyDevice(
  memoryGB: number,
  hasWebGPU: boolean,
  cores: number
): 'high-end' | 'mid-range' | 'low-end' {
  // High-end: WebGPU + good memory + multi-core
  if (hasWebGPU && memoryGB >= 8 && cores >= 6) {
    return 'high-end';
  }

  // Mid-range: Some acceleration or decent specs
  if ((hasWebGPU && memoryGB >= 4) || (memoryGB >= 8 && cores >= 4)) {
    return 'mid-range';
  }

  // Low-end: Basic hardware
  return 'low-end';
}

/**
 * Get human-readable device summary
 */
export function getDeviceSummary(profile: DeviceProfile): string {
  const parts: string[] = [];

  if (profile.hasWebGPU) {
    parts.push(`WebGPU (${profile.gpuTier || 'unknown'})`);
  } else {
    parts.push('CPU only');
  }

  parts.push(`${profile.memoryGB}GB RAM`);
  parts.push(`${profile.logicalCores} cores`);

  return parts.join(' • ');
}
