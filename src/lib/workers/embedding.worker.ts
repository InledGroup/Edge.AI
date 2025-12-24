// Embedding Worker - Generate embeddings in background thread
// Prevents UI blocking during heavy computation

import { WllamaEngine } from '../ai/wllama-engine';
import type { WorkerMessage, WorkerResponse } from './worker-types';

let engine: WllamaEngine | null = null;

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'init': {
        await handleInit(id, payload.modelUrl);
        break;
      }

      case 'generate-embedding': {
        await handleGenerateEmbedding(id, payload.text);
        break;
      }

      case 'generate-embeddings-batch': {
        await handleGenerateEmbeddingsBatch(
          id,
          payload.texts,
          payload.maxConcurrent
        );
        break;
      }

      case 'reset': {
        await handleReset(id);
        break;
      }

      default:
        sendError(id, `Unknown message type: ${type}`);
    }
  } catch (error) {
    sendError(id, error instanceof Error ? error.message : 'Unknown error');
  }
};

/**
 * Initialize the embedding engine
 */
async function handleInit(id: string, modelUrl?: string): Promise<void> {
  try {
    if (!engine) {
      engine = new WllamaEngine();
    }

    await engine.initialize(modelUrl, (progress, status) => {
      sendProgress(id, progress, status);
    });

    sendSuccess(id, { initialized: true });
  } catch (error) {
    sendError(id, `Failed to initialize engine: ${error}`);
  }
}

/**
 * Generate single embedding
 */
async function handleGenerateEmbedding(id: string, text: string): Promise<void> {
  if (!engine || !engine.isReady()) {
    sendError(id, 'Engine not initialized');
    return;
  }

  try {
    const embedding = await engine.generateEmbedding(text);

    // Convert Float32Array to regular array for transfer
    const embeddingArray = Array.from(embedding);

    sendSuccess(id, { embedding: embeddingArray });
  } catch (error) {
    sendError(id, `Failed to generate embedding: ${error}`);
  }
}

/**
 * Generate batch of embeddings
 */
async function handleGenerateEmbeddingsBatch(
  id: string,
  texts: string[],
  maxConcurrent: number = 4
): Promise<void> {
  if (!engine || !engine.isReady()) {
    sendError(id, 'Engine not initialized');
    return;
  }

  try {
    const embeddings = await engine.generateEmbeddingsBatch(
      texts,
      maxConcurrent,
      (progress, status) => {
        sendProgress(id, progress, status);
      }
    );

    // Convert Float32Array[] to number[][]
    const embeddingsArray = embeddings.map(emb => Array.from(emb));

    sendSuccess(id, { embeddings: embeddingsArray });
  } catch (error) {
    sendError(id, `Failed to generate embeddings batch: ${error}`);
  }
}

/**
 * Reset the engine
 */
async function handleReset(id: string): Promise<void> {
  if (engine) {
    await engine.reset();
    engine = null;
  }

  sendSuccess(id, { reset: true });
}

/**
 * Send success response
 */
function sendSuccess(id: string, payload: any): void {
  const response: WorkerResponse = {
    id,
    type: 'success',
    payload
  };
  self.postMessage(response);
}

/**
 * Send error response
 */
function sendError(id: string, error: string): void {
  const response: WorkerResponse = {
    id,
    type: 'error',
    error
  };
  self.postMessage(response);
}

/**
 * Send progress update
 */
function sendProgress(id: string, progress: number, message: string): void {
  const response: WorkerResponse = {
    id,
    type: 'progress',
    progress,
    message
  };
  self.postMessage(response);
}

// Export empty object to make this a module
export {};
