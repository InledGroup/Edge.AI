/**
 * Web Search Module
 *
 * Sistema de búsqueda web integrado con RAG local.
 * Permite al navegador obtener información de internet y procesarla
 * localmente como documentos temporales.
 */

// Main orchestrator
export { WebRAGOrchestrator } from './web-rag-orchestrator';

// Search service and providers
export { WebSearchService, webSearchService } from './web-search';
export {
  WikipediaSearchProvider,
  DuckDuckGoSearchProvider,
  createSearchProvider,
  DEFAULT_PROVIDERS,
} from './search-providers';

// Content extraction
export { ContentExtractor, contentExtractor } from './content-extractor';

// Types
export type {
  // Search
  SearchSource,
  SearchResult,
  SearchOptions,
  SearchProvider,
  ProviderConfig,

  // Content
  CleanedContent,
  ContentExtractionOptions,

  // Web documents
  WebDocument,
  WebDocumentChunk,

  // Fetching
  FetchedPage,
  FetchOptions,
  FetchResult,
  FetchErrorType,

  // Orchestration
  WebRAGResult,
  WebRAGOptions,
  WebSearchStep,
  WebSearchProgressEvent,
  RetrievedWebChunk,

  // Caching
  CachedSearchResult,
  CachedContent,

  // Rate limiting
  RateLimitConfig,
  RateLimitState,

  // Errors
  WebSearchErrorCode,
} from './types';

export { WebSearchError, isValidWebUrl, normalizeUrl, extractDomain } from './types';
