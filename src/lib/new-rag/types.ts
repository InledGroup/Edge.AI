export interface RAGConfig {
  milvus: {
    address: string;
    username?: string;
    password?: string;
    collectionName: string;
    dimension: number;
  };
  models: {
    embedding: string;
    sparse: string;
    reranker: string;
    classifier: string;
    generator: string;
  };
  chunking: {
    smallChunkSize: number;
    parentChunkSize: number;
  };
  search: {
    topK: number;
    alpha: number;
  };
}

export interface Chunk {
  small: string;
  parent: string;
}

export interface SearchResult {
  id: string;
  score: number;
  content: string; // The parent content
  small_content: string;
  metadata: Record<string, any>;
  rerankScore?: number;
}

export interface RAGResponse {
  mode: 'direct' | 'rag';
  context: string | null;
  sources?: { id: string; metadata: any }[];
  answer?: string; // If we generate the final answer here too
}
