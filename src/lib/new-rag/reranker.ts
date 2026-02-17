import { RAGModelLoader } from './model-loader';
import type { SearchResult } from './types';

export class Reranker {
  /**
   * monoT5 Reranking Logic
   * Uses a Seq2Seq model to estimate relevance by calculating the probability 
   * of the token 'true' being generated for the pair (Query, Document).
   */
  static async rerank(query: string, documents: SearchResult[], topK: number = 10): Promise<SearchResult[]> {
    const loader = RAGModelLoader.getInstance();
    const generator = await loader.getReranker(); // Use dedicated reranker instance
    
    const docsToRerank = documents.slice(0, topK);
    const scoredDocs: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const doc of docsToRerank) {
      try {
        // --- DETERMINISTIC SCORING (From Legacy) ---
        let baseScore = doc.score;
        const contentLower = doc.content.toLowerCase();
        
        // Bonus 1: Exact Phrase Match (Critical for Brands)
        if (contentLower.includes(queryLower)) {
          baseScore *= 2.0; 
        } else {
          // Bonus 2: Individual Word Match
          const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);
          let matches = 0;
          for (const word of queryWords) {
            if (contentLower.includes(word)) matches++;
          }
          if (matches > 0) baseScore *= (1 + (matches / queryWords.length) * 0.5);
        }

        // --- MODEL-BASED SCORING (monoT5) ---
        const prompt = `Query: ${query} Document: ${doc.content} Relevant:`;
        const result = await generator(prompt, {
          max_new_tokens: 2, // Allow for small variations
          num_beams: 1,
          do_sample: false
        });

        const generatedText = result[0].generated_text.trim().toLowerCase();
        const modelScore = generatedText.includes('true') || generatedText.includes('yes') ? 1.0 : 0.05;

        // Final Fusion: Combined deterministic + model
        scoredDocs.push({ ...doc, rerankScore: baseScore * modelScore });
      } catch (e) {
        console.error("monoT5 Reranking failed for doc", doc.id, e);
        scoredDocs.push({ ...doc, rerankScore: 0 });
      }
      
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Sort descending by rerankScore
    return scoredDocs.sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));
  }

  /**
   * Reverse Re-packaging
   * Organizes final documents in reverse order of relevance (best last)
   */
  static reverseRepack(documents: SearchResult[]) {
    return [...documents].reverse();
  }
}
