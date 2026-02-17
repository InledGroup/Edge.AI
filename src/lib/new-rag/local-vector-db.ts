import { openDB, type IDBPDatabase } from 'idb';
import type { SearchResult, Chunk } from './types';
import { SparseVectorizer } from './sparse-vectorizer';
import { DEFAULT_CONFIG } from './config';

/**
 * LocalVectorDB
 * 100% Local Vector & Lexical Store (Edge-Only).
 * Replaces Milvus with IndexedDB and optimized in-browser vector operations.
 */
export class LocalVectorDB {
  private dbName = 'edge_ai_vector_store_v1';
  private storeName = DEFAULT_CONFIG.localStore.collectionName;
  private db: IDBPDatabase | null = null;

  async connect() {
    if (this.db) return;
    const storeName = this.storeName;
    this.db = await openDB(this.dbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'id' });
          store.createIndex('documentId', 'metadata.documentId');
        }
      },
    });
  }

  async insert(data: any[]) {
    await this.connect();
    const tx = this.db!.transaction(this.storeName, 'readwrite');
    for (const item of data) {
      await tx.store.put(item);
    }
    await tx.done;
  }

  async searchHybrid(queryDense: number[], querySparse: Record<number, number>, limit: number = 50): Promise<SearchResult[]> {
    await this.connect();
    const allEntities = await this.db!.getAll(this.storeName);
    console.log(`[LocalVectorDB] Searching across ${allEntities.length} indexed chunks`);
    
    if (allEntities.length === 0) return [];

    const alpha = DEFAULT_CONFIG.search.alpha;

    // 1. Hybrid Search Logic
    const scored = allEntities.map(entity => {
      const denseScore = this.cosineSimilarity(queryDense, entity.dense_vector);
      const sparseScore = this.sparseDotProduct(querySparse, entity.sparse_vector);
      
      // Combinación Híbrida: Si no hay coincidencia léxica, penalizamos fuertemente para evitar alucinaciones
      const lexicalBonus = sparseScore > 0 ? 1.2 : 0.8;
      const hybridScore = ((denseScore * (1 - alpha)) + (sparseScore * alpha)) * lexicalBonus;
      
      return {
        id: entity.id,
        score: hybridScore,
        content: entity.content,
        small_content: entity.small_content,
        metadata: entity.metadata
      };
    });

    const results = scored
      .filter(s => s.score > 0.1) // Umbral de seguridad
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
      
    console.log(`[LocalVectorDB] Found ${results.length} matches. Top score: ${results[0]?.score.toFixed(4)}`);
    return results;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    return magnitude === 0 ? 0 : Math.max(0, dot / magnitude);
  }

  private sparseDotProduct(query: Record<number, number>, doc: Record<number, number>): number {
    let score = 0;
    let matches = 0;
    for (const [index, weight] of Object.entries(query)) {
      if (doc[index as any]) {
        score += weight * doc[index as any];
        matches++;
      }
    }
    // Si no hay coincidencias de palabras clave, el score es 0 absoluto
    if (matches === 0) return 0;
    
    // Normalización Logarítmica para escala 0-1
    return Math.min(1, Math.log1p(score) / 5);
  }
}
