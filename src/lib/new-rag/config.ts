import type { RAGConfig } from './types';

export const DEFAULT_CONFIG: RAGConfig = {
  milvus: {
    address: (import.meta.env.MILVUS_ADDRESS as string) || 'localhost:19530',
    username: (import.meta.env.MILVUS_USERNAME as string) || '',
    password: (import.meta.env.MILVUS_PASSWORD as string) || '',
    collectionName: 'rag_hybrid_index_prod_v1',
    dimension: 1024, // BGE-M3 uses 1024 dimensions
  },
  models: {
    // LLM-Embedder / BGE-M3 (High performance dense embedding)
    embedding: 'onnx-community/bge-m3', 
    // Sparse vector generation is handled by custom logic (TF-IDF Hashing)
    sparse: 'custom-hashing-vectorizer', 
    // monoT5 for Reranking
    reranker: 'onnx-community/monot5-base-msmarco', 
    // BERT for Classification (Feature Extraction + Prototype)
    classifier: 'onnx-community/bert-base-multilingual-cased',
    // Flan-T5 Large for Generation (HyDE & Recomp)
    generator: 'onnx-community/flan-t5-large', 
  },
  chunking: {
    smallChunkSize: 175,
    parentChunkSize: 512,
  },
  search: {
    topK: 50, // Retrieve 50 for reranking
    alpha: 0.3, // Weight for sparse search (0.3 sparse, 0.7 dense)
  },
};
