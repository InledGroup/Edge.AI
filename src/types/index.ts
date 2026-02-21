// ============================================================================
// Core Types - Edge.AI Local-First Platform
// ============================================================================

/**
 * Document stored in IndexedDB
 */
export interface Document {
  id: string;
  name: string;
  type: 'pdf' | 'txt' | 'md';
  content: string; // Raw text content
  size: number; // File size in bytes
  uploadedAt: number; // Timestamp
  processedAt?: number; // When chunking/embedding completed
  status: 'pending' | 'processing' | 'ready' | 'error';
  errorMessage?: string;
  metadata?: Record<string, any>;
}

/**
 * Text chunk from a document
 */
export interface Chunk {
  id: string;
  documentId: string;
  content: string;
  index: number; // Position in document
  tokens?: number; // Approximate token count
  metadata: {
    startChar: number;
    endChar: number;
    heading?: string;
    [key: string]: any;
  };
}

/**
 * Vector embedding for a chunk
 */
export interface Embedding {
  id: string;
  chunkId: string;
  documentId: string; // Denormalized for faster queries
  vector: Float32Array;
  model: string; // e.g., "nomic-embed-text-v1.5"
  createdAt: number;
}

/**
 * Serialized embedding (for IndexedDB storage)
 */
export interface StoredEmbedding {
  id: string;
  chunkId: string;
  documentId: string;
  vector: number[]; // Array instead of Float32Array
  model: string;
  createdAt: number;
}

/**
 * Chat message
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sources?: RetrievedChunk[]; // RAG sources used
  model?: string; // Model that generated this (for assistant)
  images?: string[]; // Base64 images or URLs
  streaming?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Conversation thread
 */
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model?: string; // Default model for this conversation
}

/**
 * Chunk retrieved from vector search
 */
export interface RetrievedChunk {
  chunk: Chunk;
  document: Document;
  score: number; // Cosine similarity
  embedding?: Embedding;
}

/**
 * RAG search result
 */
export interface RAGResult {
  query: string;
  chunks: RetrievedChunk[];
  totalSearched: number;
  searchTime: number; // ms
}

/**
 * AI Model configuration
 */
export interface ModelConfig {
  id: string;
  name: string;
  type: 'chat' | 'embedding';
  engine: 'webllm' | 'wllama';
  url?: string; // Model URL if needed
  contextSize: number;
  requiresGPU: boolean;
  sizeGB: number;
}

/**
 * System settings
 */
export interface Settings {
  selectedChatModel?: string;
  selectedEmbeddingModel?: string;
  chunkSize: number;
  chunkOverlap: number;
  topK: number; // Number of chunks to retrieve
  temperature: number;
  maxTokens: number;
  theme: 'light' | 'dark' | 'auto';
  language: 'es' | 'en';
  // Web search settings
  enableWebSearch?: boolean; // Enable web search by default
  webSearchSources?: ('wikipedia' | 'duckduckgo' | 'extension')[]; // Search providers to use
  webSearchMaxUrls?: number; // Max URLs to fetch (default: 3)
  webSearchConfirmUrls?: boolean; // Confirm before opening URLs
  // Browser extension settings
  extensionId?: string; // Browser extension ID for web search
  extensionEnabled?: boolean; // Whether to use extension for searches
  useSpecializedToolModel?: boolean; // Whether to use LFM2-Tool for MCP requests
  // Live Mode settings
  liveModeAudioType?: 'system' | 'model'; // Use system TTS or model-generated audio
  liveModeSttType?: 'system' | 'model'; // Use system STT or model-based STT
  useAdvancedRAG?: boolean; // Use Fudan High-Perf RAG pipeline
  historyWeight?: number; // 0-1, how much previous messages matter
  historyLimit?: number; // max messages from history to include
  faithfulnessThreshold?: number; // 0-1, sensitivity of accuracy algorithm
  chunkWindowSize?: number; // 0-3, surrounding context for Small-to-Big
  // Remote API settings
  enableInboundApi?: boolean; // Expose OpenAI-compatible API via extension
  inboundApiKey?: string; // Optional API key for inbound requests
  enableOutboundApi?: boolean; // Use external OpenAI-compatible provider
  outboundApiUrl?: string; // e.g. http://localhost:11434/v1
  outboundApiKey?: string; // API key for outbound requests
  outboundModelId?: string; // Default model for outbound requests
}

/**
 * Processing status for UI feedback
 */
export interface ProcessingStatus {
  documentId: string;
  stage: 'uploading' | 'parsing' | 'chunking' | 'embedding' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  error?: string;
}

/**
 * Worker message types
 */
export type WorkerMessageType =
  | 'chunk-document'
  | 'generate-embedding'
  | 'search-similar'
  | 'progress'
  | 'error'
  | 'complete';

export interface WorkerMessage {
  type: WorkerMessageType;
  payload: any;
  id?: string; // Request ID for matching responses
}

/**
 * Chunking request
 */
export interface ChunkingRequest {
  documentId: string;
  content: string;
  chunkSize: number;
  overlap: number;
}

/**
 * Embedding request
 */
export interface EmbeddingRequest {
  chunkId: string;
  documentId: string;
  text: string;
  model: string;
}

/**
 * Similarity search request
 */
export interface SearchRequest {
  queryEmbedding: Float32Array;
  topK: number;
  documentIds?: string[]; // Optional filter
}

/**
 * GPU/CPU capabilities
 */
export interface DeviceCapabilities {
  hasWebGPU: boolean;
  hasWebGL: boolean;
  hasWASM: boolean;
  hasSIMD: boolean;
  recommendedEngine: 'webllm' | 'wllama';
  gpuInfo?: string;
}

/**
 * Export/Import format
 */
export interface ExportData {
  version: string;
  exportedAt: number;
  documents: Document[];
  chunks: Chunk[];
  embeddings: StoredEmbedding[];
  conversations: Conversation[];
  settings: Settings;
  mcp_servers: MCPServer[];
}

/**
 * MCP Server Configuration
 */
export interface MCPServer {
  id: string;
  name: string; // Short name for invocation (e.g. "weather")
  url: string;
  transport: 'http' | 'websocket';
  headers?: Record<string, string>;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error';
  errorMessage?: string;
  createdAt: number;
}

/**
 * Custom Integration Application
 */
export interface CustomApp {
  id: string;
  name: string;
  url: string; // The URL to open the app (e.g. https://insuite.inled.es/inlinked/)
  baseUrlToIntercept: string; // The URL base that should trigger this app (e.g. https://linkedin.com)
  exampleUrl: string; // e.g. https://insuite.inled.es/inlinked/?t={{text}}
  instructions: string; // Markdown instructions/syntax
  iconUrl?: string; // Optional icon URL
  createdAt: number;
}
