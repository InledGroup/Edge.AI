// ============================================================================
// Chunks Store - CRUD operations for document chunks
// ============================================================================

import { getDB } from './schema';
import type { Chunk } from '@/types';

/**
 * Create a new chunk
 */
export async function createChunk(
  chunk: Omit<Chunk, 'id'>
): Promise<Chunk> {
  const db = await getDB();

  const newChunk: Chunk = {
    ...chunk,
    id: crypto.randomUUID()
  };

  await db.add('chunks', newChunk);
  return newChunk;
}

/**
 * Batch create chunks
 */
export async function createChunksBatch(
  chunks: Array<Omit<Chunk, 'id'>>
): Promise<Chunk[]> {
  const db = await getDB();
  const tx = db.transaction('chunks', 'readwrite');

  const created: Chunk[] = [];

  for (const chunk of chunks) {
    const newChunk: Chunk = {
      ...chunk,
      id: crypto.randomUUID()
    };

    await tx.store.add(newChunk);
    created.push(newChunk);
  }

  await tx.done;
  return created;
}

/**
 * Get chunk by ID
 */
export async function getChunk(id: string): Promise<Chunk | undefined> {
  const db = await getDB();
  return db.get('chunks', id);
}

/**
 * Get all chunks for a document
 */
export async function getChunksByDocument(
  documentId: string
): Promise<Chunk[]> {
  const db = await getDB();
  const chunks = await db.getAllFromIndex('chunks', 'by-document', documentId);

  // Sort by index to maintain order
  return chunks.sort((a, b) => a.index - b.index);
}

/**
 * Get chunk by document and index
 */
export async function getChunkByIndex(
  documentId: string,
  index: number
): Promise<Chunk | undefined> {
  const chunks = await getChunksByDocument(documentId);
  return chunks.find(chunk => chunk.index === index);
}

/**
 * Get all chunks
 */
export async function getAllChunks(): Promise<Chunk[]> {
  const db = await getDB();
  return db.getAll('chunks');
}

/**
 * Update chunk
 */
export async function updateChunk(
  id: string,
  updates: Partial<Chunk>
): Promise<void> {
  const db = await getDB();
  const chunk = await db.get('chunks', id);

  if (!chunk) {
    throw new Error(`Chunk ${id} not found`);
  }

  const updatedChunk = { ...chunk, ...updates };
  await db.put('chunks', updatedChunk);
}

/**
 * Delete chunk
 */
export async function deleteChunk(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('chunks', id);
}

/**
 * Delete all chunks for a document
 */
export async function deleteChunksByDocument(
  documentId: string
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('chunks', 'readwrite');
  const keys = await tx.store.index('by-document').getAllKeys(documentId);

  for (const key of keys) {
    await tx.store.delete(key);
  }

  await tx.done;
}

/**
 * Get chunk count for a document
 */
export async function getChunkCountByDocument(
  documentId: string
): Promise<number> {
  const db = await getDB();
  return db.countFromIndex('chunks', 'by-document', documentId);
}

/**
 * Get total chunk count
 */
export async function getChunkCount(): Promise<number> {
  const db = await getDB();
  return db.count('chunks');
}

/**
 * Get chunks with their embeddings
 * Returns chunks that have associated embeddings
 */
export async function getChunksWithEmbeddings(
  documentId: string
): Promise<Chunk[]> {
  const db = await getDB();

  // Get all chunks for the document
  const chunks = await db.getAllFromIndex('chunks', 'by-document', documentId);

  // Get all embeddings for the document
  const embeddings = await db.getAllFromIndex('embeddings', 'by-document', documentId);
  const embeddedChunkIds = new Set(embeddings.map(e => e.chunkId));

  // Filter chunks that have embeddings
  return chunks.filter(chunk => embeddedChunkIds.has(chunk.id));
}

/**
 * Get chunks by IDs (for batch retrieval)
 */
export async function getChunksByIds(ids: string[]): Promise<Chunk[]> {
  const db = await getDB();
  const chunks: Chunk[] = [];

  for (const id of ids) {
    const chunk = await db.get('chunks', id);
    if (chunk) {
      chunks.push(chunk);
    }
  }

  return chunks;
}
