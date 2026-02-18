/**
 * RAG Quality Metrics
 *
 * Provides metrics to evaluate RAG system quality:
 * - Relevance scores
 * - Coverage analysis
 * - Diversity metrics
 * - Answer faithfulness
 */

import type { RetrievedChunk } from '@/types';
import { extractKeyTerms } from './query-expansion';

/**
 * RAG quality metrics
 */
export interface RAGMetrics {
  avgRelevanceScore: number;      // Average similarity score (0-1)
  minRelevanceScore: number;       // Lowest score in results
  maxRelevanceScore: number;       // Highest score in results
  coverageScore: number;           // % of query terms covered by context (0-1)
  diversityScore: number;          // Source diversity (0-1)
  contextLength: number;           // Total characters in context
  chunkCount: number;              // Number of chunks retrieved
  uniqueDocuments: number;         // Number of unique source documents
  queryTerms: number;              // Number of key terms in query
  coveredTerms: number;            // Number of terms found in context
}

/**
 * Calculate comprehensive RAG quality metrics
 */
export function calculateRAGMetrics(
  query: string,
  chunks: RetrievedChunk[],
  context: string
): RAGMetrics {
  if (chunks.length === 0) {
    return {
      avgRelevanceScore: 0,
      minRelevanceScore: 0,
      maxRelevanceScore: 0,
      coverageScore: 0,
      diversityScore: 0,
      contextLength: 0,
      chunkCount: 0,
      uniqueDocuments: 0,
      queryTerms: 0,
      coveredTerms: 0
    };
  }

  // Relevance scores
  const scores = chunks.map(c => c.score);
  const avgRelevanceScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const minRelevanceScore = Math.min(...scores);
  const maxRelevanceScore = Math.max(...scores);

  // Coverage: check how many query terms appear in context
  const queryTerms = extractKeyTerms(query);
  const contextLower = context.toLowerCase();
  const coveredTerms = queryTerms.filter(term =>
    contextLower.includes(term.toLowerCase())
  ).length;
  const coverageScore = queryTerms.length > 0
    ? coveredTerms / queryTerms.length
    : 0;

  // Diversity: count unique source documents
  const uniqueDocs = new Set(chunks.map(c => c.document.id));
  const uniqueDocuments = uniqueDocs.size;

  // Diversity score: ranges from 0 (all from same doc) to 1 (all different docs)
  const diversityScore = chunks.length > 0
    ? uniqueDocuments / chunks.length
    : 0;

  const metrics: RAGMetrics = {
    avgRelevanceScore,
    minRelevanceScore,
    maxRelevanceScore,
    coverageScore,
    diversityScore,
    contextLength: context.length,
    chunkCount: chunks.length,
    uniqueDocuments,
    queryTerms: queryTerms.length,
    coveredTerms
  };

  console.log('📊 [RAG Metrics] Quality Report:');
  console.log(`  Relevance: avg=${(avgRelevanceScore * 100).toFixed(1)}%, min=${(minRelevanceScore * 100).toFixed(1)}%, max=${(maxRelevanceScore * 100).toFixed(1)}%`);
  console.log(`  Coverage: ${coveredTerms}/${queryTerms.length} terms (${(coverageScore * 100).toFixed(1)}%)`);
  console.log(`  Diversity: ${uniqueDocuments} unique docs from ${chunks.length} chunks (${(diversityScore * 100).toFixed(1)}%)`);
  console.log(`  Context: ${context.length} chars, ${chunks.length} chunks`);

  return metrics;
}

/**
 * Get quality assessment based on metrics
 */
export function assessRAGQuality(metrics: RAGMetrics): {
  overall: 'excellent' | 'good' | 'fair' | 'poor';
  warnings: string[];
  suggestions: string[];
} {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Check relevance
  if (metrics.avgRelevanceScore < 0.5) {
    warnings.push('Baja relevancia promedio de resultados');
    suggestions.push('Considera expandir la consulta o usar términos más específicos');
  }

  if (metrics.minRelevanceScore < 0.3) {
    warnings.push('Algunos chunks tienen muy baja relevancia');
    suggestions.push('Aumenta el threshold de relevancia mínima');
  }

  // Check coverage
  if (metrics.coverageScore < 0.5) {
    warnings.push('Baja cobertura de términos de búsqueda');
    suggestions.push('Los documentos podrían no contener información sobre todos los aspectos de la consulta');
  }

  // Check diversity
  if (metrics.diversityScore < 0.3 && metrics.uniqueDocuments > 1) {
    warnings.push('Baja diversidad de fuentes');
    suggestions.push('Muchos chunks provienen del mismo documento - considera ajustar el reranking');
  }

  // Check context length
  if (metrics.contextLength < 500) {
    warnings.push('Contexto muy corto');
    suggestions.push('Considera aumentar topK o el tamaño de chunks');
  } else if (metrics.contextLength > 8000) {
    warnings.push('Contexto muy largo');
    suggestions.push('Demasiado contexto puede confundir al modelo - considera reducir topK');
  }

  // Overall assessment
  let overall: 'excellent' | 'good' | 'fair' | 'poor';

  const score = (
    metrics.avgRelevanceScore * 0.4 +
    metrics.coverageScore * 0.3 +
    metrics.diversityScore * 0.2 +
    (metrics.contextLength > 1000 && metrics.contextLength < 6000 ? 0.1 : 0)
  );

  if (score >= 0.8) {
    overall = 'excellent';
  } else if (score >= 0.6) {
    overall = 'good';
  } else if (score >= 0.4) {
    overall = 'fair';
  } else {
    overall = 'poor';
  }

  return { overall, warnings, suggestions };
}

/**
 * Calculate answer faithfulness (how well answer is grounded in context)
 * Standard version with strict term matching and configurable threshold
 */
export function calculateFaithfulness(
  answer: string,
  context: string,
  threshold: number = 0.45
): number {
  const cleanContext = context.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const answerSentences = answer.split(/[.!?\n]+/).filter(s => s.trim().length > 15);

  if (answerSentences.length === 0) return 1.0;

  const stopWords = new Set([
    'esta', 'este', 'estos', 'estas', 'esto', 'que', 'para', 'con', 'por', 'como', 'muy', 'más', 'menos', 
    'todo', 'toda', 'todos', 'todas', 'un', 'una', 'unos', 'unas', 'el', 'la', 'los', 'las', 'del', 'al',
    'the', 'this', 'that', 'these', 'those', 'with', 'from', 'have', 'been', 'were', 'their', 'what', 
    'when', 'where', 'which', 'and', 'but', 'not', 'for', 'are', 'was', 'has', 'had'
  ]);

  let supportedCount = 0;

  answerSentences.forEach(sentence => {
    const words = sentence.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));

    if (words.length === 0) {
      supportedCount++; 
      return;
    }

    // Strict matching: Count how many key words from answer exist in the context
    let matches = 0;
    for (const word of words) {
      if (cleanContext.includes(word)) matches++;
    }

    const ratio = matches / words.length;

    // If matches exceed the user-defined threshold, the sentence is faithful
    if (ratio >= threshold) {
      supportedCount++;
    }
  });

  const faithfulness = supportedCount / answerSentences.length;
  console.log(`🔍 [Faithfulness] ${supportedCount}/${answerSentences.length} sentences grounded (${(faithfulness * 100).toFixed(1)}%)`);
  
  return faithfulness;
}
