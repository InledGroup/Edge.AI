import { RAGModelLoader } from './model-loader';
import type { SearchResult } from './types';

export class Reranker {
  /**
   * monoT5 Reranking Logic
   * Uses a sequence-to-sequence model to estimate the relevance of a document to a query.
   * Input format: "Query: {q} Document: {d} Relevant:"
   * Target: "true" or "false"
   */
  static async rerank(query: string, documents: SearchResult[], topK: number = 50): Promise<SearchResult[]> {
    const loader = RAGModelLoader.getInstance();
    const model = await loader.getReranker();
    
    // Rerank top K documents
    const docsToRerank = documents.slice(0, topK);

    // We process sequentially or in small batches to manage memory
    // (transformers.js runs in single thread usually, but async helps UI non-blocking)
    const scoredDocs = await Promise.all(docsToRerank.map(async (doc) => {
      const input = `Query: ${query} Document: ${doc.content} Relevant:`;
      
      try {
        const result = await model(input, {
          max_new_tokens: 2, // We need enough to get "true" or "false"
          temperature: 0.1, // Deterministic
        });

        // Heuristic Scoring based on generated text
        // Ideally we want the log-probability of the token "true"
        // But since we are using generation pipeline:
        const text = result[0].generated_text.toLowerCase().trim();
        let score = 0;

        if (text.startsWith('true') || text.includes('true')) {
          score = 1.0; 
        } else if (text.startsWith('false') || text.includes('false')) {
          score = 0.0;
        } else {
          score = 0.1; // Uncertain
        }

        // Refinement: If score is tied (all 1.0), use original score as tiebreaker
        // We add original score * 0.01 to differentiate
        const finalScore = score + (doc.score * 0.001);

        return { ...doc, rerankScore: finalScore };
      } catch (e) {
        console.error("Reranking failed for doc", doc.id, e);
        return { ...doc, rerankScore: 0 };
      }
    }));

    // Sort descending by rerankScore (Best match first)
    return scoredDocs.sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));
  }

  /**
   * Reverse Re-packaging
   * Organizes final documents in reverse order of relevance.
   * The list comes in [Best, ..., Worst].
   * We want [Worst, ..., Best] so the Best is at the end (Recency Bias optimization).
   */
  static reverseRepack(documents: SearchResult[]) {
    return [...documents].reverse();
  }
}
