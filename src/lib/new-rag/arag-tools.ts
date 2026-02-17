import { ARAGStore } from './arag-store';
import { RAGModelLoader } from './model-loader';

export class ARAGTools {
  private store = new ARAGStore();

  /**
   * Búsqueda por palabras clave en los chunks.
   * Devuelve snippets de las oraciones que contienen las keywords.
   */
  async keyword_search(keywords: string[], k: number = 3) {
    const chunks = await this.store.getAllChunks();
    const scored = chunks.map(chunk => {
      let score = 0;
      const contentLower = chunk.content.toLowerCase();
      keywords.forEach(kw => {
        const count = (contentLower.match(new RegExp(kw.toLowerCase(), 'g')) || []).length;
        score += count * kw.length;
      });
      return { chunk, score };
    }).filter(s => s.score > 0);

    const topK = scored.sort((a, b) => b.score - a.score).slice(0, k);
    
    return topK.map(s => {
      // Extraer solo oraciones que contienen alguna keyword como snippet
      const sentences = s.chunk.content.split(/[.!?]+/).filter(sent => 
        keywords.some(kw => sent.toLowerCase().includes(kw.toLowerCase()))
      );
      return {
        chunk_id: s.chunk.id,
        snippet: sentences.join('... ').substring(0, 500) + '...'
      };
    });
  }

  /**
   * Búsqueda semántica a nivel de oración.
   * Agrupa por chunk padre y devuelve el mejor fragmento.
   */
  async semantic_search(query: string, k: number = 3) {
    const loader = RAGModelLoader.getInstance();
    const embedder = await loader.getEmbedder();
    const queryOut = await embedder(query, { pooling: 'mean', normalize: true });
    const queryVec = Array.from(queryOut.data) as number[];

    const sentences = await this.store.getAllSentences();
    const scored = sentences.map(s => ({
      ...s,
      similarity: this.cosineSimilarity(queryVec, s.embedding)
    }));

    // Agrupar por chunk y quedarse con la mejor oración de cada uno
    const chunkScores = new Map<string, { score: number, sentence: string }>();
    scored.forEach(s => {
      const existing = chunkScores.get(s.chunkId);
      if (!existing || s.similarity > existing.score) {
        chunkScores.set(s.chunkId, { score: s.similarity, sentence: s.content });
      }
    });

    const topChunks = Array.from(chunkScores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, k);

    return topChunks.map(([id, data]) => ({
      chunk_id: id,
      snippet: data.sentence
    }));
  }

  /**
   * Lectura completa de chunks específicos.
   */
  async chunk_read(chunkIds: string[]) {
    const results = [];
    for (const id of chunkIds) {
      const chunk = await this.store.getChunk(id);
      if (chunk) {
        results.push({
          chunk_id: id,
          content: chunk.content
        });
      }
    }
    return results;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
  }
}
