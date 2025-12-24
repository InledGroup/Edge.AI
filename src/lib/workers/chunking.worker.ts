// Chunking Worker - Process document chunking in background
// Prevents UI blocking during text processing

import { semanticChunkText } from '../rag/semantic-chunking';
import type { WorkerMessage, WorkerResponse } from './worker-types';

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'chunk-document': {
        await handleChunkDocument(
          id,
          payload.documentId,
          payload.text,
          payload.chunkSize,
          payload.overlap
        );
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
 * Chunk a document into semantic chunks
 */
async function handleChunkDocument(
  id: string,
  documentId: string,
  text: string,
  chunkSize: number = 800,
  overlap: number = 50
): Promise<void> {
  try {
    sendProgress(id, 10, 'Iniciando chunking...');

    // Use semantic chunking
    const semanticChunks = semanticChunkText(text, chunkSize);

    sendProgress(id, 50, `Creados ${semanticChunks.length} chunks`);

    // Convert to serializable format
    const chunks = semanticChunks.map((sc, index) => ({
      documentId,
      content: sc.content,
      index,
      tokens: estimateTokens(sc.content),
      metadata: {
        startChar: sc.metadata.startChar,
        endChar: sc.metadata.endChar,
        type: sc.metadata.type,
        prevContext: sc.metadata.prevContext,
        nextContext: sc.metadata.nextContext
      }
    }));

    sendProgress(id, 90, 'Finalizando...');

    sendSuccess(id, { chunks });
  } catch (error) {
    sendError(id, `Failed to chunk document: ${error}`);
  }
}

/**
 * Estimate token count
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
