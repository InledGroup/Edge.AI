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

    // Construir URL con proxy si es necesario
    const corsProxy = this.getCorsProxy();
    const fullUrl = `${baseUrl}?${params}`;
    const url = corsProxy
      ? `${corsProxy}${encodeURIComponent(fullUrl)}`
      : fullUrl;

    console.log(`[Wikipedia] Using proxy: ${!!corsProxy}, URL: ${url.substring(0, 100)}...`);

    try {
      // Fetch con timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
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
 * Proveedor de búsqueda en DuckDuckGo (versión HTML)
 *
 * NOTA: DuckDuckGo HTML puede tener limitaciones CORS.
 * Esta implementación es experimental y puede fallar.
 */
export class DuckDuckGoSearchProvider implements SearchProvider {
  readonly name = 'duckduckgo' as const;

  private readonly baseUrl = 'https://html.duckduckgo.com/html/';
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
   * IMPORTANTE: DuckDuckGo puede bloquear requests desde navegador por CORS.
   * Este método puede fallar y debe ser tratado como fallback.
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const {
      maxResults = 10,
      timeout = this.timeout,
    } = options;

    // Construir form data (DuckDuckGo HTML usa POST)
    const formData = new URLSearchParams({
      q: query,
      b: '', // Offset (vacío = primera página)
      kl: 'wt-wt', // Región (wt-wt = mundial)
    });

    try {
      // Fetch con timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // Construir URL con proxy si es necesario
      const corsProxy = this.getCorsProxy();
      const url = corsProxy
        ? `${corsProxy}${encodeURIComponent(this.baseUrl)}`
        : this.baseUrl;

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
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
   * Parse HTML de resultados de DuckDuckGo
   */
  private parseResults(html: string): SearchResult[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const results: SearchResult[] = [];

    // DuckDuckGo HTML usa clase "result" para cada resultado
    const resultElements = doc.querySelectorAll('.result');

    resultElements.forEach((element) => {
      try {
        // Título y URL
        const linkElement = element.querySelector('.result__a');
        const title = linkElement?.textContent?.trim() || '';
        const url = this.extractUrl(linkElement?.getAttribute('href') || '');

        // Snippet
        const snippetElement = element.querySelector('.result__snippet');
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
      // Si es URL relativa de DuckDuckGo, extraer parámetro uddg
      if (href.startsWith('//duckduckgo.com/l/?')) {
        const params = new URLSearchParams(href.split('?')[1]);
        const uddg = params.get('uddg');
        if (uddg) {
          return decodeURIComponent(uddg);
        }
      }

      // Si ya es URL completa, retornar
      if (href.startsWith('http://') || href.startsWith('https://')) {
        return href;
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
