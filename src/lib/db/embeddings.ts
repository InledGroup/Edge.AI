// ============================================================================
// Embeddings Store - CRUD operations for vector embeddings
// ============================================================================

import { getDB } from './schema';
import type { Embedding, StoredEmbedding, Chunk } from '@/types';
import { generateUUID } from '../utils';

/**
 * Convert Float32Array to regular array for storage
 */
function serializeEmbedding(embedding: Embedding): StoredEmbedding {
  return {
    ...embedding,
    vector: Array.from(embedding.vector)
  };
}

/**
 * Convert regular array back to Float32Array
 */
function deserializeEmbedding(stored: StoredEmbedding): Embedding {
  return {
    ...stored,
    vector: new Float32Array(stored.vector)
  };
}

/**
 * Create embedding for a chunk
 */
export async function createEmbedding(
  chunkId: string,
  documentId: string,
  vector: Float32Array,
  model: string
): Promise<Embedding> {
  const db = await getDB();

  const embedding: Embedding = {
    id: generateUUID(),
    chunkId,
    documentId,
    vector,
    model,
    createdAt: Date.now()
  };

  await db.add('embeddings', serializeEmbedding(embedding));
  return embedding;
}

/**
 * Batch create embeddings
 */
export async function createEmbeddingsBatch(
  embeddings: Array<{
    chunkId: string;
    documentId: string;
    vector: Float32Array;
    model: string;
  }>
): Promise<Embedding[]> {
  const db = await getDB();
  const tx = db.transaction('embeddings', 'readwrite');

  const created: Embedding[] = [];

  for (const emb of embeddings) {
    const embedding: Embedding = {
      id: generateUUID(),
      chunkId: emb.chunkId,
      documentId: emb.documentId,
      vector: emb.vector,
      model: emb.model,
      createdAt: Date.now()
    };

    await tx.store.add(serializeEmbedding(embedding));
    created.push(embedding);
  }

  await tx.done;
  return created;
}

/**
 * Get embedding by ID
 */
export async function getEmbedding(
  id: string
): Promise<Embedding | undefined> {
  const db = await getDB();
  const stored = await db.get('embeddings', id);
  return stored ? deserializeEmbedding(stored) : undefined;
}

/**
 * Get embedding for a chunk
 */
export async function getEmbeddingByChunk(
  chunkId: string
): Promise<Embedding | undefined> {
  const db = await getDB();
  const stored = await db.getFromIndex('embeddings', 'by-chunk', chunkId);
  return stored ? deserializeEmbedding(stored) : undefined;
}

/**
 * Get all embeddings for a document
 */
export async function getEmbeddingsByDocument(
  documentId: string
): Promise<Embedding[]> {
  const db = await getDB();
  const stored = await db.getAllFromIndex(
    'embeddings',
    'by-document',
    documentId
  );
  return stored.map(deserializeEmbedding);
}

/**
 * Get all embeddings for a specific model
 */
export async function getEmbeddingsByModel(
  model: string
): Promise<Embedding[]> {
  const db = await getDB();
  const stored = await db.getAllFromIndex('embeddings', 'by-model', model);
  return stored.map(deserializeEmbedding);
}

/**
 * Get all embeddings (for vector search)
 */
export async function getAllEmbeddings(): Promise<Embedding[]> {
  const db = await getDB();
  const stored = await db.getAll('embeddings');
  return stored.map(deserializeEmbedding);
}

/**
 * Delete embedding
 */
export async function deleteEmbedding(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('embeddings', id);
}

/**
 * Delete all embeddings for a document
 */
export async function deleteEmbeddingsByDocument(
  documentId: string
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('embeddings', 'readwrite');
  const keys = await tx.store.index('by-document').getAllKeys(documentId);

  for (const key of keys) {
    await tx.store.delete(key);
  }

  await tx.done;
}

/**
 * Delete all embeddings for a specific model
 */
export async function deleteEmbeddingsByModel(model: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('embeddings', 'readwrite');
  const keys = await tx.store.index('by-model').getAllKeys(model);

  for (const key of keys) {
    await tx.store.delete(key);
  }

  await tx.done;
}

/**
 * Get embedding count
 */
export async function getEmbeddingCount(): Promise<number> {
  const db = await getDB();
  return db.count('embeddings');
}

/**
 * Check if embeddings exist for a document
 */
export async function hasEmbeddings(documentId: string): Promise<boolean> {
  const db = await getDB();
  const count = await db.countFromIndex(
    'embeddings',
    'by-document',
    documentId
  );
  return count > 0;
}
