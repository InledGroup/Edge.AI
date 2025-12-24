// Worker Manager - Manage worker lifecycle and communication
// Handles creating, messaging, and terminating workers

import type { WorkerMessage, WorkerResponse } from './worker-types';

/**
 * Generic worker wrapper with typed messaging
 */
export class WorkerManager<TRequest = any, TResponse = any> {
  private worker: Worker | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: TResponse) => void;
      reject: (error: Error) => void;
      onProgress?: (progress: number, message: string) => void;
    }
  >();
  private messageIdCounter = 0;

  constructor(private workerPath: string) {}

  /**
   * Initialize the worker
   */
  async init(): Promise<void> {
    if (this.worker) {
      console.warn('Worker already initialized');
      return;
    }

    try {
      // Create worker using module syntax
      this.worker = new Worker(new URL(this.workerPath, import.meta.url), {
        type: 'module'
      });

      // Set up message handler
      this.worker.onmessage = (event: MessageEvent<WorkerResponse<TResponse>>) => {
        this.handleWorkerMessage(event.data);
      };

      // Set up error handler
      this.worker.onerror = (error) => {
        console.error('Worker error:', error);
        // Reject all pending requests
        this.pendingRequests.forEach(({ reject }) => {
          reject(new Error(`Worker error: ${error.message}`));
        });
        this.pendingRequests.clear();
      };

      console.log(`✅ Worker initialized: ${this.workerPath}`);
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      throw error;
    }
  }

  /**
   * Send a message to the worker and wait for response
   */
  async sendMessage(
    type: string,
    payload: TRequest,
    onProgress?: (progress: number, message: string) => void
  ): Promise<TResponse> {
    if (!this.worker) {
      throw new Error('Worker not initialized. Call init() first.');
    }

    const id = this.generateMessageId();

    const message: WorkerMessage<TRequest> = {
      id,
      type,
      payload
    };

    return new Promise<TResponse>((resolve, reject) => {
      // Store pending request
      this.pendingRequests.set(id, { resolve, reject, onProgress });

      // Send message to worker
      this.worker!.postMessage(message);

      // Set timeout (10 minutes)
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Worker request timeout'));
      }, 10 * 60 * 1000);

      // Clean up timeout on completion
      const originalResolve = resolve;
      const originalReject = reject;

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          originalResolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          originalReject(error);
        },
        onProgress
      });
    });
  }

  /**
   * Handle message from worker
   */
  private handleWorkerMessage(response: WorkerResponse<TResponse>): void {
    const pending = this.pendingRequests.get(response.id);

    if (!pending) {
      console.warn('Received response for unknown request:', response.id);
      return;
    }

    switch (response.type) {
      case 'success':
        this.pendingRequests.delete(response.id);
        pending.resolve(response.payload as TResponse);
        break;

      case 'error':
        this.pendingRequests.delete(response.id);
        pending.reject(new Error(response.error || 'Unknown worker error'));
        break;

      case 'progress':
        if (pending.onProgress && response.progress !== undefined) {
          pending.onProgress(response.progress, response.message || '');
        }
        break;

      default:
        console.warn('Unknown response type:', response.type);
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${this.messageIdCounter++}`;
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;

      // Reject all pending requests
      this.pendingRequests.forEach(({ reject }) => {
        reject(new Error('Worker terminated'));
      });
      this.pendingRequests.clear();

      console.log('✅ Worker terminated');
    }
  }

  /**
   * Check if worker is initialized
   */
  isInitialized(): boolean {
    return this.worker !== null;
  }
}

/**
 * Create a worker manager with type inference
 */
export function createWorkerManager<TRequest = any, TResponse = any>(
  workerPath: string
): WorkerManager<TRequest, TResponse> {
  return new WorkerManager<TRequest, TResponse>(workerPath);
}
