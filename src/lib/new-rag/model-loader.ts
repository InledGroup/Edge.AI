import { pipeline, env } from '@huggingface/transformers';

// Configuration: Prefer local cache, allow fetching if missing.
env.allowLocalModels = false; 
env.useBrowserCache = true;

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
      console.log('Loading Classifier: bert-base-multilingual-cased...');
      this.cache.set('classifier', await pipeline('feature-extraction', 'Xenova/bert-base-multilingual-cased', {
        progress_callback: (p: any) => {
          if (onProgress && p.status === 'progress') onProgress(p.progress, p.file);
        }
      }));
    }
    return this.cache.get('classifier');
  }

  async getEmbedder(onProgress?: (progress: number, status: string) => void) {
    if (!this.cache.has('embedder')) {
      console.log('Loading Embedder: bge-m3...');
      this.cache.set('embedder', await pipeline('feature-extraction', 'Xenova/bge-m3', {
        progress_callback: (p: any) => {
          if (onProgress && p.status === 'progress') onProgress(p.progress, p.file);
        }
      }));
    }
    return this.cache.get('embedder');
  }

  async getReranker(onProgress?: (progress: number, status: string) => void) {
    if (!this.cache.has('reranker')) {
      console.log('Loading Reranker: monoT5-base-msmarco...');
      this.cache.set('reranker', await pipeline('text2text-generation', 'Xenova/monot5-base-msmarco', {
        progress_callback: (p: any) => {
          if (onProgress && p.status === 'progress') onProgress(p.progress, p.file);
        }
      }));
    }
    return this.cache.get('reranker');
  }

  async getGenerator(onProgress?: (progress: number, status: string) => void) {
    if (!this.cache.has('generator')) {
      console.log('Loading Generator: flan-t5-large...');
      this.cache.set('generator', await pipeline('text2text-generation', 'Xenova/flan-t5-large', {
        progress_callback: (p: any) => {
          if (onProgress && p.status === 'progress') onProgress(p.progress, p.file);
        }
      }));
    }
    return this.cache.get('generator');
  }
}
