// WebAssembly Features Detection
// Detects SIMD, threads, and bulk memory support

export interface WasmFeatures {
  simd: boolean;
  threads: boolean;
  bulkMemory: boolean;
}

/**
 * Detect available WebAssembly features
 * SIMD: 2-3x faster vector operations
 * Threads: Parallel execution with SharedArrayBuffer
 * Bulk Memory: Faster memory operations
 */
export async function detectWasmFeatures(): Promise<WasmFeatures> {
  try {
    // Test SIMD support
    // This bytecode tests for v128 SIMD instructions
    const simd = await WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
        253, 15, 253, 98, 11,
      ])
    );

    // Test threads support (requires SharedArrayBuffer)
    const threads =
      typeof SharedArrayBuffer !== 'undefined' &&
      typeof Atomics !== 'undefined' &&
      crossOriginIsolated; // Threads require COOP/COEP headers

    // Test bulk memory support
    const bulkMemory = await WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5, 3, 1, 0, 1, 10, 14, 1, 12,
        0, 65, 0, 65, 0, 65, 0, 252, 10, 0, 11,
      ])
    );

    console.log('🔍 WASM Features detected:', {
      simd: simd ? '✅' : '❌',
      threads: threads ? '✅' : '❌',
      bulkMemory: bulkMemory ? '✅' : '❌',
    });

    if (!threads && typeof SharedArrayBuffer !== 'undefined') {
      console.warn(
        '⚠️ SharedArrayBuffer available but crossOriginIsolated=false. ' +
          'Add COOP/COEP headers to enable threads:\n' +
          'Cross-Origin-Opener-Policy: same-origin\n' +
          'Cross-Origin-Embedder-Policy: require-corp'
      );
    }

    return { simd, threads, bulkMemory };
  } catch (error) {
    console.error('❌ Failed to detect WASM features:', error);
    return { simd: false, threads: false, bulkMemory: false };
  }
}

/**
 * Get recommended Wllama build based on detected features
 */
export function getRecommendedWllamaBuild(features: WasmFeatures): {
  path: string;
  description: string;
  speedMultiplier: number;
} {
  if (features.threads && features.simd) {
    return {
      path: 'multi-thread/wllama.wasm',
      description: 'Multi-threaded + SIMD (fastest)',
      speedMultiplier: 3.0,
    };
  }

  if (features.simd) {
    return {
      path: 'single-thread/wllama.wasm',
      description: 'Single-threaded + SIMD',
      speedMultiplier: 2.0,
    };
  }

  return {
    path: 'single-thread/wllama.wasm',
    description: 'Basic (no SIMD)',
    speedMultiplier: 1.0,
  };
}

/**
 * Get optimal number of threads for Wllama
 */
export function getOptimalThreadCount(features: WasmFeatures): number {
  if (!features.threads) return 1;

  const cores = navigator.hardwareConcurrency || 4;

  // More aggressive allocation: 
  // - High-end (12+ cores): Use cores - 2 (leave some for UI)
  // - Mid-range (6-11 cores): Use cores - 1
  // - Low-end (2-5 cores): Use all cores
  // Max threads increased to 16 for high-end consumer CPUs
  if (cores >= 12) return Math.min(16, cores - 2);
  if (cores >= 6) return cores - 1;
  return cores;
}
