// Vector Search - Local similarity search using cosine similarity
// 100% in-browser, no server calls

import { getAllEmbeddings } from '@/lib/db/embeddings';
import { getChunk, getSurroundingChunks } from '@/lib/db/chunks';
import { getDocument } from '@/lib/db/documents';
import { getChunkBoosts } from '@/lib/db/relevance';
import type { RetrievedChunk, Embedding } from '@/types';
import { formatChunkWithContext } from './semantic-chunking';
import { BM25 } from './bm25';

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
 * Search filters for advanced querying
 */
export interface SearchFilters {
  documentIds?: string[];
  dateRange?: [Date, Date];
  documentType?: string[];
  minRelevance?: number;
}

/**
 * Hybrid search configuration
 */
export interface HybridSearchConfig {
  semanticWeight?: number; // 0-1, default 0.7
  lexicalWeight?: number;  // 0-1, default 0.3
  useReranking?: boolean;  // default true
  minRelevance?: number;   // Minimum relevance score (0-1)
  chunkWindowSize?: number;
}

/**
 * Search for similar chunks using HYBRID search (BM25 + Semantic)
 * Returns top-K most similar chunks with improved accuracy
 */
export async function searchSimilarChunks(
  queryEmbedding: Float32Array,
  topK: number = 5,
  documentIds?: string[],
  query?: string,
  config?: HybridSearchConfig
): Promise<RetrievedChunk[]> {
  const startTime = Date.now();

  console.log(`🔍 [Hybrid Search] Searching for top ${topK} chunks...`);

  // Get all embeddings from IndexedDB
  let embeddings = await getAllEmbeddings();

  // Filter by document IDs if provided
  if (documentIds && documentIds.length > 0) {
    embeddings = embeddings.filter(emb => documentIds.includes(emb.documentId));
  }

  console.log(`📊 Searching across ${embeddings.length} embeddings`);

  // Fetch chunks for BM25 and metadata
  const chunksMap = new Map<string, RetrievedChunk>();

  for (const embedding of embeddings) {
    const chunk = await getChunk(embedding.chunkId);
    const document = chunk ? await getDocument(chunk.documentId) : null;

    if (chunk && document) {
      chunksMap.set(embedding.chunkId, {
        chunk,
        document,
        score: 0, // Will be calculated
        embedding
      });
    }
  }

  const retrievedChunks = Array.from(chunksMap.values());

  // === SEMANTIC SEARCH ===
  const semanticScores = new Map<string, number>();
  embeddings.forEach(embedding => {
    const score = cosineSimilarity(queryEmbedding, embedding.vector);
    semanticScores.set(embedding.chunkId, score);
  });

  // Normalize semantic scores to 0-1
  const maxSemanticScore = Math.max(...Array.from(semanticScores.values()));
  semanticScores.forEach((score, id) => {
    semanticScores.set(id, maxSemanticScore > 0 ? score / maxSemanticScore : 0);
  });

  // === LEXICAL SEARCH (BM25) ===
  let lexicalScores = new Map<string, number>();

  if (query && query.trim().length > 0) {
    const bm25 = new BM25();
    const bm25Docs = retrievedChunks.map(rc => ({
      id: rc.chunk.id,
      content: rc.chunk.content
    }));

    bm25.addDocuments(bm25Docs);
    const bm25Results = bm25.search(query, embeddings.length);

    bm25Results.forEach(result => {
      lexicalScores.set(result.documentId, result.score);
    });

    // Normalize BM25 scores to 0-1
    const maxBM25Score = Math.max(...Array.from(lexicalScores.values()), 0.0001);
    lexicalScores.forEach((score, id) => {
      lexicalScores.set(id, score / maxBM25Score);
    });

    console.log(`✅ [BM25] Indexed ${bm25Docs.length} documents`);
  }

  // === HYBRID SCORING ===
  let semanticWeight = config?.semanticWeight ?? 0.7;
  let lexicalWeight = config?.lexicalWeight ?? 0.3;
  let minRelevance = config?.minRelevance;

  retrievedChunks.forEach(rc => {
    const semanticScore = semanticScores.get(rc.chunk.id) || 0;
    const lexicalScore = lexicalScores.get(rc.chunk.id) || 0;
    rc.score = (semanticWeight * semanticScore) + (lexicalWeight * lexicalScore);
  });

  // Sort and take top candidates for expensive operations
  retrievedChunks.sort((a, b) => b.score - a.score);
  
  // Take more candidates initially to allow for reranking
  let topCandidates = retrievedChunks.slice(0, Math.max(topK * 3, 15));

  // === SMALL-TO-BIG: Fetch surrounding context ONLY for top candidates ===
  const windowSize = config?.chunkWindowSize ?? 1;
  console.log(`🪟 [Hybrid Search] Expanding context for ${topCandidates.length} candidates (Window: +${windowSize})`);
  
  for (const rc of topCandidates) {
    try {
      const surrounding = await getSurroundingChunks(rc.chunk.documentId, rc.chunk.index, windowSize);
      const expandedContent = surrounding.map(c => c.content).join('\n\n');
      rc.chunk.metadata = {
        ...rc.chunk.metadata,
        expandedContext: expandedContent
      };
    } catch (err) {
      console.warn(`⚠️ Failed to fetch context for chunk ${rc.chunk.id}`);
    }
  }

  // === LEARNING: Apply user feedback boosts ===
  const boosts = await getChunkBoosts(topCandidates.map(rc => rc.chunk.id));
  topCandidates.forEach(rc => {
    const boost = boosts.get(rc.chunk.id) || 1.0;
    rc.score *= boost;
  });
  
  // Re-sort after boosts
  if (boosts.size > 0) {
    topCandidates.sort((a, b) => b.score - a.score);
  }

  // === RERANKING ===
  let rerankedResults = topCandidates;
  if (config?.useReranking !== false && query) {
    rerankedResults = rerankResults(topCandidates, query);
  }

  // Filter by minimum relevance
  if (minRelevance) {
    rerankedResults = rerankedResults.filter(r => r.score >= minRelevance);
  }

  // Final top K
  const finalResults = rerankedResults.slice(0, topK);

  const searchTime = Date.now() - startTime;
  console.log(`✅ [Hybrid Search] Found ${finalResults.length} chunks in ${searchTime}ms`);

  return finalResults;
}

/**
 * Reciprocal Rank Fusion (RRF)
 * Combines multiple result lists into a single ranked list.
 */
export function reciprocalRankFusion(
  resultLists: RetrievedChunk[][],
  k: number = 60
): RetrievedChunk[] {
  const scores = new Map<string, { chunk: RetrievedChunk; rrfScore: number }>();

  resultLists.forEach((list) => {
    list.forEach((chunk, rank) => {
      const id = chunk.chunk.id;
      const current = scores.get(id) || { chunk, rrfScore: 0 };
      // RRF formula: 1 / (k + rank)
      current.rrfScore += 1 / (k + rank + 1);
      scores.set(id, current);
    });
  });

  return Array.from(scores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map((s) => ({
      ...s.chunk,
      score: s.rrfScore // Map RRF score back
    }));
}

/**
 * Reorder chunks to solve 'Lost in the Middle' problem
 * Places most relevant chunks at the beginning and end of the prompt
 * Resulting order: [1, 3, 5, ..., 6, 4, 2]
 */
export function reorderForLostInTheMiddle(chunks: RetrievedChunk[]): RetrievedChunk[] {
  if (chunks.length <= 2) return chunks;

  const evens = chunks.filter((_, i) => i % 2 === 0);
  const odds = chunks.filter((_, i) => i % 2 !== 0);
  
  // Place even-indexed chunks at the start and reversed odd-indexed chunks at the end
  return [...evens, ...odds.reverse()];
}

/**
 * Create context from retrieved chunks for RAG
 * Now includes expanded context and 'Lost in the Middle' reordering
 */
export function createRAGContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return '';
  }

  // Apply Lost in the Middle reordering
  const reorderedChunks = reorderForLostInTheMiddle(chunks);

  const contextParts = reorderedChunks.map((rc, index) => {
    const docName = rc.document.name;
    const score = (rc.score * 100).toFixed(1);

    // Prefer expanded context if available, otherwise fallback to standard content
    let chunkContent = rc.chunk.metadata?.expandedContext || rc.chunk.content;

    // If no expanded context but we have simple prev/next contexts, use them
    if (!rc.chunk.metadata?.expandedContext) {
      if (rc.chunk.metadata?.prevContext) {
        chunkContent = `[Contexto anterior]: ${rc.chunk.metadata.prevContext}\n\n${chunkContent}`;
      }
      if (rc.chunk.metadata?.nextContext) {
        chunkContent = `${chunkContent}\n\n[Continúa]: ${rc.chunk.metadata.nextContext}`;
      }
    }

    return `[Documento ${index + 1}: ${docName} (Relevancia: ${score}%)]\n${chunkContent}`;
  });

  const context = contextParts.join('\n\n---\n\n');
  console.log(`📚 [RAG] Created context with ${chunks.length} chunks, total length: ${context.length} chars (Reordered for Attention)`);

  return context;
}

/**
 * Advanced reranking using multiple signals:
 * - Diversity (avoid too many chunks from same document)
 * - Position in document (earlier chunks often more important)
 * - Document recency
 * - Query-chunk overlap
 * - Proximity match (keywords appearing close together)
 */
export function rerankResults(
  chunks: RetrievedChunk[],
  query: string
): RetrievedChunk[] {
  console.log(`🔄 [Reranking] Processing ${chunks.length} chunks...`);

  // Track document distribution
  const docCounts = new Map<string, number>();
  
  // Extract significant terms (longer than 2 chars)
  const queryTerms = query.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
    
  const queryTokens = new Set(queryTerms);

  // Calculate reranking scores
  const reranked = chunks.map((chunk, index) => {
    let rerankScore = chunk.score; // Start with hybrid score

    // === DIVERSITY PENALTY ===
    // Penalize if we already have many chunks from this document
    const docId = chunk.document.id;
    const currentDocCount = docCounts.get(docId) || 0;
    docCounts.set(docId, currentDocCount + 1);

    if (currentDocCount > 0) {
      // Each additional chunk from same doc gets penalized
      const diversityPenalty = 0.95 ** currentDocCount;
      rerankScore *= diversityPenalty;
    }

    // === POSITION BONUS ===
    // Earlier chunks in document often contain key info
    if (chunk.chunk.index !== undefined) {
      const maxIndex = chunk.chunk.metadata?.totalChunks || 10;
      const positionScore = 1 - (chunk.chunk.index / maxIndex) * 0.2; // Up to 20% bonus
      rerankScore *= positionScore;
    }

    // === RECENCY BONUS ===
    // More recent documents might be more relevant
    if (chunk.document.uploadedAt) {
      const daysSinceUpload = (Date.now() - chunk.document.uploadedAt) / (1000 * 60 * 60 * 24);
      if (daysSinceUpload < 7) {
        rerankScore *= 1.1; // 10% bonus for recent uploads
      }
    }

    const chunkContentLower = (chunk.chunk.metadata?.expandedContext || chunk.chunk.content).toLowerCase();

    // === QUERY TOKEN OVERLAP ===
    // Bonus for chunks that contain many query terms
    const chunkTokens = new Set(
      chunkContentLower.split(/\s+/)
    );
    let overlapCount = 0;
    queryTokens.forEach(token => {
      if (chunkTokens.has(token)) overlapCount++;
    });

    if (queryTokens.size > 0) {
      const overlapRatio = overlapCount / queryTokens.size;
      rerankScore *= (1 + overlapRatio * 0.15); // Restored to 15% bonus
    }

    // === EXACT PHRASE MATCH ===
    if (chunkContentLower.includes(query.toLowerCase())) {
        rerankScore *= 1.2; // Reduced to 20% bonus
    } else {
        // === PARTIAL PHRASE / PROXIMITY ===
        for (let i = 0; i < queryTerms.length - 1; i++) {
            const bigram = `${queryTerms[i]} ${queryTerms[i+1]}`;
            if (chunkContentLower.includes(bigram)) {
                rerankScore *= 1.1; // 10% bonus for bigram match
                break;
            }
        }
    }

    // === CHUNK QUALITY ===
    const hasContext = chunk.chunk.metadata?.expandedContext || chunk.chunk.metadata?.prevContext;
    if (hasContext) {
      rerankScore *= 1.05; // Restored to 5% bonus
    }

    return {
      ...chunk,
      score: rerankScore,
      originalScore: chunk.score
    };
  });

  // Sort by reranked score
  reranked.sort((a, b) => b.score - a.score);

  console.log(`✅ [Reranking] Complete. Score changes:`);
  reranked.slice(0, 3).forEach((chunk, i) => {
    const rawChange = ((chunk.score / (chunk.originalScore || chunk.score) - 1) * 100);
    const changeStr = rawChange.toFixed(1);
    console.log(`  ${i + 1}. ${chunk.document.name.substring(0, 30)} (${rawChange > 0 ? '+' : ''}${changeStr}%)`);
  });

  return reranked;
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
