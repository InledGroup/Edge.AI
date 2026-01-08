/**
 * Browser Extension Search Provider
 * Uses the simplified extension bridge for web searches
 */

import type { SearchProvider, SearchResult, SearchOptions } from './types';
import { getExtensionBridgeSafe } from '../extension-bridge';

export class ExtensionSearchProvider implements SearchProvider {
  readonly name = 'extension' as const;

  constructor() {
    // Bridge is initialized lazily
  }

  /**
   * Perform search using browser extension
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { maxResults = 10 } = options;

    console.log(`[ExtensionSearch] 🔍 Starting search for: "${query}"`);

    try {
      // Get the extension bridge (safe for SSR)
      const bridge = getExtensionBridgeSafe();
      if (!bridge) {
        throw new Error('Extension bridge not available (SSR context)');
      }

      // Use the extension bridge (Search Only mode)
      // This gets results without opening tabs yet
      const response = await bridge.searchOnly(query, maxResults);

      if (!response.success) {
        throw new Error('Search failed');
      }

      // Convert extension results to SearchResult format
      const results: SearchResult[] = response.results.map((result) => ({
        title: result.title,
        snippet: result.snippet || 'No snippet available',
        url: result.url,
        source: 'extension' as const,
        fetchedAt: Date.now(),
        // Note: We don't have fullContent yet, it will be fetched later
      }));

      console.log(`[ExtensionSearch] ✅ Found ${results.length} results`);
      return results;

    } catch (error) {
      console.error('[ExtensionSearch] ❌ Search error:', error);
      throw error;
    }
  }

  /**
   * Check if extension is available
   */
  async isAvailable(): Promise<boolean> {
    const bridge = getExtensionBridgeSafe();
    if (!bridge) {
      return false;
    }

    const isConnected = bridge.isConnected();
    console.log(`[ExtensionSearch] Extension ${isConnected ? 'connected' : 'not connected'}`);
    return isConnected;
  }
}

/**
 * Create extension search provider
 */
export function createExtensionSearchProvider(): ExtensionSearchProvider {
  return new ExtensionSearchProvider();
}
