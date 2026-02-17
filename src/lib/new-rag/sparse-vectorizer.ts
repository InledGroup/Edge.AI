import natural from 'natural';

export class SparseVectorizer {
  private static tokenizer = new natural.WordTokenizer();
  // Multilingual stopwords (English + Spanish commonly used)
  private static stopWords = new Set([
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with', 'as', 'by', 'it', 'that', 'this',
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'de', 'a', 'en', 'para', 'con', 'por', 'como', 'que', 'es', 'su'
  ]);

  /**
   * Generates a Sparse Vector compatible with the local vector store.
   * Uses simple Term Frequency (TF) with Hashing Trick to map tokens to a fixed vector space.
   * This simulates SPLADE-like behavior by emphasizing rare terms (implicitly, by TF) 
   * but lacks the learned weights of SPLADE. It serves as a robust BM25-proxy for 100% local search.
   */
  static encode(text: string): Record<number, number> {
    const tokens = this.tokenizer.tokenize(text.toLowerCase());
    const vector: Record<number, number> = {};

    if (!tokens) return vector;

    // 1. Calculate Term Frequency
    const tf: Record<string, number> = {};
    tokens.forEach(token => {
      // Filter short tokens and stop words
      if (token.length < 3 || this.stopWords.has(token)) return;
      tf[token] = (tf[token] || 0) + 1;
    });

    // 2. Hashing and Weighting
    // We map to a 32,000 dimension space (approx BERT vocab size) to avoid massive collisions
    const DIMENSION = 32000;

    Object.entries(tf).forEach(([token, count]) => {
      const hash = this.fnv1aHash(token);
      const index = Math.abs(hash % DIMENSION);
      
      // Log-saturation for weight: log(1 + TF)
      // This prevents high-frequency words from dominating too much
      const weight = Math.log(1 + count);
      
      // Accumulate if collision occurs
      vector[index] = (vector[index] || 0) + weight;
    });

    return vector;
  }

  // FNV-1a Hash Algorithm
  private static fnv1aHash(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }
}
