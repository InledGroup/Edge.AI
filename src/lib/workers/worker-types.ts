// Worker Types - Shared types for worker communication
// Used by both main thread and worker threads

/**
 * Base worker message structure
 */
export interface WorkerMessage<T = any> {
  id: string; // Unique message ID for matching requests/responses
  type: string; // Message type
  payload: T; // Message payload
}

/**
 * Worker response message
 */
export interface WorkerResponse<T = any> {
  id: string; // Matches request ID
  type: 'success' | 'error' | 'progress';
  payload?: T;
  error?: string;
  progress?: number;
  message?: string;
}

/**
 * Embedding worker messages
 */
export type EmbeddingWorkerMessage =
  | {
      type: 'init';
      payload: {
        modelUrl?: string;
      };
    }
  | {
      type: 'generate-embedding';
      payload: {
        text: string;
      };
    }
  | {
      type: 'generate-embeddings-batch';
      payload: {
        texts: string[];
        maxConcurrent?: number;
      };
    }
  | {
      type: 'reset';
      payload: {};
    };

/**
 * Chunking worker messages
 */
export type ChunkingWorkerMessage = {
  type: 'chunk-document';
  payload: {
    documentId: string;
    text: string;
    chunkSize?: number;
    overlap?: number;
  };
};

/**
 * Search worker messages
 */
export type SearchWorkerMessage = {
  type: 'search-similar';
  payload: {
    queryEmbedding: number[]; // Serialized Float32Array
    topK?: number;
    documentIds?: string[];
  };
};

/**
 * Audio Decoder worker messages
 */
export type AudioDecoderWorkerMessage = 
  | {
      type: 'init';
      payload: {
        modelId?: string;
        device?: 'webgpu' | 'wasm';
      };
    }
  | {
      type: 'decode';
      payload: {
        tokens: number[][]; // Batch of [8] codes
      };
    };

/**
 * Generic worker error
 */
export interface WorkerError {
  message: string;
  stack?: string;
}

// Thanks for watching!
