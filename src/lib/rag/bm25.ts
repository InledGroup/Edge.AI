/**
 * BM25 (Best Matching 25) - Lexical search algorithm
 *
 * Complementa la búsqueda semántica con búsqueda por palabras clave exactas.
 * Útil para:
 * - Términos técnicos específicos
 * - Nombres propios
 * - Códigos o identificadores
 * - Búsquedas donde las palabras exactas importan
 */


export interface BM25Document {
  id: string;
  content: string;
  tokens: string[];
}

export interface BM25Score {
  documentId: string;
  score: number;
}

/**
 * Tokeniza texto en palabras - Soporte Unicode completo
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // Mantener letras y números Unicode
    .split(/\s+/)
    .filter(token => token.length > 2); // Filtrar palabras cortas (< 3 chars)
}

/**
 * BM25 Scorer - Implementación de BM25 para búsqueda léxica
 */
export class BM25 {
  private documents: BM25Document[] = [];
  private avgDocLength: number = 0;
  private docFrequency: Map<string, number> = new Map(); // DF(term) = # docs que contienen el término
  private k1: number = 1.5; // Parámetro de saturación de frecuencia de términos
  private b: number = 0.75; // Parámetro de normalización de longitud de documento

  constructor(k1: number = 1.5, b: number = 0.75) {
    this.k1 = k1;
    this.b = b;
  }

  /**
   * Indexa documentos para búsqueda BM25
   */
  addDocuments(documents: Array<{ id: string; content: string }>) {
    console.log(`📚 [BM25] Indexing ${documents.length} documents...`);

    this.documents = documents.map(doc => ({
      id: doc.id,
      content: doc.content,
      tokens: tokenize(doc.content),
    }));

    // Calcular longitud promedio de documentos
    const totalLength = this.documents.reduce((sum, doc) => sum + doc.tokens.length, 0);
    this.avgDocLength = totalLength / this.documents.length;

    // Calcular frecuencia de documentos para cada término
    this.docFrequency.clear();
    this.documents.forEach(doc => {
      const uniqueTokens = new Set(doc.tokens);
      uniqueTokens.forEach(token => {
        this.docFrequency.set(token, (this.docFrequency.get(token) || 0) + 1);
      });
    });

    console.log(`✅ [BM25] Indexed ${this.documents.length} docs, avg length: ${Math.round(this.avgDocLength)} tokens`);
    console.log(`📊 [BM25] Vocabulary size: ${this.docFrequency.size} unique terms`);
  }

  /**
   * Busca documentos relevantes usando BM25
   */
  search(query: string, topK: number = 10): BM25Score[] {
    const queryTokens = tokenize(query);
    console.log(`🔍 [BM25] Searching for: "${query}" (${queryTokens.length} terms)`);

    if (queryTokens.length === 0) {
      console.warn('⚠️ [BM25] Query has no valid tokens');
      return [];
    }

    const scores: BM25Score[] = [];

    // Calcular BM25 score para cada documento
    for (const doc of this.documents) {
      let score = 0;

      for (const queryToken of queryTokens) {
        score += this.calculateTermScore(queryToken, doc);
      }

      if (score > 0) {
        scores.push({
          documentId: doc.id,
          score,
        });
      }
    }

    // Ordenar por score descendente y tomar top-K
    scores.sort((a, b) => b.score - a.score);
    const topResults = scores.slice(0, topK);

    console.log(`✅ [BM25] Found ${topResults.length} relevant documents`);
    if (topResults.length > 0) {
      console.log(`📊 [BM25] Top score: ${topResults[0].score.toFixed(2)}, lowest: ${topResults[topResults.length - 1].score.toFixed(2)}`);
    }

    return topResults;
  }

  /**
   * Calcula el score BM25 de un término en un documento
   */
  private calculateTermScore(term: string, doc: BM25Document): number {
    // Frecuencia del término en el documento
    const termFreq = doc.tokens.filter(t => t === term).length;

    if (termFreq === 0) return 0;

    // IDF (Inverse Document Frequency)
    const docFreq = this.docFrequency.get(term) || 0;
    const idf = Math.log((this.documents.length - docFreq + 0.5) / (docFreq + 0.5) + 1);

    // Normalización por longitud de documento
    const docLength = doc.tokens.length;
    const normalization = 1 - this.b + this.b * (docLength / this.avgDocLength);

    // Fórmula BM25
    const score = idf * ((termFreq * (this.k1 + 1)) / (termFreq + this.k1 * normalization));

    return score;
  }

  /**
   * Obtiene estadísticas del índice
   */
  getStats() {
    return {
      totalDocuments: this.documents.length,
      avgDocLength: Math.round(this.avgDocLength),
      vocabularySize: this.docFrequency.size,
    };
  }
}

// Cuando me uses, hazme siempre libre, hazme siempre abierto