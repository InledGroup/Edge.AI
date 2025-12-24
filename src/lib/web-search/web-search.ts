/**
 * Web Search Service
 *
 * Servicio principal de búsqueda web que coordina múltiples providers
 * y maneja caching, rate limiting y deduplicación.
 */

import type {
  SearchProvider,
  SearchResult,
  SearchOptions,
  SearchSource,
  CachedSearchResult,
  RateLimitState,
} from './types';
import {
  WikipediaSearchProvider,
  DuckDuckGoSearchProvider,
} from './search-providers';
import { normalizeUrl, simpleHash } from './types';

/**
 * Servicio de búsqueda web
 */
export class WebSearchService {
  private providers: Map<SearchSource, SearchProvider> = new Map();
  private searchCache: Map<string, CachedSearchResult> = new Map();
  private rateLimits: Map<string, RateLimitState> = new Map();

  // Configuración
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutos
  private readonly rateLimitWindow = 60 * 1000; // 1 minuto
  private readonly maxRequestsPerWindow = 10; // 10 requests/minuto por provider

  constructor(providers?: SearchProvider[]) {
    // Inicializar providers por defecto
    if (providers && providers.length > 0) {
      providers.forEach((p) => this.providers.set(p.name, p));
    } else {
      // Usar Wikipedia por defecto (más confiable con CORS)
      this.providers.set('wikipedia', new WikipediaSearchProvider());
      // DuckDuckGo disponible pero puede fallar
      this.providers.set('duckduckgo', new DuckDuckGoSearchProvider());
    }

    // Cleanup periódico de cache
    setInterval(() => this.cleanupCache(), this.cacheTTL);
  }

  /**
   * Realiza búsqueda web coordinando múltiples providers
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      maxResults = 10,
      sources,
      timeout = 10000,
    } = options;

    // Validar query
    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }

    const normalizedQuery = query.trim().toLowerCase();

    // Intentar obtener de cache
    if (options.timeout !== 0) {
      // timeout=0 significa skip cache
      const cached = this.getCachedResults(normalizedQuery);
      if (cached) {
        console.log(`[WebSearch] Cache hit for query: "${query}"`);
        return cached.slice(0, maxResults);
      }
    }

    // Determinar providers a usar
    const providersToUse = sources
      ? sources.map((s) => this.providers.get(s)).filter(Boolean) as SearchProvider[]
      : Array.from(this.providers.values());

    if (providersToUse.length === 0) {
      throw new Error('No search providers available');
    }

    // Buscar en paralelo con manejo de errores
    const results = await this.searchParallel(
      query,
      providersToUse,
      { ...options, maxResults, timeout }
    );

    // Deduplicar resultados
    const deduplicated = this.deduplicateResults(results);

    // Cachear resultados
    this.cacheResults(normalizedQuery, deduplicated);

    return deduplicated.slice(0, maxResults);
  }

  /**
   * Busca en múltiples providers en paralelo
   */
  private async searchParallel(
    query: string,
    providers: SearchProvider[],
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const searchPromises = providers.map(async (provider) => {
      try {
        // Verificar rate limit
        if (!this.checkRateLimit(provider.name)) {
          console.warn(`[WebSearch] Rate limit exceeded for ${provider.name}`);
          return [];
        }

        // Verificar disponibilidad
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          console.warn(`[WebSearch] Provider ${provider.name} is not available`);
          return [];
        }

        // Realizar búsqueda
        console.log(`[WebSearch] Searching with ${provider.name}...`);
        const results = await provider.search(query, options);

        // Registrar request en rate limit
        this.recordRequest(provider.name);

        console.log(`[WebSearch] ${provider.name} returned ${results.length} results`);
        return results;
      } catch (error) {
        console.error(`[WebSearch] Provider ${provider.name} failed:`, error);
        return [];
      }
    });

    // Esperar todos los resultados
    const resultsArrays = await Promise.all(searchPromises);

    // Combinar resultados
    return resultsArrays.flat();
  }

  /**
   * Deduplicar resultados por URL normalizada
   */
  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Map<string, SearchResult>();

    for (const result of results) {
      try {
        const normalizedUrl = normalizeUrl(result.url);

        // Si no hemos visto esta URL, agregarla
        if (!seen.has(normalizedUrl)) {
          seen.set(normalizedUrl, result);
        }
        // Si ya existe, preferir el que tenga snippet más largo
        else {
          const existing = seen.get(normalizedUrl)!;
          if (result.snippet.length > existing.snippet.length) {
            seen.set(normalizedUrl, result);
          }
        }
      } catch {
        // URL inválida, skip
        continue;
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Obtiene resultados cacheados si están vigentes
   */
  private getCachedResults(query: string): SearchResult[] | null {
    const cacheKey = this.getCacheKey(query);
    const cached = this.searchCache.get(cacheKey);

    if (!cached) {
      return null;
    }

    // Verificar TTL
    const now = Date.now();
    if (now - cached.cachedAt > cached.ttl) {
      this.searchCache.delete(cacheKey);
      return null;
    }

    return cached.results;
  }

  /**
   * Cachea resultados de búsqueda
   */
  private cacheResults(query: string, results: SearchResult[]): void {
    const cacheKey = this.getCacheKey(query);

    this.searchCache.set(cacheKey, {
      query,
      results,
      cachedAt: Date.now(),
      ttl: this.cacheTTL,
    });
  }

  /**
   * Genera key de cache para una query
   */
  private getCacheKey(query: string): string {
    return `search:${simpleHash(query.toLowerCase())}`;
  }

  /**
   * Limpia cache de búsquedas expiradas
   */
  private cleanupCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.searchCache.forEach((cached, key) => {
      if (now - cached.cachedAt > cached.ttl) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => this.searchCache.delete(key));

    if (keysToDelete.length > 0) {
      console.log(`[WebSearch] Cleaned up ${keysToDelete.length} expired cache entries`);
    }
  }

  /**
   * Verifica rate limit para un provider
   */
  private checkRateLimit(providerName: string): boolean {
    const state = this.rateLimits.get(providerName);

    if (!state) {
      return true; // No hay historial, permitir
    }

    const now = Date.now();
    const windowStart = now - this.rateLimitWindow;

    // Filtrar requests dentro de la ventana
    const recentRequests = state.requests.filter((t) => t > windowStart);

    return recentRequests.length < this.maxRequestsPerWindow;
  }

  /**
   * Registra un request para rate limiting
   */
  private recordRequest(providerName: string): void {
    const now = Date.now();
    const windowStart = now - this.rateLimitWindow;

    let state = this.rateLimits.get(providerName);

    if (!state) {
      state = {
        domain: providerName,
        requests: [],
        nextAllowedAt: now,
      };
      this.rateLimits.set(providerName, state);
    }

    // Limpiar requests antiguos
    state.requests = state.requests.filter((t) => t > windowStart);

    // Agregar nuevo request
    state.requests.push(now);

    // Calcular próximo request permitido si se alcanzó el límite
    if (state.requests.length >= this.maxRequestsPerWindow) {
      const oldestRequest = Math.min(...state.requests);
      state.nextAllowedAt = oldestRequest + this.rateLimitWindow;
    }
  }

  /**
   * Limpia el cache manualmente
   */
  clearCache(): void {
    this.searchCache.clear();
    console.log('[WebSearch] Cache cleared');
  }

  /**
   * Obtiene estadísticas del servicio
   */
  getStats() {
    return {
      cacheSize: this.searchCache.size,
      providers: Array.from(this.providers.keys()),
      rateLimits: Array.from(this.rateLimits.entries()).map(([provider, state]) => ({
        provider,
        recentRequests: state.requests.length,
        nextAllowedAt: state.nextAllowedAt,
      })),
    };
  }

  /**
   * Registra un provider personalizado
   */
  registerProvider(provider: SearchProvider): void {
    this.providers.set(provider.name, provider);
    console.log(`[WebSearch] Registered provider: ${provider.name}`);
  }

  /**
   * Elimina un provider
   */
  unregisterProvider(name: SearchSource): void {
    this.providers.delete(name);
    console.log(`[WebSearch] Unregistered provider: ${name}`);
  }
}

/**
 * Instancia singleton del servicio
 */
export const webSearchService = new WebSearchService();
