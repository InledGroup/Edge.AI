import { ARAGStore, type ARAGChunk, type ARAGSentence } from './arag-store';
import { RAGModelLoader } from './model-loader';
import { v4 as uuidv4 } from 'uuid';
import natural from 'natural';

export class ARAGIndexer {
  private store = new ARAGStore();
  private tokenizer = new natural.SentenceTokenizer();

  async index(text: string, metadata: any = {}, onProgress?: (p: number, msg: string) => void) {
    if (onProgress) onProgress(5, 'Analizando estructura jerárquica...');
    
    // 1. Chunking de ~1000 tokens respetando oraciones
    const sentences = this.tokenizer.tokenize(text);
    const chunks: ARAGChunk[] = [];
    let currentChunkSentences: string[] = [];
    let currentTokens = 0;

    for (const sent of sentences) {
      const sentTokens = sent.split(/\s+/).length;
      if (currentTokens + sentTokens > 1000 && currentChunkSentences.length > 0) {
        chunks.push({
          id: uuidv4(),
          documentId: metadata.documentId || 'unknown',
          content: currentChunkSentences.join(' '),
          metadata
        });
        currentChunkSentences = [sent];
        currentTokens = sentTokens;
      } else {
        currentChunkSentences.push(sent);
        currentTokens += sentTokens;
      }
    }
    if (currentChunkSentences.length > 0) {
      chunks.push({ id: uuidv4(), documentId: metadata.documentId || 'unknown', content: currentChunkSentences.join(' '), metadata });
    }

    // 2. Procesamiento de Oraciones y Embeddings
    const loader = RAGModelLoader.getInstance();
    const embedder = await loader.getEmbedder();
    const aragSentences: ARAGSentence[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkSentences = this.tokenizer.tokenize(chunk.content);
      
      if (onProgress) onProgress(10 + (i/chunks.length)*80, `Indexando chunk ${i+1}/${chunks.length} (${chunkSentences.length} oraciones)...`);

      // Generar embeddings por oración en el chunk
      for (const sText of chunkSentences) {
        const output = await embedder(sText, { pooling: 'mean', normalize: true });
        aragSentences.push({
          id: uuidv4(),
          chunkId: chunk.id,
          content: sText,
          embedding: Array.from(output.data) as number[]
        });
      }
      // Pequeño respiro para la UI
      await new Promise(r => setTimeout(r, 0));
    }

    // 3. Guardar en Store
    if (onProgress) onProgress(95, 'Sincronizando índice jerárquico local...');
    await this.store.saveHierarchy(chunks, aragSentences);
    
    if (onProgress) onProgress(100, 'Indexación A-RAG completada.');
    return chunks.length;
  }
}
