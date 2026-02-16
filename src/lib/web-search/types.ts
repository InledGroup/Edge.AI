/**
 * Web Search Provider - Type Definitions
 *
 * Este módulo define todos los tipos para el sistema de búsqueda web
 * integrado con el pipeline RAG existente.
 */

// ============================================================================
// SEARCH RESULTS
// ============================================================================

/**
 * Fuentes de búsqueda soportadas
 */
export type SearchSource = 'wikipedia' | 'duckduckgo' | 'extension';

/**
 * Resultado individual de búsqueda web
 */
export interface SearchResult {
  /** Título del resultado */
  title: string;

  /** Snippet o descripción breve */
  snippet: string;

  /** URL completa del recurso */
  url: string;

  /** Fuente que proporcionó el resultado */
  source: SearchSource;

  /** Timestamp de cuando se obtuvo (opcional) */
  fetchedAt?: number;
}

/**
 * Opciones para búsqueda web
 */
export interface SearchOptions {
  /** Número máximo de resultados a retornar */
  maxResults?: number;

  /** Fuentes a consultar (por defecto: todas) */
  sources?: SearchSource[];

  /** Timeout en ms para la búsqueda */
  timeout?: number;

  /** Idioma preferido (ISO 639-1) */
  language?: string;
}

// ============================================================================
// CONTENT EXTRACTION
// ============================================================================

/**
 * Contenido limpio extraído de HTML
 */
export interface CleanedContent {
  /** Texto plano limpio (sin HTML) */
  text: string;

  /** Título de la página */
  title: string;

  /** URL de origen */
  url: string;

  /** Timestamp de extracción */
  extractedAt: number;

  /** Conteo de palabras */
  wordCount: number;

  /** Idioma detectado (opcional) */
  language?: string;

  /** Metadata adicional */
  metadata?: {
    /** Autor si está disponible */
    author?: string;

    /** Fecha de publicación si está disponible */
    publishedAt?: string;

    /** Descripción/resumen */
    description?: string;
  };
}

/**
 * Opciones para extracción de contenido
 */
export interface ContentExtractionOptions {
  /** Incluir imágenes (URLs) */
  includeImages?: boolean;

  /** Incluir links */
  includeLinks?: boolean;

  /** Máximo número de palabras a extraer */
  maxWords?: number;

  /** Selectores CSS adicionales a remover */
  customSelectorsToRemove?: string[];
}

// ============================================================================
// WEB DOCUMENTS
// ============================================================================

/**
 * Documento web temporal procesado por RAG
 */
export interface WebDocument {
  /** ID único del documento */
  id: string;

  /** Tipo siempre 'web' */
  type: 'web';

  /** URL de origen */
  url: string;

  /** Título de la página */
  title: string;

  /** Contenido completo limpio */
  content: string;

  /** Chunks procesados con embeddings */
  chunks: WebDocumentChunk[];

  /** Marca como temporal (no persistir) */
  temporary: true;

  /** Timestamp de fetch */
  fetchedAt: number;

  /** TTL en milisegundos (default: 1 hora) */
  ttl?: number;

  /** Metadata adicional */
  metadata?: {
    /** Fuente de búsqueda que lo proporcionó */
    source: SearchSource;

    /** Query de búsqueda que lo encontró */
    searchQuery: string;

    /** Tamaño del HTML original */
    originalSize: number;

    /** Tiempo de fetch en ms */
    fetchTime: number;
  };
}

/**
 * Chunk de documento web con embedding
 */
export interface WebDocumentChunk {
  /** Contenido del chunk */
  content: string;

  /** Índice del chunk en el documento */
  index: number;

  /** Embedding vectorial */
  embedding: Float32Array;

  /** Metadata del chunk */
  metadata?: {
    /** Posición inicial en texto original */
    startChar: number;

    /** Posición final en texto original */
    endChar: number;

    /** Tipo de chunk */
    type: 'paragraph' | 'list' | 'heading' | 'mixed';

    /** Contexto previo */
    prevContext?: string;

    /** Contexto siguiente */
    nextContext?: string;
  };
}

// ============================================================================
// FETCHING
// ============================================================================

/**
 * Página HTML descargada
 */
export interface FetchedPage {
  /** URL de la página */
  url: string;

  /** HTML completo */
  html: string;

  /** Tamaño en bytes */
  size: number;

  /** Código de estado HTTP */
  status: number;

  /** Tiempo de descarga en ms */
  fetchTime: number;

  /** Headers relevantes */
  headers?: {
    contentType?: string;
    lastModified?: string;
    etag?: string;
  };
}

/**
 * Opciones para fetch de páginas
 */
export interface FetchOptions {
  /** Tamaño máximo en bytes */
  maxSize?: number;

  /** Timeout en ms */
  timeout?: number;

  /** Headers adicionales */
  headers?: Record<string, string>;

  /** Seguir redirects (default: true) */
  followRedirects?: boolean;

  /** Máximo número de redirects */
  maxRedirects?: number;
}

/**
 * Resultado de fetch (puede ser error)
 */
export type FetchResult =
  | { success: true; page: FetchedPage }
  | { success: false; url: string; error: string; errorType: FetchErrorType };

/**
 * Tipos de errores de fetch
 */
export type FetchErrorType =
  | 'timeout'
  | 'too_large'
  | 'invalid_content_type'
  | 'http_error'
  | 'network_error'
  | 'cors_error'
  | 'invalid_url';

// ============================================================================
// WEB RAG ORCHESTRATION
// ============================================================================

/**
 * Resultado completo de búsqueda web + RAG
 */
export interface WebRAGResult {
  /** Query original del usuario */
  query: string;

  /** Query de búsqueda generada por LLM */
  searchQuery: string;

  /** Resultados de búsqueda obtenidos */
  searchResults: SearchResult[];

  /** URLs seleccionadas por LLM */
  selectedUrls: string[];

  /** Contenidos limpios descargados */
  cleanedContents: CleanedContent[];

  /** Documentos web procesados */
  webDocuments: WebDocument[];

  /** Resultado del pipeline RAG */
  ragResult: {
    /** Chunks recuperados */
    chunks: RetrievedWebChunk[];

    /** Total de chunks buscados */
    totalSearched: number;

    /** Tiempo de búsqueda vectorial en ms */
    searchTime: number;
  };

  /** Respuesta generada por LLM */
  answer: string;

  /** Metadata del proceso */
  metadata: {
    /** Tiempo total en ms */
    totalTime: number;

    /** Número de fuentes usadas */
    sourcesUsed: number;

    /** Fuentes que fallaron */
    failedSources?: Array<{
      url: string;
      error: string;
    }>;

    /** Timestamps de cada fase */
    timestamps?: {
      queryGeneration: number;
      webSearch: number;
      urlSelection: number;
      pageFetch: number;
      contentExtraction: number;
      chunking: number;
      embedding: number;
      vectorSearch: number;
      answerGeneration: number;
    };
  };
}

/**
 * Chunk recuperado de documento web (con metadata enriquecida)
 */
export interface RetrievedWebChunk {
  /** Contenido del chunk */
  content: string;

  /** Score de similitud (0-1) */
  score: number;

  /** Documento de origen */
  document: {
    id: string;
    title: string;
    url: string;
    type: 'web';
  };

  /** Metadata del chunk */
  metadata?: {
    startChar?: number;
    endChar?: number;
    type?: string;
    prevContext?: string;
    nextContext?: string;
  };
}

/**
 * Opciones para WebRAGOrchestrator
 */
export interface WebRAGOptions {
  /** Fuentes de búsqueda a usar */
  sources?: SearchSource[];

  /** Número máximo de resultados de búsqueda */
  maxSearchResults?: number;

  /** Número máximo de URLs a descargar */
  maxUrlsToFetch?: number;

  /** Top-K para vector search */
  topK?: number;

  /** Usar cache de búsquedas recientes */
  useCache?: boolean;

  /** TTL del cache en ms */
  cacheTTL?: number;

  /** Requerir confirmación antes de abrir URLs */
  confirmUrls?: boolean;

  /** Callback para solicitar confirmación de URLs */
  onConfirmationRequest?: (urls: string[]) => Promise<string[] | null>;

  /** Callback de progreso */
  onProgress?: (step: WebSearchStep, progress: number, message?: string, data?: any) => void;

  /** Callback para streaming de tokens durante la generación de respuesta */
  onToken?: (token: string) => void;
}

/**
 * Pasos del proceso de búsqueda web
 */
export type WebSearchStep =
  | 'query_generation'
  | 'web_search'
  | 'url_selection'
  | 'url_confirmation'
  | 'page_fetch'
  | 'content_extraction'
  | 'chunking'
  | 'embedding'
  | 'vector_search'
  | 'answer_generation'
  | 'searching'
  | 'classification'
  | 'hyde'
  | 'reranking'
  | 'compression'
  | 'completed'
  | 'error';

/**
 * Evento de progreso
 */
export interface WebSearchProgressEvent {
  /** Paso actual */
  step: WebSearchStep;

  /** Progreso (0-100) */
  progress: number;

  /** Mensaje descriptivo */
  message?: string;

  /** Datos adicionales del paso */
  data?: Record<string, unknown>;
}

// ============================================================================
// SEARCH PROVIDERS
// ============================================================================

/**
 * Interfaz que deben implementar todos los providers
 */
export interface SearchProvider {
  /** Nombre del provider */
  readonly name: SearchSource;

  /**
   * Realizar búsqueda
   */
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  /**
   * Verificar si el provider está disponible
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Configuración de provider
 */
export interface ProviderConfig {
  /** URL base del servicio */
  baseUrl: string;

  /** Timeout por defecto en ms */
  defaultTimeout?: number;

  /** Rate limit (requests por minuto) */
  rateLimit?: number;

  /** Parámetros adicionales */
  params?: Record<string, string>;
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Configuración de rate limiting
 */
export interface RateLimitConfig {
  /** Máximo de requests por ventana */
  maxRequests: number;

  /** Tamaño de ventana en ms */
  windowMs: number;

  /** Estrategia cuando se excede el límite */
  strategy?: 'reject' | 'queue' | 'wait';
}

/**
 * Estado de rate limiting para un dominio
 */
export interface RateLimitState {
  /** Dominio */
  domain: string;

  /** Timestamps de requests recientes */
  requests: number[];

  /** Siguiente request permitido */
  nextAllowedAt: number;
}

// ============================================================================
// CACHING
// ============================================================================

/**
 * Entrada de cache de búsqueda
 */
export interface CachedSearchResult {
  /** Query de búsqueda */
  query: string;

  /** Resultados cacheados */
  results: SearchResult[];

  /** Timestamp de cache */
  cachedAt: number;

  /** TTL en ms */
  ttl: number;
}

/**
 * Entrada de cache de contenido
 */
export interface CachedContent {
  /** URL del contenido */
  url: string;

  /** Contenido limpio */
  content: CleanedContent;

  /** Timestamp de cache */
  cachedAt: number;

  /** TTL en ms */
  ttl: number;
}

// ============================================================================
// WORKER MESSAGES
// ============================================================================

/**
 * Request para el worker de búsqueda web
 */
export interface WebSearchWorkerRequest {
  /** Tipo de operación */
  type: 'fetch_pages' | 'fetch_page';

  /** Payload según tipo */
  payload:
    | { urls: string[]; options?: FetchOptions }
    | { url: string; options?: FetchOptions };
}

/**
 * Response del worker de búsqueda web
 */
export interface WebSearchWorkerResponse {
  /** Tipo de respuesta */
  type: 'success' | 'error' | 'progress';

  /** Resultado (si success) */
  result?: FetchedPage[] | FetchedPage;

  /** Error (si error) */
  error?: string;

  /** Progreso (si progress) */
  progress?: {
    current: number;
    total: number;
    message?: string;
  };
}

// ============================================================================
// ERRORS
// ============================================================================

/**
 * Error de búsqueda web
 */
export class WebSearchError extends Error {
  constructor(
    message: string,
    public readonly code: WebSearchErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'WebSearchError';
  }
}

/**
 * Códigos de error
 */
export type WebSearchErrorCode =
  | 'PROVIDER_UNAVAILABLE'
  | 'NO_RESULTS'
  | 'FETCH_FAILED'
  | 'EXTRACTION_FAILED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_URL'
  | 'TIMEOUT'
  | 'UNKNOWN';

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Validar si una URL es segura para fetch
 */
export function isValidWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Solo HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Blacklist de hosts
    const blacklist = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '169.254.169.254', // AWS metadata
    ];

    if (blacklist.some((b) => parsed.hostname.includes(b))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizar URL (remover fragmentos, ordenar params)
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Remover fragmento
    parsed.hash = '';

    // Ordenar query params
    const params = new URLSearchParams(parsed.search);
    const sortedParams = new URLSearchParams(
      Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b))
    );
    parsed.search = sortedParams.toString();

    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Extraer dominio de URL
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return '';
  }
}

/**
 * Calcular hash simple de string
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
