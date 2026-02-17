// Workers Index - Export all worker managers and utilities
// Simplified API for using workers from main thread

import { WorkerManager } from './worker-manager';

// Import workers using Vite's ?worker syntax for proper bundling
import EmbeddingWorkerUrl from './embedding.worker.ts?worker&url';
import ChunkingWorkerUrl from './chunking.worker.ts?worker&url';
import WebSearchWorkerUrl from './web-search.worker.ts?worker&url';
import AdvancedRAGWorkerUrl from './advanced-rag.worker.ts?worker&url';

/**
 * Advanced RAG Worker Manager
 */
export class AdvancedRAGWorkerManager {
  private manager: WorkerManager;

  constructor() {
    this.manager = new WorkerManager(AdvancedRAGWorkerUrl);
  }

  async init(): Promise<void> {
    await this.manager.init();
  }

  async indexDocument(
    text: string,
    metadata?: any,
    onProgress?: (progress: number, message: string) => void
  ): Promise<number> {
    const { modelsStore } = await import('../stores');
    const result = await this.manager.sendMessage(
      'index-document',
      { 
        text, 
        metadata,
        chatModelId: modelsStore.chat?.id,
        embeddingModelId: modelsStore.embedding?.id
      },
      onProgress
    );
    return result.count;
  }

  async execute(
    query: string,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    const { modelsStore } = await import('../stores');
    const result = await this.manager.sendMessage(
      'execute-query',
      { 
        query,
        chatModelId: modelsStore.chat?.id,
        embeddingModelId: modelsStore.embedding?.id
      },
      onProgress
    );
    return result;
  }

  terminate(): void {
    this.manager.terminate();
  }

  isInitialized(): boolean {
    return this.manager.isInitialized();
  }
}

/**
 * Embedding Worker Manager
 */
export class EmbeddingWorkerManager {
  private manager: WorkerManager;

  constructor() {
    this.manager = new WorkerManager(EmbeddingWorkerUrl);
  }

  async init(modelUrl?: string): Promise<void> {
    await this.manager.init();
    await this.manager.sendMessage('init', { modelUrl });
  }

  async generateEmbedding(
    text: string
  ): Promise<number[]> {
    const result = await this.manager.sendMessage('generate-embedding', { text });
    return result.embedding;
  }

  async generateEmbeddingsBatch(
    texts: string[],
    maxConcurrent: number = 4,
    onProgress?: (progress: number, message: string) => void
  ): Promise<number[][]> {
    const result = await this.manager.sendMessage(
      'generate-embeddings-batch',
      { texts, maxConcurrent },
      onProgress
    );
    return result.embeddings;
  }

  async reset(): Promise<void> {
    await this.manager.sendMessage('reset', {});
  }

  terminate(): void {
    this.manager.terminate();
  }

  isInitialized(): boolean {
    return this.manager.isInitialized();
  }
}

/**
 * Chunking Worker Manager
 */
export class ChunkingWorkerManager {
  private manager: WorkerManager;

  constructor() {
    this.manager = new WorkerManager(ChunkingWorkerUrl);
  }

  async init(): Promise<void> {
    await this.manager.init();
  }

  async chunkDocument(
    documentId: string,
    text: string,
    chunkSize: number = 800,
    overlap: number = 50,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any[]> {
    const result = await this.manager.sendMessage(
      'chunk-document',
      { documentId, text, chunkSize, overlap },
      onProgress
    );
    return result.chunks;
  }

  terminate(): void {
    this.manager.terminate();
  }

  isInitialized(): boolean {
    return this.manager.isInitialized();
  }
}

/**
 * Search Worker Manager
 */
export class SearchWorkerManager {
  private manager: WorkerManager;

  constructor() {
    this.manager = new WorkerManager('./search.worker.ts');
  }

  async init(): Promise<void> {
    await this.manager.init();
  }

  async searchSimilar(
    queryEmbedding: number[],
    embeddings: Array<{
      id: string;
      chunkId: string;
      documentId: string;
      vector: number[];
    }>,
    topK: number = 5,
    onProgress?: (progress: number, message: string) => void
  ): Promise<Array<{
    id: string;
    chunkId: string;
    documentId: string;
    score: number;
  }>> {
    const result = await this.manager.sendMessage(
      'search-similar',
      { queryEmbedding, embeddings, topK },
      onProgress
    );
    return result.results;
  }

  async calculateSimilarity(
    embedding1: number[],
    embedding2: number[]
  ): Promise<number> {
    const result = await this.manager.sendMessage('calculate-similarity', {
      embedding1,
      embedding2
    });
    return result.similarity;
  }

  terminate(): void {
    this.manager.terminate();
  }

  isInitialized(): boolean {
    return this.manager.isInitialized();
  }
}

/**
 * Web Search Worker Manager
 */
export class WebSearchWorkerManager {
  private manager: WorkerManager;

  constructor() {
    // Use the imported worker URL
    this.manager = new WorkerManager(WebSearchWorkerUrl);
  }

  async init(): Promise<void> {
    await this.manager.init();
  }

  async fetchPage(
    url: string,
    options?: {
      maxSize?: number;
      timeout?: number;
      headers?: Record<string, string>;
    }
  ): Promise<{
    url: string;
    html: string;
    size: number;
    status: number;
    fetchTime: number;
    headers?: {
      contentType?: string;
      lastModified?: string;
      etag?: string;
    };
  }> {
    const result = await this.manager.sendMessage('fetch-page', {
      url,
      options
    });
    return result;
  }

  async fetchPages(
    urls: string[],
    options?: {
      maxSize?: number;
      timeout?: number;
      headers?: Record<string, string>;
    }
  ): Promise<Array<{
    url: string;
    html: string;
    size: number;
    status: number;
    fetchTime: number;
    headers?: {
      contentType?: string;
      lastModified?: string;
      etag?: string;
    };
  }>> {
    const result = await this.manager.sendMessage('fetch-pages', {
      urls,
      options
    });
    return result;
  }

  terminate(): void {
    this.manager.terminate();
  }

  isInitialized(): boolean {
    return this.manager.isInitialized();
  }
}

/**
 * Global worker pool for the application
 * Singleton pattern to reuse workers
 */
class WorkerPool {
  private static instance: WorkerPool;

  public embeddingWorker: EmbeddingWorkerManager | null = null;
  public chunkingWorker: ChunkingWorkerManager | null = null;
  public searchWorker: SearchWorkerManager | null = null;
  public webSearchWorker: WebSearchWorkerManager | null = null;
  public advancedRAGWorker: AdvancedRAGWorkerManager | null = null;

  private constructor() {}

  static getInstance(): WorkerPool {
    if (!WorkerPool.instance) {
      WorkerPool.instance = new WorkerPool();
    }
    return WorkerPool.instance;
  }

  /**
   * Get or create embedding worker
   */
  async getEmbeddingWorker(): Promise<EmbeddingWorkerManager> {
    if (!this.embeddingWorker) {
      this.embeddingWorker = new EmbeddingWorkerManager();
    }
    return this.embeddingWorker;
  }

  /**
   * Get or create chunking worker
   */
  async getChunkingWorker(): Promise<ChunkingWorkerManager> {
    if (!this.chunkingWorker) {
      this.chunkingWorker = new ChunkingWorkerManager();
      await this.chunkingWorker.init();
    }
    return this.chunkingWorker;
  }

  /**
   * Get or create search worker
   */
  async getSearchWorker(): Promise<SearchWorkerManager> {
    if (!this.searchWorker) {
      this.searchWorker = new SearchWorkerManager();
      await this.searchWorker.init();
    }
    return this.searchWorker;
  }

  /**
   * Get or create web search worker
   */
  async getWebSearchWorker(): Promise<WebSearchWorkerManager> {
    if (!this.webSearchWorker) {
      this.webSearchWorker = new WebSearchWorkerManager();
      await this.webSearchWorker.init();
    }
    return this.webSearchWorker;
  }

  /**
   * Get or create advanced RAG worker
   */
  async getAdvancedRAGWorker(): Promise<AdvancedRAGWorkerManager> {
    if (!this.advancedRAGWorker) {
      this.advancedRAGWorker = new AdvancedRAGWorkerManager();
      await this.advancedRAGWorker.init();
    }
    return this.advancedRAGWorker;
  }

  /**
   * Terminate all workers
   */
  terminateAll(): void {
    if (this.embeddingWorker) {
      this.embeddingWorker.terminate();
      this.embeddingWorker = null;
    }
    if (this.chunkingWorker) {
      this.chunkingWorker.terminate();
      this.chunkingWorker = null;
    }
    if (this.searchWorker) {
      this.searchWorker.terminate();
      this.searchWorker = null;
    }
    if (this.webSearchWorker) {
      this.webSearchWorker.terminate();
      this.webSearchWorker = null;
    }
    if (this.advancedRAGWorker) {
      this.advancedRAGWorker.terminate();
      this.advancedRAGWorker = null;
    }
  }
}

/**
 * Get the global worker pool
 */
export function getWorkerPool(): WorkerPool {
  return WorkerPool.getInstance();
}

// Re-export types
export type { WorkerMessage, WorkerResponse } from './worker-types';
export { WorkerManager } from './worker-manager';
