import { pipeline, env } from '@huggingface/transformers';
import { DEFAULT_CONFIG } from './config';

/**
 * Configure transformers.js environment
 */
env.allowLocalModels = false; 
env.allowRemoteModels = true;
env.useBrowserCache = true;

// Force anonymous requests to bypass any local browser sessions that might be causing 401 errors
const FETCH_OPTIONS = {
  credentials: 'omit' as const,
  mode: 'cors' as const,
};

// @ts-ignore
env.fetch_options = FETCH_OPTIONS;

export class RAGModelLoader {
  private static instance: RAGModelLoader;
  private cache: Map<string, any> = new Map();

  private constructor() {}

  static getInstance() {
    if (!this.instance) this.instance = new RAGModelLoader();
    return this.instance;
  }

  async getClassifier(onProgress?: (progress: number, status: string) => void) {
    if (!this.cache.has('classifier')) {
      const modelId = DEFAULT_CONFIG.models.classifier;
      console.log(`Loading Classifier: ${modelId}...`);
      this.cache.set('classifier', await pipeline('feature-extraction', modelId, {
        progress_callback: (p: any) => {
          if (onProgress && p.status === 'progress') onProgress(p.progress, p.file);
        },
        // @ts-ignore
        fetch_options: FETCH_OPTIONS
      }));
    }
    return this.cache.get('classifier');
  }

  async getEmbedder(onProgress?: (progress: number, status: string) => void) {
    if (!this.cache.has('embedder')) {
      const modelId = DEFAULT_CONFIG.models.embedding;
      console.log(`Loading Embedder: ${modelId}...`);
      this.cache.set('embedder', await pipeline('feature-extraction', modelId, {
        progress_callback: (p: any) => {
          if (onProgress && p.status === 'progress') onProgress(p.progress, p.file);
        },
        // @ts-ignore
        fetch_options: FETCH_OPTIONS
      }));
    }
    return this.cache.get('embedder');
  }

  async getReranker(onProgress?: (progress: number, status: string) => void) {
    if (!this.cache.has('reranker')) {
      const modelId = DEFAULT_CONFIG.models.reranker;
      console.log(`Loading Reranker: ${modelId}...`);
      
      // Check if it's a T5 model (requires text2text-generation)
      const task = modelId.includes('t5') ? 'text2text-generation' : 'text-classification';
      
      this.cache.set('reranker', await pipeline(task as any, modelId, {
        progress_callback: (p: any) => {
          if (onProgress && p.status === 'progress') onProgress(p.progress, p.file);
        },
        // @ts-ignore
        fetch_options: FETCH_OPTIONS
      }));
    }
    return this.cache.get('reranker');
  }

  async getGenerator(onProgress?: (progress: number, status: string) => void) {
    if (!this.cache.has('generator')) {
      const modelId = DEFAULT_CONFIG.models.generator;
      console.log(`Loading Generator: ${modelId}...`);
      this.cache.set('generator', await pipeline('text2text-generation', modelId, {
        progress_callback: (p: any) => {
          if (onProgress && p.status === 'progress') onProgress(p.progress, p.file);
        },
        // @ts-ignore
        fetch_options: FETCH_OPTIONS
      }));
    }
    return this.cache.get('generator');
  }
}
