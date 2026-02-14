// Chunking Module - Adapted for IndexedDB local storage
// Converts semantic chunks to DB-ready format

import { semanticChunkText, type SemanticChunk } from './semantic-chunking';
import { createChunksBatch } from '@/lib/db/chunks';
import type { Chunk } from '@/types';

/**
 * Process document text into chunks and store in IndexedDB
 * Returns array of created chunks
 */
export async function chunkAndStoreDocument(
  documentId: string,
  text: string,
  chunkSize: number = 800,
  overlap: number = 50
): Promise<Chunk[]> {
  console.log(`📄 Chunking document ${documentId}...`);
  console.log(`📏 Document length: ${text.length} characters`);
  console.log(`🎯 Target chunk size: ${chunkSize} characters`);

  // Use semantic chunking
  const semanticChunks = semanticChunkText(text, chunkSize);

  console.log(`✂️ Created ${semanticChunks.length} semantic chunks`);

  // Log chunk statistics
  const chunkSizes = semanticChunks.map(c => c.content.length);
  const avgSize = chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length;
  const minSize = Math.min(...chunkSizes);
  const maxSize = Math.max(...chunkSizes);
  console.log(`📊 Chunk stats: avg=${Math.round(avgSize)}, min=${minSize}, max=${maxSize} chars`);

  // Log context availability
  const chunksWithPrevContext = semanticChunks.filter(c => c.metadata.prevContext).length;
  const chunksWithNextContext = semanticChunks.filter(c => c.metadata.nextContext).length;
  console.log(`🔗 Context: ${chunksWithPrevContext} have prev, ${chunksWithNextContext} have next`);

  // Convert to DB format
  const dbChunks = semanticChunks.map((sc, index) => ({
    documentId,
    content: sc.content,
    index,
    tokens: estimateTokens(sc.content),
    metadata: {
      startChar: sc.metadata.startChar,
      endChar: sc.metadata.endChar,
      type: sc.metadata.type,
      prevContext: sc.metadata.prevContext,
      nextContext: sc.metadata.nextContext
    }
  }));

  // Store in IndexedDB
  const storedChunks = await createChunksBatch(dbChunks);

  console.log(`✅ Stored ${storedChunks.length} chunks in IndexedDB`);

  return storedChunks;
}

/**
 * Estimate token count (rough approximation)
 * ~1 token per 4 characters in English
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get chunk text with context for embedding
 * MEJORADO: Mejor integración de contexto
 */
export function getChunkTextForEmbedding(chunk: Chunk): string {
  let text = chunk.content;

  // Add context with special markers for better embedding
  if (chunk.metadata.prevContext) {
    text = `[Previous context: ${chunk.metadata.prevContext}] ${text}`;
  }

  if (chunk.metadata.nextContext) {
    text = `${text} [Next context: ${chunk.metadata.nextContext}]`;
  }

  return text;
}

/**
 * Get weighted embedding text (for future multi-vector approach)
 * Returns main chunk + separate context strings
 */
export function getWeightedEmbeddingTexts(chunk: Chunk): {
  mainText: string;
  prevContext?: string;
  nextContext?: string;
} {
  return {
    mainText: chunk.content,
    prevContext: chunk.metadata.prevContext,
    nextContext: chunk.metadata.nextContext
  };
}

