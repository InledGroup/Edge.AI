// export-chatbot - Exporta chatbot RAG como HTML
// Genera el HTML usando el código RAG existente

import { getAllDocuments } from '@/lib/db/documents';
import { getAllEmbeddings } from '@/lib/db/embeddings';
import { getChunksByDocument } from '@/lib/db/chunks';

export interface ExportedChunk {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  index: number;
  embedding: number[];
  metadata?: {
    prevContext?: string;
    nextContext?: string;
    expandedContext?: string;
  };
}

export interface ChatbotExportConfig {
  name: string;
  description: string;
  modelId: string;
  topK: number;
  temperature: number;
  maxTokens: number;
  similarityThreshold: number;
  chunkWindowSize: number;
}

export async function generateChatbotHTML(
  config: ChatbotExportConfig
): Promise<string> {
  const documents = await getAllDocuments();
  const allEmbeddings = await getAllEmbeddings();

  const exportedChunks: ExportedChunk[] = [];

  for (const doc of documents) {
    if (doc.status !== 'ready') continue;

    const chunks = await getChunksByDocument(doc.id);
    const docEmbeddings = allEmbeddings.filter(e => e.documentId === doc.id);

    const embeddingMap = new Map<string, Float32Array>();
    for (const emb of docEmbeddings) {
      embeddingMap.set(emb.chunkId, emb.vector);
    }

    for (const chunk of chunks) {
      const embedding = embeddingMap.get(chunk.id);
      if (!embedding) continue;

      exportedChunks.push({
        id: chunk.id,
        documentId: chunk.documentId,
        documentName: doc.name,
        content: chunk.content,
        index: chunk.index,
        embedding: Array.from(embedding),
        metadata: {
          prevContext: chunk.metadata?.prevContext,
          nextContext: chunk.metadata?.nextContext,
          expandedContext: chunk.metadata?.expandedContext
        }
      });
    }
  }

  if (exportedChunks.length === 0) {
    throw new Error('No hay documentos procesados para exportar');
  }

  // Read the HTML template from public folder
  const response = await fetch('/chatbot-template.html');
  let html = await response.text();

  // Replace placeholders
  html = html
    .replaceAll('__CHATBOT_NAME__', config.name)
    .replaceAll('__CHATBOT_DESCRIPTION__', config.description)
    .replaceAll('__MODEL_ID__', config.modelId)
    .replaceAll('__TOP_K__', config.topK.toString())
    .replaceAll('__TEMPERATURE__', config.temperature.toString())
    .replaceAll('__MAX_TOKENS__', config.maxTokens.toString())
    .replaceAll('__SIMILARITY_THRESHOLD__', config.similarityThreshold.toString())
    .replaceAll('__CHUNK_WINDOW_SIZE__', config.chunkWindowSize.toString())
    .replaceAll('__CHUNKS_DATA__', JSON.stringify(exportedChunks));

  return html;
}
