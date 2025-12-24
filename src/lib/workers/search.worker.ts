// Search Worker - Perform vector similarity search in background
// Prevents UI blocking during search operations

import { cosineSimilarity } from '../rag/vector-search';
import type { WorkerMessage, WorkerResponse } from './worker-types';

// NOTE: This worker cannot directly access IndexedDB
// It receives embeddings from the main thread and performs calculations

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'search-similar': {
        await handleSearchSimilar(
          id,
          payload.queryEmbedding,
          payload.embeddings,
          payload.topK
        );
        break;
      }

      case 'calculate-similarity': {
        await handleCalculateSimilarity(
          id,
          payload.embedding1,
          payload.embedding2
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
 * Search for similar embeddings
 */
async function handleSearchSimilar(
  id: string,
  queryEmbedding: number[],
  embeddings: Array<{ id: string; chunkId: string; documentId: string; vector: number[] }>,
  topK: number = 5
): Promise<void> {
  try {
    sendProgress(id, 10, 'Iniciando búsqueda...');

    // Convert query to Float32Array
    const queryVector = new Float32Array(queryEmbedding);

    sendProgress(id, 20, `Comparando con ${embeddings.length} embeddings...`);

    // Calculate similarities
    const similarities = embeddings.map((emb, index) => {
      // Report progress every 100 embeddings
      if (index % 100 === 0) {
        const progress = 20 + Math.round((index / embeddings.length) * 60);
        sendProgress(id, progress, `Procesando: ${index}/${embeddings.length}`);
      }

      const embVector = new Float32Array(emb.vector);
      const score = cosineSimilarity(queryVector, embVector);

      return {
        id: emb.id,
        chunkId: emb.chunkId,
        documentId: emb.documentId,
        score
      };
    });

    sendProgress(id, 85, 'Ordenando resultados...');

    // Sort by score (descending)
    similarities.sort((a, b) => b.score - a.score);

    // Take top K
    const topResults = similarities.slice(0, topK);

    sendProgress(id, 95, `Encontrados ${topResults.length} resultados`);

    sendSuccess(id, { results: topResults });
  } catch (error) {
    sendError(id, `Failed to search similar: ${error}`);
  }
}

/**
 * Calculate similarity between two embeddings
 */
async function handleCalculateSimilarity(
  id: string,
  embedding1: number[],
  embedding2: number[]
): Promise<void> {
  try {
    const vec1 = new Float32Array(embedding1);
    const vec2 = new Float32Array(embedding2);

    const similarity = cosineSimilarity(vec1, vec2);

    sendSuccess(id, { similarity });
  } catch (error) {
    sendError(id, `Failed to calculate similarity: ${error}`);
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

// Export empty object to make this a module
export {};
