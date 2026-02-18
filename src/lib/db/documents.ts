// ============================================================================
// Document Store - CRUD operations for documents
// ============================================================================

import { getDB } from './schema';
import type { Document } from '@/types';
import { generateUUID } from '../utils';

/**
 * Create a new document
 */
export async function createDocument(
  document: Omit<Document, 'id' | 'uploadedAt' | 'status'>
): Promise<Document> {
  const db = await getDB();

  const newDoc: Document = {
    ...document,
    id: generateUUID(),
    uploadedAt: Date.now(),
    status: 'pending'
  };

  await db.add('documents', newDoc);
  return newDoc;
}

/**
 * Get document by ID
 */
export async function getDocument(id: string): Promise<Document | undefined> {
  const db = await getDB();
  return db.get('documents', id);
}

/**
 * Get all documents
 */
export async function getAllDocuments(): Promise<Document[]> {
  const db = await getDB();
  return db.getAll('documents');
}

/**
 * Get documents by status
 */
export async function getDocumentsByStatus(
  status: Document['status']
): Promise<Document[]> {
  const db = await getDB();
  return db.getAllFromIndex('documents', 'by-status', status);
}

/**
 * Update document
 */
export async function updateDocument(
  id: string,
  updates: Partial<Document>
): Promise<void> {
  const db = await getDB();
  const doc = await db.get('documents', id);

  if (!doc) {
    throw new Error(`Document ${id} not found`);
  }

  const updatedDoc = { ...doc, ...updates };
  await db.put('documents', updatedDoc);
}

/**
 * Update document status
 */
export async function updateDocumentStatus(
  id: string,
  status: Document['status'],
  errorMessage?: string
): Promise<void> {
  await updateDocument(id, {
    status,
    errorMessage,
    processedAt: status === 'ready' ? Date.now() : undefined
  });
}

/**
 * Delete document and all associated chunks/embeddings
 */
export async function deleteDocument(id: string): Promise<void> {
  const db = await getDB();

  // Dynamic list of stores to handle migrations safely
  const stores = ['documents', 'chunks', 'embeddings'];
  if (db.objectStoreNames.contains('chunk_relevance' as any)) {
    stores.push('chunk_relevance');
  }

  // Start transaction
  const tx = db.transaction(stores as any, 'readwrite');

  try {
    // Delete the document
    await tx.objectStore('documents').delete(id);

    // Delete all chunks for this document
    const chunksStore = tx.objectStore('chunks');
    const chunkKeys = await chunksStore.index('by-document').getAllKeys(id);
    
    const relevanceStore = db.objectStoreNames.contains('chunk_relevance' as any) 
      ? tx.objectStore('chunk_relevance' as any) 
      : null;

    for (const key of chunkKeys) {
      await chunksStore.delete(key);
      // Also delete associated relevance data
      if (relevanceStore) {
        await relevanceStore.delete(key);
      }
    }

    // Delete all embeddings for this document
    const embeddingsStore = tx.objectStore('embeddings');
    const embeddingKeys = await embeddingsStore
      .index('by-document')
      .getAllKeys(id);
    for (const key of embeddingKeys) {
      await embeddingsStore.delete(key);
    }

    await tx.done;
  } catch (error) {
    console.error('Failed to delete document:', error);
    throw error;
  }
}

/**
 * Delete all documents
 */
export async function deleteAllDocuments(): Promise<void> {
  const db = await getDB();
  const stores = ['documents', 'chunks', 'embeddings'];
  if (db.objectStoreNames.contains('chunk_relevance' as any)) {
    stores.push('chunk_relevance');
  }

  const tx = db.transaction(stores as any, 'readwrite');

  try {
    await tx.objectStore('documents').clear();
    await tx.objectStore('chunks').clear();
    await tx.objectStore('embeddings').clear();
    if (db.objectStoreNames.contains('chunk_relevance' as any)) {
      await tx.objectStore('chunk_relevance' as any).clear();
    }
    await tx.done;
  } catch (error) {
    console.error('Failed to delete all documents:', error);
    throw error;
  }
}

/**
 * Get document count
 */
export async function getDocumentCount(): Promise<number> {
  const db = await getDB();
  return db.count('documents');
}

/**
 * Check if document exists
 */
export async function documentExists(id: string): Promise<boolean> {
  const doc = await getDocument(id);
  return doc !== undefined;
}

/**
 * Get documents sorted by upload date (newest first)
 */
export async function getDocumentsSorted(): Promise<Document[]> {
  const db = await getDB();
  const docs = await db.getAllFromIndex('documents', 'by-uploaded');
  return docs.reverse();
}
