// Advanced RAG Worker - Runs the high-performance RAG pipeline in a background thread
// Prevents UI blocking during heavy model inference (BERT, T5, BGE-M3)

import { AdvancedRAGPipeline } from '../new-rag/pipeline';
import { updateDocumentStatus } from '../db/documents';
import type { WorkerResponse } from './worker-types';

const pipeline = AdvancedRAGPipeline.getInstance();

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<any>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'index-document': {
        await handleIndexDocument(id, payload.text, payload.metadata, payload.chatModelId, payload.embeddingModelId);
        break;
      }

      case 'execute-query': {
        await handleExecuteQuery(id, payload.query, payload.chatModelId, payload.embeddingModelId);
        break;
      }

      default:
        sendError(id, `Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error(`[AdvancedRAGWorker] Error handling ${type}:`, error);
    sendError(id, error instanceof Error ? error.message : 'Unknown error');
  }
};

/**
 * Handle document indexing
 */
async function handleIndexDocument(id: string, text: string, metadata: any, chatModelId?: string, embeddingModelId?: string) {
  try {
    const result = await pipeline.indexDocument(text, metadata, (progress, message) => {
      sendProgress(id, progress, message);
    });
    
    // PERSIST status before sending success
    if (metadata?.documentId) {
      await updateDocumentStatus(metadata.documentId, 'ready');
    }
    
    sendSuccess(id, { count: result });
  } catch (error) {
    sendError(id, `Indexing failed: ${error}`);
  }
}

/**
 * Handle query execution
 */
async function handleExecuteQuery(id: string, query: string, chatModelId?: string, embeddingModelId?: string) {
  try {
    const result = await pipeline.execute(query, (step, progress, message) => {
      // Map step to a pseudo-progress number if needed, but the pipeline already provides it
      sendProgress(id, progress, message);
    });
    sendSuccess(id, result);
  } catch (error) {
    sendError(id, `Query execution failed: ${error}`);
  }
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

// Module export for worker
export {};
