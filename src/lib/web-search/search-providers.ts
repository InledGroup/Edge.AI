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
   * Realiza búsqueda en Wikipedia
   * DEPRECATED: Solo usar con extensión del navegador
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    throw new Error('Wikipedia search provider requires browser extension. Please install and configure the Edge.AI browser extension.');
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
   * Realiza búsqueda en DuckDuckGo
   * DEPRECATED: Solo usar con extensión del navegador
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    throw new Error('DuckDuckGo search provider requires browser extension. Please install and configure the Edge.AI browser extension.');
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
