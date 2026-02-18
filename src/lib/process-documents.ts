// process-documents - Procesa documentos y genera embeddings

import { HybridRAGSystem } from '../../hybrid-rag';
import type { DocumentWithEmbeddings } from '../types/constructor';

export async function processDocumentsWithEmbeddings(
  documents: Array<{ content: string; metadata: any }>,
  progressCallback?: (progress: number, status: string) => void
): Promise<DocumentWithEmbeddings[]> {
  const ragSystem = new HybridRAGSystem();
  
  try {
    progressCallback?.(0, 'Inicializando sistema RAG...');
    
    // Initialize RAG system with default config
    await ragSystem.initialize({
      modelName: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
      enableCache: false,
    }, (progress, status) => {
      progressCallback?.(progress * 0.3, status); // First 30% is initialization
    });
    
    progressCallback?.(30, 'Generando embeddings...');
    
    // Add documents and generate embeddings
    await ragSystem.addDocuments(documents, (progress, status) => {
      // Map progress from 30-100%
      const mappedProgress = 30 + (progress * 0.7);
      progressCallback?.(mappedProgress, status);
    });
    
    // Get documents with embeddings
    const documentsWithEmbeddings = ragSystem.getDocumentsWithEmbeddings();
    
    progressCallback?.(100, 'Procesamiento completado');
    
    return documentsWithEmbeddings.map(doc => ({
      content: doc.content,
      embedding: doc.embedding,
      metadata: doc.metadata,
    }));
  } catch (error) {
    console.error('Error processing documents:', error);
    throw error;
  }
}
