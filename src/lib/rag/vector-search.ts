// Vector Search - Local similarity search using cosine similarity
// 100% in-browser, no server calls

import { getAllEmbeddings } from '@/lib/db/embeddings';
import { getChunk } from '@/lib/db/chunks';
import { getDocument } from '@/lib/db/documents';
import type { RetrievedChunk, Embedding } from '@/types';

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Search for similar chunks using vector similarity
 * Returns top-K most similar chunks
 */
export async function searchSimilarChunks(
  queryEmbedding: Float32Array,
  topK: number = 5,
  documentIds?: string[]
): Promise<RetrievedChunk[]> {
  const startTime = Date.now();

  console.log(`🔍 Searching for top ${topK} similar chunks...`);

  // Get all embeddings from IndexedDB
  let embeddings = await getAllEmbeddings();

  // Filter by document IDs if provided
  if (documentIds && documentIds.length > 0) {
    embeddings = embeddings.filter(emb => documentIds.includes(emb.documentId));
  }

  console.log(`📊 Searching across ${embeddings.length} embeddings`);

  // Calculate similarities
  const similarities = embeddings.map(embedding => ({
    embedding,
    score: cosineSimilarity(queryEmbedding, embedding.vector)
  }));

  // Sort by score (descending) and take top K
  similarities.sort((a, b) => b.score - a.score);
  const topResults = similarities.slice(0, topK);

  // Fetch chunks and documents
  const retrievedChunks: RetrievedChunk[] = [];

  for (const result of topResults) {
    const chunk = await getChunk(result.embedding.chunkId);
    const document = chunk ? await getDocument(chunk.documentId) : null;

    if (chunk && document) {
      retrievedChunks.push({
        chunk,
        document,
        score: result.score,
        embedding: result.embedding
      });
    }
  }

  const searchTime = Date.now() - startTime;
  console.log(`✅ Found ${retrievedChunks.length} chunks in ${searchTime}ms`);

  return retrievedChunks;
}

/**
 * Create context from retrieved chunks for RAG
 */
export function createRAGContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return '';
  }

  const contextParts = chunks.map((rc, index) => {
    const docName = rc.document.name;
    const score = (rc.score * 100).toFixed(1);

    return `[Documento ${index + 1}: ${docName} (${score}% relevancia)]\n${rc.chunk.content}`;
  });

  return contextParts.join('\n\n---\n\n');
}

/**
 * Rerank results using additional criteria
 * (Future enhancement: could add BM25, recency, etc.)
 */
export function rerankResults(
  chunks: RetrievedChunk[],
  query: string
): RetrievedChunk[] {
  // For now, just return as-is
  // Future: implement hybrid search with BM25 + semantic
  return chunks;
}

/**
 * Get statistics about the vector database
 */
export async function getVectorDBStats() {
  const embeddings = await getAllEmbeddings();

  const byDocument = embeddings.reduce((acc, emb) => {
    acc[emb.documentId] = (acc[emb.documentId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byModel = embeddings.reduce((acc, emb) => {
    acc[emb.model] = (acc[emb.model] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalEmbeddings: embeddings.length,
    byDocument,
    byModel,
    dimensions: embeddings[0]?.vector.length || 0
  };
}
