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
export {
  ExtensionSearchProvider,
  createExtensionSearchProvider
} from './extension-search-provider';

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

// Import here to have it in scope
import { ExtensionSearchProvider, createExtensionSearchProvider } from './extension-search-provider';
import { WebSearchService } from './web-search';

/**
 * Initialize web search with extension support
 */
export async function initializeWebSearch(): Promise<WebSearchService> {
  console.log('[WebSearch] Initializing with extension support...');

  // Create providers array
  const providers: SearchProvider[] = [];

  try {
    // Create extension provider (uses extensionBridge singleton)
    const extensionProvider = createExtensionSearchProvider();

    // Wait up to 2 seconds for extension to connect
    let isAvailable = await extensionProvider.isAvailable();

    if (!isAvailable) {
      console.log('[WebSearch] ⏳ Waiting for extension connection...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      isAvailable = await extensionProvider.isAvailable();
    }

    if (isAvailable) {
      console.log('[WebSearch] ✅ Using browser extension for searches');
      providers.push(extensionProvider);
    } else {
      console.warn('[WebSearch] ⚠️ Extension not connected after waiting');
    }
  } catch (error) {
    console.warn('[WebSearch] ❌ Failed to initialize extension provider:', error);
  }

  // If no extension available, throw error
  if (providers.length === 0) {
    throw new Error('Browser extension not available. Web search requires the Edge.AI browser extension. Please install and configure it from the browser-extension folder.');
  }

  return new WebSearchService(providers);
}
