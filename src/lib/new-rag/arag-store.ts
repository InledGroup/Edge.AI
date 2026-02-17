import { openDB, type IDBPDatabase } from 'idb';
import { DEFAULT_CONFIG } from './config';

export interface ARAGChunk {
  id: string;
  documentId: string;
  content: string;
  metadata: any;
}

export interface ARAGSentence {
  id: string;
  chunkId: string;
  content: string;
  embedding: number[];
}

export class ARAGStore {
  private dbName = 'edge_ai_arag_v1';
  private db: IDBPDatabase | null = null;

  async connect() {
    if (this.db) return;
    this.db = await openDB(this.dbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('chunks')) {
          db.createObjectStore('chunks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sentences')) {
          const store = db.createObjectStore('sentences', { keyPath: 'id' });
          store.createIndex('by-chunk', 'chunkId');
        }
      },
    });
  }

  async saveHierarchy(chunks: ARAGChunk[], sentences: ARAGSentence[]) {
    await this.connect();
    const tx = this.db!.transaction(['chunks', 'sentences'], 'readwrite');
    
    for (const chunk of chunks) {
      await tx.objectStore('chunks').put(chunk);
    }
    
    for (const sentence of sentences) {
      await tx.objectStore('sentences').put(sentence);
    }
    
    await tx.done;
  }

  async getChunk(id: string): Promise<ARAGChunk | undefined> {
    await this.connect();
    return this.db!.get('chunks', id);
  }

  async getAllChunks(): Promise<ARAGChunk[]> {
    await this.connect();
    return this.db!.getAll('chunks');
  }

  async getAllSentences(): Promise<ARAGSentence[]> {
    await this.connect();
    return this.db!.getAll('sentences');
  }
}
