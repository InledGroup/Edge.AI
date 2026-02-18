// ============================================================================
// IndexedDB Schema - Edge.AI
// ============================================================================

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type {
  Document,
  Chunk,
  StoredEmbedding,
  Conversation,
  Settings,
  CustomApp
} from '../../types';

/**
 * Database schema definition
 */
export interface EdgeAIDB extends DBSchema {
  documents: {
    key: string;
    value: Document;
    indexes: {
      'by-status': string;
      'by-uploaded': number;
    };
  };
  chunks: {
    key: string;
    value: Chunk;
    indexes: {
      'by-document': string;
      'by-index': number;
    };
  };
  embeddings: {
    key: string;
    value: StoredEmbedding;
    indexes: {
      'by-chunk': string;
      'by-document': string;
      'by-model': string;
    };
  };
  conversations: {
    key: string;
    value: Conversation;
    indexes: {
      'by-updated': number;
      'by-created': number;
    };
  };
  memories: {
    key: string;
    value: {
      id: string;
      content: string;
      createdAt: number;
      source: 'user' | 'system';
      tags?: string[];
    };
    indexes: {
      'by-created': number;
    };
  };
  mcp_servers: {
    key: string;
    value: {
      id: string;
      name: string;
      url: string;
      transport: 'http' | 'websocket';
      headers?: Record<string, string>;
      enabled: boolean;
      status: 'connected' | 'disconnected' | 'error';
      createdAt: number;
    };
    indexes: {
      'by-status': string;
    };
  };
  custom_apps: {
    key: string;
    value: CustomApp;
    indexes: {
      'by-created': number;
    };
  };
  chunk_relevance: {
    key: string; // chunkId
    value: {
      chunkId: string;
      relevanceBoost: number; // Factor to multiply the score
      votes: number;
      lastVote?: 'up' | 'down' | null;
      lastUpdated: number;
    };
  };
  settings: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'edge-ai-db';
const DB_VERSION = 9;

let dbInstance: IDBPDatabase<EdgeAIDB> | null = null;

/**
 * Initialize and return the database instance
 */
export async function getDB(): Promise<IDBPDatabase<EdgeAIDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<EdgeAIDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      console.log(`Upgrading DB from version ${oldVersion} to ${newVersion}`);

      // Documents store
      if (!db.objectStoreNames.contains('documents')) {
        const documentsStore = db.createObjectStore('documents', {
          keyPath: 'id'
        });
        documentsStore.createIndex('by-status', 'status');
        documentsStore.createIndex('by-uploaded', 'uploadedAt');
      }

      // Chunks store
      if (!db.objectStoreNames.contains('chunks')) {
        const chunksStore = db.createObjectStore('chunks', {
          keyPath: 'id'
        });
        chunksStore.createIndex('by-document', 'documentId');
        chunksStore.createIndex('by-index', 'index');
      }

      // Embeddings store
      if (!db.objectStoreNames.contains('embeddings')) {
        const embeddingsStore = db.createObjectStore('embeddings', {
          keyPath: 'id'
        });
        embeddingsStore.createIndex('by-chunk', 'chunkId');
        embeddingsStore.createIndex('by-document', 'documentId');
        embeddingsStore.createIndex('by-model', 'model');
      }

      // Conversations store
      if (!db.objectStoreNames.contains('conversations')) {
        const conversationsStore = db.createObjectStore('conversations', {
          keyPath: 'id'
        });
        conversationsStore.createIndex('by-updated', 'updatedAt');
        conversationsStore.createIndex('by-created', 'createdAt');
      }

      // Memories store
      if (!db.objectStoreNames.contains('memories')) {
        const memoriesStore = db.createObjectStore('memories', {
          keyPath: 'id'
        });
        memoriesStore.createIndex('by-created', 'createdAt');
      }

      // MCP Servers store
      if (!db.objectStoreNames.contains('mcp_servers')) {
        const mcpStore = db.createObjectStore('mcp_servers', {
          keyPath: 'id'
        });
        mcpStore.createIndex('by-status', 'status');
      }

      // Custom Apps store
      if (!db.objectStoreNames.contains('custom_apps')) {
        const customAppsStore = db.createObjectStore('custom_apps', {
          keyPath: 'id'
        });
        customAppsStore.createIndex('by-created', 'createdAt');
      }

      // Chunk relevance store (for learning)
      if (!db.objectStoreNames.contains('chunk_relevance')) {
        db.createObjectStore('chunk_relevance', {
          keyPath: 'chunkId'
        });
      }

      // Settings store (key-value)
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    },
    blocked() {
      console.warn('DB upgrade blocked - close other tabs');
      alert('La actualización de la base de datos está bloqueada. Por favor, cierra otras pestañas de esta aplicación y recarga.');
    },
    blocking() {
      console.warn('DB blocking a newer version');
      // Close the database to allow the upgrade
      dbInstance?.close();
      dbInstance = null;
    },
    terminated() {
      console.error('DB connection terminated unexpectedly');
      dbInstance = null;
    }
  });

  return dbInstance;
}

/**
 * Close the database connection
 */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Delete the entire database (for testing/reset)
 */
export async function deleteDatabase(): Promise<void> {
  closeDB();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn('Database deletion blocked');
    };
  });
}

/**
 * Get database statistics
 */
export async function getDBStats() {
  const db = await getDB();

  const [documentsCount, chunksCount, embeddingsCount, conversationsCount, memoriesCount] =
    await Promise.all([
      db.count('documents'),
      db.count('chunks'),
      db.count('embeddings'),
      db.count('conversations'),
      db.count('memories')
    ]);

  return {
    documents: documentsCount,
    chunks: chunksCount,
    embeddings: embeddingsCount,
    conversations: conversationsCount,
    memories: memoriesCount
  };
}

/**
 * Export all data from the database
 */
export async function exportDatabase() {
  const db = await getDB();

  const [documents, chunks, embeddings, conversations, memories, settings, mcp_servers, custom_apps, chunk_relevance] =
    await Promise.all([
      db.getAll('documents'),
      db.getAll('chunks'),
      db.getAll('embeddings'),
      db.getAll('conversations'),
      db.getAll('memories'),
      getAllSettings(),
      db.getAll('mcp_servers'),
      db.getAll('custom_apps'),
      db.getAll('chunk_relevance').catch(() => [])
    ]);

  return {
    version: '1.1',
    exportedAt: Date.now(),
    documents,
    chunks,
    embeddings,
    conversations,
    memories,
    settings,
    mcp_servers,
    custom_apps,
    chunk_relevance
  };
}

/**
 * Import data into the database
 */
export async function importDatabase(data: any): Promise<void> {
  const db = await getDB();
  
  // Dynamic list of stores based on what exists in the DB
  const availableStores = Array.from(db.objectStoreNames);
  const tx = db.transaction(availableStores, 'readwrite');

  try {
    // Import documents
    for (const doc of data.documents || []) {
      await tx.objectStore('documents' as any).put(doc);
    }

    // Import chunks
    for (const chunk of data.chunks || []) {
      await tx.objectStore('chunks' as any).put(chunk);
    }

    // Import embeddings
    for (const embedding of data.embeddings || []) {
      await tx.objectStore('embeddings' as any).put(embedding);
    }

    // Import conversations
    for (const conv of data.conversations || []) {
      await tx.objectStore('conversations' as any).put(conv);
    }
    
    // Import memories
    if (availableStores.includes('memories')) {
      for (const memory of data.memories || []) {
        await tx.objectStore('memories' as any).put(memory);
      }
    }

    // Import MCP servers
    if (availableStores.includes('mcp_servers')) {
      for (const server of data.mcp_servers || []) {
        await tx.objectStore('mcp_servers' as any).put(server);
      }
    }

    // Import custom apps
    if (availableStores.includes('custom_apps')) {
      for (const app of data.custom_apps || []) {
        await tx.objectStore('custom_apps' as any).put(app);
      }
    }

    // Import chunk relevance
    if (availableStores.includes('chunk_relevance')) {
      for (const entry of data.chunk_relevance || []) {
        await tx.objectStore('chunk_relevance' as any).put(entry);
      }
    }

    // Import settings
    if (data.settings && availableStores.includes('settings')) {
      for (const [key, value] of Object.entries(data.settings)) {
        await tx.objectStore('settings' as any).put(value, key);
      }
    }

    await tx.done;
  } catch (error) {
    console.error('Import failed:', error);
    throw error;
  }
}

/**
 * Get all settings as an object
 */
async function getAllSettings(): Promise<Record<string, any>> {
  const db = await getDB();
  const keys = await db.getAllKeys('settings');
  const values = await db.getAll('settings');

  return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
}
