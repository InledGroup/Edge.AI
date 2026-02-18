// Tipos para el Constructor de Chatbots

export interface DocumentWithEmbeddings {
  content: string;
  embedding: number[];
  metadata: {
    name: string;
    [key: string]: any;
  };
}

export interface RAGConfig {
  topK: number;              // Número de fragmentos a recuperar
  chunkSize: number;         // Tamaño de cada chunk en tokens
  chunkOverlap: number;      // Superposición entre chunks
  temperature: number;       // Creatividad del modelo
  maxTokens: number;         // Máximos tokens en la respuesta
  similarityThreshold: number; // Umbral mínimo de similitud
}

export interface ChatbotConfig {
  name: string;
  description: string;
  model: string;
  ragConfig: RAGConfig;
  documents: DocumentWithEmbeddings[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sources?: Array<{
    content: string;
    score: number;
  }>;
}
