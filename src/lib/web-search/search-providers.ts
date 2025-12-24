/**
 * Search Providers
 *
 * Implementaciones de proveedores de búsqueda web:
 * - Wikipedia
 * - DuckDuckGo HTML
 */

import type { SearchProvider, SearchResult, SearchOptions } from './types';

// ============================================================================
// WIKIPEDIA SEARCH PROVIDER
// ============================================================================

/**
 * Proveedor de búsqueda en Wikipedia
 *
 * Usa la API pública de Wikipedia (OpenSearch) que soporta CORS.
 */
export class WikipediaSearchProvider implements SearchProvider {
  readonly name = 'wikipedia' as const;

  private readonly baseUrls = {
    es: 'https://es.wikipedia.org/w/api.php',
    en: 'https://en.wikipedia.org/w/api.php',
  };

  private readonly defaultLanguage: 'es' | 'en' = 'es';
  private readonly timeout = 10000; // 10 segundos

  /**
   * Detecta si estamos en localhost (solo en cliente)
   */
  private isLocalhost(): boolean {
    if (typeof window === 'undefined') return false;
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  }

  /**
   * Obtiene el proxy CORS si es necesario
   */
  private getCorsProxy(): string {
    // Usar proxy personalizado de InLed para evitar problemas CORS
    return 'https://aiproxy.inled.es/?url=';
  }

  /**
   * Realiza búsqueda en Wikipedia
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const {
      maxResults = 10,
      language = this.defaultLanguage,
      timeout = this.timeout,
    } = options;

    const baseUrl = this.baseUrls[language as keyof typeof this.baseUrls] || this.baseUrls.es;

    // Construir URL de búsqueda
    const params = new URLSearchParams({
      action: 'opensearch',
      search: query,
      limit: String(Math.min(maxResults, 10)), // Wikipedia limita a 10
      namespace: '0', // Solo artículos
      format: 'json',
      origin: '*', // Habilitar CORS
    });

    // Construir URL completa
    const fullUrl = `${baseUrl}?${params}`;

    // Usar proxy para evitar CORS
    const corsProxy = this.getCorsProxy();
    const url = `${corsProxy}${encodeURIComponent(fullUrl)}`;

    console.log(`[Wikipedia] Using proxy, target: ${fullUrl.substring(0, 80)}...`);

    try {
      // Fetch con timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Wikipedia API returned ${response.status}: ${response.statusText}`);
      }

      // Parse response
      // Formato: [query, [titles], [descriptions], [urls]]
      const data = await response.json();

      if (!Array.isArray(data) || data.length < 4) {
        throw new Error('Invalid Wikipedia API response format');
      }

      const [, titles, snippets, urls] = data;

      // Convertir a SearchResult[]
      const results: SearchResult[] = titles.map((title: string, i: number) => ({
        title: title || 'Sin título',
        snippet: snippets[i] || '',
        url: urls[i] || '',
        source: 'wikipedia' as const,
        fetchedAt: Date.now(),
      }));

      return results;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Wikipedia search timed out');
      }
      throw error;
    }
  }

  /**
   * Verifica si Wikipedia está disponible
   */
  async isAvailable(): Promise<boolean> {
    // Siempre está disponible ya que usamos proxy CORS
    return true;
  }
}

// ============================================================================
// DUCKDUCKGO HTML SEARCH PROVIDER
// ============================================================================

/**
 * Proveedor de búsqueda en DuckDuckGo Lite
 *
 * Usa la versión Lite que soporta GET y funciona mejor con proxies.
 */
export class DuckDuckGoSearchProvider implements SearchProvider {
  readonly name = 'duckduckgo' as const;

  private readonly timeout = 10000; // 10 segundos

  /**
   * Detecta si estamos en localhost (solo en cliente)
   */
  private isLocalhost(): boolean {
    if (typeof window === 'undefined') return false;
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  }

  /**
   * Obtiene el proxy CORS si es necesario
   */
  private getCorsProxy(): string {
    // Usar proxy personalizado de InLed para evitar problemas CORS
    return 'https://aiproxy.inled.es/?url=';
  }

  /**
   * Realiza búsqueda en DuckDuckGo
   *
   * Usa la versión Lite de DuckDuckGo que soporta GET
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const {
      maxResults = 10,
      timeout = this.timeout,
    } = options;

    // Construir query params para DuckDuckGo Lite (soporta GET)
    const params = new URLSearchParams({
      q: query,
      kl: 'wt-wt', // Región (wt-wt = mundial)
    });

    // Usar DuckDuckGo Lite que funciona mejor con proxies
    const fullUrl = `https://lite.duckduckgo.com/lite/?${params}`;

    try {
      // Fetch con timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Construir URL con proxy
      const corsProxy = this.getCorsProxy();
      const url = `${corsProxy}${encodeURIComponent(fullUrl)}`;

      console.log(`[DuckDuckGo] Using proxy, target: ${fullUrl.substring(0, 80)}...`);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'text/html',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`DuckDuckGo returned ${response.status}: ${response.statusText}`);
      }

      // Parse HTML
      const html = await response.text();
      const results = this.parseResults(html);

      return results.slice(0, maxResults);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('DuckDuckGo search timed out');
        }
        if (error.message.includes('CORS') || error.message.includes('blocked')) {
          throw new Error('DuckDuckGo blocked by CORS - use Wikipedia instead');
        }
      }
      throw error;
    }
  }

  /**
   * Parse HTML de resultados de DuckDuckGo Lite
   */
  private parseResults(html: string): SearchResult[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const results: SearchResult[] = [];

    // DuckDuckGo Lite usa tabla para resultados
    const rows = doc.querySelectorAll('tr');

    rows.forEach((row) => {
      try {
        // Buscar el link principal (clase "result-link")
        const linkElement = row.querySelector('a.result-link');
        if (!linkElement) return;

        const title = linkElement.textContent?.trim() || '';
        const href = linkElement.getAttribute('href') || '';
        const url = this.extractUrl(href);

        // Buscar el snippet (clase "result-snippet")
        const snippetElement = row.querySelector('.result-snippet');
        const snippet = snippetElement?.textContent?.trim() || '';

        if (title && url) {
          results.push({
            title,
            snippet,
            url,
            source: 'duckduckgo' as const,
            fetchedAt: Date.now(),
          });
        }
      } catch (error) {
        // Skip resultado inválido
        console.warn('Failed to parse DuckDuckGo result:', error);
      }
    });

    return results;
  }

  /**
   * Extrae URL real de un link de DuckDuckGo
   * (DuckDuckGo envuelve URLs en redirects)
   */
  private extractUrl(href: string): string {
    if (!href) return '';

    try {
      // DuckDuckGo Lite usa formato: //duckduckgo.com/l/?uddg=URL
      if (href.includes('//duckduckgo.com/l/') || href.includes('//lite.duckduckgo.com/lite/')) {
        const url = new URL(href.startsWith('//') ? 'https:' + href : href);
        const uddg = url.searchParams.get('uddg');
        if (uddg) {
          return decodeURIComponent(uddg);
        }
      }

      // Si ya es URL completa, retornar
      if (href.startsWith('http://') || href.startsWith('https://')) {
        return href;
      }

      // Si es URL relativa que empieza con //, agregar https:
      if (href.startsWith('//')) {
        return 'https:' + href;
      }

      return '';
    } catch {
      return '';
    }
  }

  /**
   * Verifica si DuckDuckGo está disponible
   */
  async isAvailable(): Promise<boolean> {
    // Siempre está disponible ya que usamos proxy CORS
    return true;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Crea una instancia del provider según nombre
 */
export function createSearchProvider(name: 'wikipedia' | 'duckduckgo'): SearchProvider {
  switch (name) {
    case 'wikipedia':
      return new WikipediaSearchProvider();
    case 'duckduckgo':
      return new DuckDuckGoSearchProvider();
    default:
      throw new Error(`Unknown search provider: ${name}`);
  }
}

/**
 * Providers disponibles por defecto
 */
export const DEFAULT_PROVIDERS: SearchProvider[] = [
  new WikipediaSearchProvider(),
  // DuckDuckGo está disponible pero puede fallar por CORS
  // new DuckDuckGoSearchProvider(),
];
