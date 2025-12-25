/**
 * Web Content Cache - IndexedDB storage for web documents and embeddings
 *
 * Stores:
 * - Cleaned web content
 * - Generated embeddings
 * - Metadata (URL, fetch time, TTL)
 *
 * Benefits:
 * - Avoid re-fetching same pages
 * - Avoid re-generating embeddings
 * - Faster subsequent queries
 */

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'edge-ai-web-cache';
const DB_VERSION = 1;

const STORES = {
  WEB_PAGES: 'web_pages',
  WEB_EMBEDDINGS: 'web_embeddings'
} as const;

/**
 * Cached web page
 */
export interface CachedWebPage {
  url: string;              // Primary key
  title: string;
  content: string;
  cleanedAt: number;
  fetchedAt: number;
  ttl: number;              // Time to live in ms
  expiresAt: number;        // Calculated expiration
  metadata?: {
    wordCount?: number;
    author?: string;
    publishedAt?: string;
  };
}

/**
 * Cached web embedding
 */
export interface CachedWebEmbedding {
  id?: string;              // Auto-generated
  url: string;              // Foreign key to web_pages
  chunkIndex: number;
  chunkContent: string;
  embedding: Float32Array;
  model: string;            // Embedding model used
  createdAt: number;
}

let dbInstance: IDBPDatabase | null = null;

/**
 * Initialize web cache database
 */
async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Web pages store
      if (!db.objectStoreNames.contains(STORES.WEB_PAGES)) {
        const webPagesStore = db.createObjectStore(STORES.WEB_PAGES, {
          keyPath: 'url'
        });
        webPagesStore.createIndex('expiresAt', 'expiresAt');
        webPagesStore.createIndex('fetchedAt', 'fetchedAt');
      }

      // Web embeddings store
      if (!db.objectStoreNames.contains(STORES.WEB_EMBEDDINGS)) {
        const embeddingsStore = db.createObjectStore(STORES.WEB_EMBEDDINGS, {
          keyPath: 'id',
          autoIncrement: true
        });
        embeddingsStore.createIndex('url', 'url');
        embeddingsStore.createIndex('url_chunk', ['url', 'chunkIndex'], { unique: true });
      }
    },
  });

  return dbInstance;
}

/**
 * Store web page in cache
 */
export async function cacheWebPage(page: Omit<CachedWebPage, 'expiresAt'>): Promise<void> {
  const db = await getDB();

  const cachedPage: CachedWebPage = {
    ...page,
    expiresAt: page.fetchedAt + page.ttl
  };

  await db.put(STORES.WEB_PAGES, cachedPage);

  console.log(`💾 [WebCache] Cached page: ${page.url} (TTL: ${page.ttl / 1000}s)`);
}

/**
 * Get cached web page
 */
export async function getCachedWebPage(url: string): Promise<CachedWebPage | null> {
  const db = await getDB();

  const page = await db.get(STORES.WEB_PAGES, url);

  if (!page) {
    return null;
  }

  // Check if expired
  if (Date.now() > page.expiresAt) {
    console.log(`⏰ [WebCache] Page expired: ${url}`);
    await deleteCachedWebPage(url);
    return null;
  }

  console.log(`✅ [WebCache] Cache hit: ${url}`);
  return page;
}

/**
 * Delete cached web page and its embeddings
 */
export async function deleteCachedWebPage(url: string): Promise<void> {
  const db = await getDB();

  // Delete page
  await db.delete(STORES.WEB_PAGES, url);

  // Delete associated embeddings
  const tx = db.transaction(STORES.WEB_EMBEDDINGS, 'readwrite');
  const index = tx.store.index('url');
  const embeddings = await index.getAllKeys(url);

  for (const key of embeddings) {
    await tx.store.delete(key);
  }

  await tx.done;

  console.log(`🗑️ [WebCache] Deleted page and embeddings: ${url}`);
}

/**
 * Store web embeddings for a page
 */
export async function cacheWebEmbeddings(
  url: string,
  embeddings: Array<{
    chunkIndex: number;
    chunkContent: string;
    embedding: Float32Array;
    model: string;
  }>
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORES.WEB_EMBEDDINGS, 'readwrite');

  const createdAt = Date.now();

  for (const emb of embeddings) {
    const cached: Omit<CachedWebEmbedding, 'id'> = {
      url,
      chunkIndex: emb.chunkIndex,
      chunkContent: emb.chunkContent,
      embedding: emb.embedding,
      model: emb.model,
      createdAt
    };

    await tx.store.put(cached);
  }

  await tx.done;

  console.log(`💾 [WebCache] Cached ${embeddings.length} embeddings for: ${url}`);
}

/**
 * Get cached embeddings for a page
 */
export async function getCachedWebEmbeddings(url: string): Promise<CachedWebEmbedding[]> {
  const db = await getDB();

  const tx = db.transaction(STORES.WEB_EMBEDDINGS, 'readonly');
  const index = tx.store.index('url');
  const embeddings = await index.getAll(url);

  await tx.done;

  if (embeddings.length > 0) {
    console.log(`✅ [WebCache] Found ${embeddings.length} cached embeddings for: ${url}`);
  }

  return embeddings;
}

/**
 * Clean up expired pages
 */
export async function cleanupExpiredPages(): Promise<number> {
  const db = await getDB();

  const now = Date.now();
  const tx = db.transaction(STORES.WEB_PAGES, 'readwrite');
  const index = tx.store.index('expiresAt');

  // Get all expired pages
  const expiredPages = await index.getAll(IDBKeyRange.upperBound(now));

  for (const page of expiredPages) {
    await deleteCachedWebPage(page.url);
  }

  await tx.done;

  if (expiredPages.length > 0) {
    console.log(`🧹 [WebCache] Cleaned up ${expiredPages.length} expired pages`);
  }

  return expiredPages.length;
}

/**
 * Get cache statistics
 */
export async function getWebCacheStats() {
  const db = await getDB();

  const pages = await db.getAll(STORES.WEB_PAGES);
  const embeddings = await db.getAll(STORES.WEB_EMBEDDINGS);

  const now = Date.now();
  const activePagesCount = pages.filter(p => p.expiresAt > now).length;
  const expiredPagesCount = pages.length - activePagesCount;

  const totalContentSize = pages.reduce((sum, p) => sum + p.content.length, 0);

  return {
    totalPages: pages.length,
    activePages: activePagesCount,
    expiredPages: expiredPagesCount,
    totalEmbeddings: embeddings.length,
    totalContentSize,
    avgEmbeddingsPerPage: pages.length > 0
      ? Math.round(embeddings.length / pages.length)
      : 0
  };
}

/**
 * Clear all web cache
 */
export async function clearWebCache(): Promise<void> {
  const db = await getDB();

  const tx = db.transaction([STORES.WEB_PAGES, STORES.WEB_EMBEDDINGS], 'readwrite');

  await tx.objectStore(STORES.WEB_PAGES).clear();
  await tx.objectStore(STORES.WEB_EMBEDDINGS).clear();

  await tx.done;

  console.log('🗑️ [WebCache] Cleared all web cache');
}
