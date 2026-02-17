import type { RAGConfig } from './types';

export const DEFAULT_CONFIG: RAGConfig = {
  // Milvus is removed for 100% local/edge operation
  localStore: {
    collectionName: 'local_rag_index_v1',
    dimension: 1024, 
  },
  models: {
    // Xenova models are verified working in browser via Transformers.js
    embedding: 'Xenova/bge-m3', 
    sparse: 'custom-hashing-vectorizer', 
    reranker: 'onnx-community/flan-t5-base-ONNX', // Using Flan-T5 for monoT5 reranking
    classifier: 'Xenova/bert-base-multilingual-cased',
    generator: 'onnx-community/flan-t5-base-ONNX', 
  },
  chunking: {
    smallChunkSize: 175,
    parentChunkSize: 512,
  },
  search: {
    topK: 20, // Reduced for local performance
    alpha: 0.3, 
  },
};
