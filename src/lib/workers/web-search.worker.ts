/**
 * Web Search Worker
 *
 * Worker dedicado para fetch controlado de páginas web.
 * Ejecuta descarga de HTML en background con límites estrictos.
 */

import type { FetchedPage, FetchOptions } from '../web-search/types';

// ============================================================================
// WORKER MESSAGE TYPES
// ============================================================================

interface FetchPageMessage {
  url: string;
  options?: FetchOptions;
}

interface FetchPagesMessage {
  urls: string[];
  options?: FetchOptions;
}

// ============================================================================
// WORKER MESSAGE HANDLERS
// ============================================================================

/**
 * Detecta si estamos en localhost (para usar proxy CORS)
 */
function isLocalhost(): boolean {
  if (typeof self === 'undefined') return false;
  // En workers, self.location existe
  return self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';
}

/**
 * Obtiene el proxy CORS si es necesario
 */
function getCorsProxy(): string {
  return isLocalhost() ? 'https://corsproxy.io/?' : '';
}

/**
 * Descarga una única página web
 */
async function fetchPage(
  url: string,
  options: FetchOptions = {}
): Promise<FetchedPage> {
  const {
    maxSize = 500 * 1024, // 500KB por defecto
    timeout = 10000, // 10s por defecto
    headers = {},
    followRedirects = true,
    maxRedirects = 3,
  } = options;

  const startTime = Date.now();

  // Validar URL
  if (!isValidUrl(url)) {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Aplicar proxy CORS si estamos en localhost
  const corsProxy = getCorsProxy();
  const fetchUrl = corsProxy ? `${corsProxy}${encodeURIComponent(url)}` : url;

  console.log(`[WebSearchWorker] Fetching: ${url} (proxy: ${!!corsProxy})`);

  // Crear AbortController para timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Realizar fetch
    const response = await fetch(fetchUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'EdgeAI/1.0 (Local Browser Agent; +https://github.com/yourusername/edge-ai)',
        ...headers,
      },
      redirect: followRedirects ? 'follow' : 'manual',
    });

    clearTimeout(timeoutId);

    // Verificar status
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Verificar Content-Type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error(`Invalid content type: ${contentType}. Expected text/html.`);
    }

    // Leer body con límite de tamaño
    const html = await readBodyWithLimit(response, maxSize);

    // Extraer headers relevantes
    const responseHeaders = {
      contentType: response.headers.get('content-type') || undefined,
      lastModified: response.headers.get('last-modified') || undefined,
      etag: response.headers.get('etag') || undefined,
    };

    const fetchTime = Date.now() - startTime;

    return {
      url: response.url, // URL final después de redirects
      html,
      size: html.length,
      status: response.status,
      fetchTime,
      headers: responseHeaders,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    // Manejar diferentes tipos de errores
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(`Fetch timeout after ${timeout}ms`);
      }
      throw error;
    }

    throw new Error(`Unknown fetch error: ${String(error)}`);
  }
}

/**
 * Descarga múltiples páginas en paralelo
 */
async function fetchPages(
  urls: string[],
  options: FetchOptions = {}
): Promise<FetchedPage[]> {
  // Validar que no haya demasiadas URLs
  if (urls.length > 10) {
    throw new Error(`Too many URLs: ${urls.length}. Maximum is 10.`);
  }

  if (urls.length === 0) {
    return [];
  }

  // Fetch todas en paralelo usando Promise.allSettled
  const results = await Promise.allSettled(
    urls.map((url) => fetchPage(url, options))
  );

  // Separar éxitos y fallos
  const successfulPages: FetchedPage[] = [];
  const failedUrls: Array<{ url: string; error: string }> = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successfulPages.push(result.value);
    } else {
      failedUrls.push({
        url: urls[index],
        error: result.reason?.message || String(result.reason),
      });
    }
  });

  // Log de errores
  if (failedUrls.length > 0) {
    console.warn(`[WebSearchWorker] ${failedUrls.length} URLs failed to fetch:`, failedUrls);
  }

  return successfulPages;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Valida que una URL sea segura para fetch
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Solo HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Blacklist de hosts peligrosos
    const blacklist = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      '10.', // Private network
      '172.16.', // Private network
      '192.168.', // Private network
      '169.254.169.254', // AWS metadata
      'metadata.google.internal', // GCP metadata
    ];

    const hostname = parsed.hostname.toLowerCase();
    if (blacklist.some((b) => hostname.includes(b))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Lee el body de una response con límite de tamaño
 */
async function readBodyWithLimit(
  response: Response,
  maxSize: number
): Promise<string> {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalSize += value.length;

      // Verificar límite de tamaño
      if (totalSize > maxSize) {
        reader.cancel();
        throw new Error(
          `Response too large: ${totalSize} bytes (max: ${maxSize} bytes)`
        );
      }

      chunks.push(value);
    }

    // Combinar todos los chunks
    const allChunks = new Uint8Array(totalSize);
    let position = 0;

    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    // Decodificar a string
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(allChunks);
  } catch (error) {
    reader.cancel();
    throw error;
  }
}

// ============================================================================
// WORKER MESSAGE HANDLER
// ============================================================================

/**
 * Handler principal de mensajes del worker
 */
self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  try {
    let result: unknown;

    switch (type) {
      case 'fetch-page': {
        const { url, options } = payload as FetchPageMessage;
        result = await fetchPage(url, options);
        break;
      }

      case 'fetch-pages': {
        const { urls, options } = payload as FetchPagesMessage;
        result = await fetchPages(urls, options);
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    // Enviar respuesta exitosa
    self.postMessage({
      id,
      type: 'success',
      payload: result,
    });
  } catch (error) {
    // Enviar respuesta de error
    self.postMessage({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

// Log de inicio del worker
console.log('[WebSearchWorker] Initialized');
