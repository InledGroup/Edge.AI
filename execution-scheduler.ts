// Execution Scheduler for Dual-Engine Coordination
// Prevents GPU and CPU engines from competing for resources

export class ExecutionScheduler {
  private gpuLock = false;
  private cpuLock = false;
  private gpuQueue: Array<() => void> = [];
  private cpuQueue: Array<() => void> = [];

  /**
   * Acquire GPU lock
   * Waits if GPU is already in use
   */
  async acquireGPU(): Promise<void> {
    if (!this.gpuLock) {
      this.gpuLock = true;
      console.log('🔒 GPU lock acquired');
      return;
    }

    // Wait for lock to be released
    console.log('⏳ Waiting for GPU lock...');
    return new Promise((resolve) => {
      this.gpuQueue.push(resolve);
    });
  }

  /**
   * Release GPU lock
   * Processes next item in queue if any
   */
  releaseGPU(): void {
    console.log('🔓 GPU lock released');

    const next = this.gpuQueue.shift();
    if (next) {
      console.log('▶️ Processing next GPU task from queue');
      next();
    } else {
      this.gpuLock = false;
    }
  }

  /**
   * Acquire CPU lock
   * Waits if CPU is already in use
   */
  async acquireCPU(): Promise<void> {
    if (!this.cpuLock) {
      this.cpuLock = true;
      console.log('🔒 CPU lock acquired');
      return;
    }

    // Wait for lock to be released
    console.log('⏳ Waiting for CPU lock...');
    return new Promise((resolve) => {
      this.cpuQueue.push(resolve);
    });
  }

  /**
   * Release CPU lock
   * Processes next item in queue if any
   */
  releaseCPU(): void {
    console.log('🔓 CPU lock released');

    const next = this.cpuQueue.shift();
    if (next) {
      console.log('▶️ Processing next CPU task from queue');
      next();
    } else {
      this.cpuLock = false;
    }
  }

  /**
   * Execute with GPU lock (auto acquire/release)
   */
  async withGPULock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireGPU();
    try {
      return await fn();
    } finally {
      this.releaseGPU();
    }
  }

  /**
   * Execute with CPU lock (auto acquire/release)
   */
  async withCPULock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireCPU();
    try {
      return await fn();
    } finally {
      this.releaseCPU();
    }
  }

  /**
   * Get current lock status
   */
  getStatus(): {
    gpuLocked: boolean;
    cpuLocked: boolean;
    gpuQueueLength: number;
    cpuQueueLength: number;
  } {
    return {
      gpuLocked: this.gpuLock,
      cpuLocked: this.cpuLock,
      gpuQueueLength: this.gpuQueue.length,
      cpuQueueLength: this.cpuQueue.length,
    };
  }

  /**
   * Reset all locks (use with caution)
   */
  reset(): void {
    console.warn('⚠️ Resetting all locks');
    this.gpuLock = false;
    this.cpuLock = false;
    this.gpuQueue = [];
    this.cpuQueue = [];
  }
}

// Singleton instance
export const executionScheduler = new ExecutionScheduler();
