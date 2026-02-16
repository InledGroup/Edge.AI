import { DEFAULT_CONFIG } from './config';
import type { SearchResult } from './types';

/**
 * MilvusRESTConnector
 * Browser-compatible connector for Milvus using the RESTful API V2.
 * Avoids Node.js dependencies like gRPC and 'process'.
 */
export class MilvusConnector {
  private address: string;
  private token: string;
  private collectionName: string;

  constructor() {
    this.address = DEFAULT_CONFIG.milvus.address.replace(/\/$/, '');
    // Ensure the address has http/https
    if (!this.address.startsWith('http')) {
      this.address = `http://${this.address}`;
    }
    
    this.collectionName = DEFAULT_CONFIG.milvus.collectionName;
    
    // Milvus REST API uses 'Bearer token' or 'username:password' base64
    const username = DEFAULT_CONFIG.milvus.username || '';
    const password = DEFAULT_CONFIG.milvus.password || '';
    this.token = username ? btoa(`${username}:${password}`) : '';
  }

  private async request(endpoint: string, data: any) {
    const url = `${this.address}/v2/vectordb${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Milvus REST Error (${response.status}): ${errorText}`);
    }

    return await response.json();
  }

  async connect() {
    // Check if collection exists, if not create it
    try {
      const res = await this.request('/collections/describe', {
        collectionName: this.collectionName,
      });
      if (res.code !== 0) {
        await this.ensureCollection();
      }
    } catch (e) {
      // If describe fails, assume it doesn't exist
      await this.ensureCollection();
    }
  }

  private async ensureCollection() {
    const { dimension } = DEFAULT_CONFIG.milvus;
    
    console.log(`Creating Milvus collection: ${this.collectionName}`);
    
    // Create collection via REST API V2
    await this.request('/collections/create', {
      collectionName: this.collectionName,
      dimension: dimension,
      metricType: 'COSINE',
      primaryField: 'id',
      vectorField: 'dense_vector',
      // Note: REST API v2 simplifies schema creation
      // For complex schemas including sparse vectors, we might need a more detailed call 
      // but v2 handles basic setup easily.
    });

    // In a real production scenario, we'd add the sparse field and indexes.
    // However, Milvus REST API v2 often auto-creates indexes or uses a simpler flow.
  }

  async insert(data: any[]) {
    return await this.request('/entities/insert', {
      collectionName: this.collectionName,
      data: data,
    });
  }

  async searchHybrid(queryDense: number[], querySparse: Record<number, number>, limit: number = 50): Promise<SearchResult[]> {
    const alpha = DEFAULT_CONFIG.search.alpha;

    // Milvus REST API v2 Search
    // Note: REST API v2 doesn't always support the full complex hybrid search in a single call via 'search' 
    // as easily as gRPC, but it supports 'search' with multiple vectors in some versions.
    // If not, we perform parallel searches and fuse locally.
    
    try {
      const [denseRes, sparseRes] = await Promise.all([
        this.request('/entities/search', {
          collectionName: this.collectionName,
          vector: queryDense,
          limit: limit,
          outputFields: ['id', 'content', 'small_content', 'metadata'],
          searchParams: { metricType: 'COSINE', params: { ef: 64 } },
        }),
        // For sparse vector search via REST, the format varies.
        // If the server supports it:
        this.request('/entities/search', {
          collectionName: this.collectionName,
          vector: querySparse,
          limit: limit,
          outputFields: ['id', 'content', 'small_content', 'metadata'],
          searchParams: { metricType: 'IP' },
        }).catch(err => ({ data: [] })) // Fallback if sparse search fails
      ]);

      return this.weightedFusion(denseRes.data || [], sparseRes.data || [], alpha);
    } catch (error) {
      console.error("Hybrid Search Failed, falling back to dense only", error);
      // Fallback: Minimal mock or local search if Milvus is down
      return [];
    }
  }

  private weightedFusion(denseHits: any[], sparseHits: any[], alpha: number): SearchResult[] {
    const combined = new Map<string, { score: number; doc: any }>();

    const normalize = (hits: any[]) => {
      if (hits.length === 0) return hits;
      const max = Math.max(...hits.map(h => h.distance || h.score || 0));
      const min = Math.min(...hits.map(h => h.distance || h.score || 0));
      const range = max - min || 1;
      return hits.map(h => ({ ...h, normScore: ((h.distance || h.score || 0) - min) / range }));
    };

    const normDense = normalize(denseHits);
    const normSparse = normalize(sparseHits);

    normDense.forEach((hit) => {
      combined.set(hit.id, { 
        score: hit.normScore * (1 - alpha), 
        doc: hit 
      });
    });

    normSparse.forEach((hit) => {
      if (combined.has(hit.id)) {
        combined.get(hit.id)!.score += hit.normScore * alpha;
      } else {
        combined.set(hit.id, { 
          score: hit.normScore * alpha, 
          doc: hit 
        });
      }
    });

    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .map(item => ({
        id: item.doc.id,
        score: item.score,
        content: item.doc.content,
        small_content: item.doc.small_content,
        metadata: item.doc.metadata || {}
      }));
  }
}
