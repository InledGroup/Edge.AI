// RAG Pipeline - Complete Retrieval-Augmented Generation flow
// 100% local processing: chunk → embed → search → generate

import { chunkAndStoreDocument } from './chunking';
import { searchSimilarChunks, createRAGContext } from './vector-search';
import { createEmbeddingsBatch } from '@/lib/db/embeddings';
import { getChunksByDocument } from '@/lib/db/chunks';
import { updateDocumentStatus } from '@/lib/db/documents';
import type { WllamaEngine } from '@/lib/ai/wllama-engine';
import type { WebLLMEngine } from '@/lib/ai/webllm-engine';
import type { RAGResult, ProcessingStatus } from '@/types';

/**
 * Process a document: chunk + embed + store
 */
export async function processDocument(
  documentId: string,
  text: string,
  embeddingEngine: WllamaEngine,
  chunkSize: number = 800,
  onProgress?: (status: ProcessingStatus) => void
): Promise<void> {
  try {
    console.log(`🚀 Processing document ${documentId}...`);

    // Update status: chunking
    await updateDocumentStatus(documentId, 'processing');
    onProgress?.({
      documentId,
      stage: 'chunking',
      progress: 10,
      message: 'Dividiendo documento en fragmentos...'
    });

    // Step 1: Chunk the document
    const chunks = await chunkAndStoreDocument(documentId, text, chunkSize);
    console.log(`✅ Created ${chunks.length} chunks`);

    onProgress?.({
      documentId,
      stage: 'embedding',
      progress: 30,
      message: `Generando embeddings (0/${chunks.length})...`
    });

    // Step 2: Generate embeddings for all chunks
    const texts = chunks.map(c => c.content);
    const embeddings = await embeddingEngine.generateEmbeddingsBatch(
      texts,
      4, // Max 4 concurrent
      (progress, status) => {
        onProgress?.({
          documentId,
          stage: 'embedding',
          progress: 30 + (progress * 0.6), // 30-90%
          message: status
        });
      }
    );

    console.log(`✅ Generated ${embeddings.length} embeddings`);

    // Step 3: Store embeddings
    onProgress?.({
      documentId,
      stage: 'embedding',
      progress: 95,
      message: 'Guardando embeddings...'
    });

    const embeddingsToStore = chunks.map((chunk, i) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      vector: embeddings[i],
      model: 'wllama-embedding' // Track which model was used
    }));

    await createEmbeddingsBatch(embeddingsToStore);

    // Step 4: Mark as ready
    await updateDocumentStatus(documentId, 'ready');

    onProgress?.({
      documentId,
      stage: 'complete',
      progress: 100,
      message: 'Documento procesado correctamente'
    });

    console.log(`✅ Document ${documentId} processed successfully`);
  } catch (error) {
    console.error(`❌ Failed to process document ${documentId}:`, error);

    await updateDocumentStatus(
      documentId,
      'error',
      error instanceof Error ? error.message : 'Unknown error'
    );

    onProgress?.({
      documentId,
      stage: 'error',
      progress: 0,
      message: 'Error al procesar documento',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    throw error;
  }
}

/**
 * Query with RAG: embed query → search → create context
 */
export async function queryWithRAG(
  query: string,
  embeddingEngine: WllamaEngine,
  topK: number = 5,
  documentIds?: string[]
): Promise<RAGResult> {
  const startTime = Date.now();

  console.log(`🔍 RAG Query: "${query}"`);

  // Step 1: Generate embedding for query
  console.log('🔢 Generating query embedding...');
  const queryEmbedding = await embeddingEngine.generateEmbedding(query);

  // Step 2: Search for similar chunks
  const chunks = await searchSimilarChunks(queryEmbedding, topK, documentIds);

  const searchTime = Date.now() - startTime;

  return {
    query,
    chunks,
    totalSearched: chunks.length,
    searchTime
  };
}

/**
 * Generate answer using RAG context
 */
export async function generateRAGAnswer(
  query: string,
  ragResult: RAGResult,
  chatEngine: WebLLMEngine | WllamaEngine,
  conversationHistory?: Array<{role: string, content: string}>,
  onStream?: (chunk: string) => void
): Promise<string> {
  // Create context from retrieved chunks
  const context = createRAGContext(ragResult.chunks);

  // Build prompt with conversation history
  const prompt = buildRAGPrompt(query, context, conversationHistory);

  console.log('💬 Generating answer with context and history...');

  // Generate response
  const answer = await chatEngine.generateText(prompt, {
    temperature: 0.7,
    maxTokens: 1024,
    onStream
  });

  return answer;
}

/**
 * Build RAG prompt with context and conversation history
 */
function buildRAGPrompt(query: string, context: string, conversationHistory?: Array<{role: string, content: string}>): string {
  if (!context) {
    return `Pregunta: ${query}\n\nResponde de forma clara y concisa.`;
  }

  // Build conversation history if provided
  let historyText = '';
  if (conversationHistory && conversationHistory.length > 0) {
    historyText = '\n\nHISTORIAL DE CONVERSACIÓN:\n';
    conversationHistory.forEach((msg) => {
      if (msg.role === 'user') {
        historyText += `Usuario: ${msg.content}\n`;
      } else if (msg.role === 'assistant') {
        historyText += `Asistente: ${msg.content}\n`;
      }
    });
    historyText += '\n';
  }

  return `Eres un asistente experto que analiza documentos y responde preguntas de manera precisa y útil.

CONTEXTO DE DOCUMENTOS:
${context}${historyText}
PREGUNTA ACTUAL: ${query}

INSTRUCCIONES:
- Usa PRINCIPALMENTE la información del contexto proporcionado
- Combina información de múltiples fragmentos cuando sea relevante
- Haz inferencias razonables basándote en el contexto disponible
- Si mencionas información del contexto, cita el documento fuente (ej: "Según el Documento 1...")
- Si el contexto no contiene información directa pero puedes responder usando conocimiento general relacionado con el tema de los documentos, hazlo indicando claramente qué proviene del contexto y qué es conocimiento general
- Solo si el contexto no tiene NINGUNA relación con la pregunta, indica que los documentos no contienen esa información específica

RESPUESTA:`;
}

/**
 * Complete RAG flow: query → retrieve → generate
 */
export async function completeRAGFlow(
  query: string,
  embeddingEngine: WllamaEngine,
  chatEngine: WebLLMEngine | WllamaEngine,
  topK: number = 5,
  documentIds?: string[],
  conversationHistory?: Array<{role: string, content: string}>,
  onStream?: (chunk: string) => void
): Promise<{ answer: string; ragResult: RAGResult }> {
  // Step 1: Retrieve relevant chunks
  const ragResult = await queryWithRAG(query, embeddingEngine, topK, documentIds);

  console.log(`📊 Retrieved ${ragResult.chunks.length} chunks in ${ragResult.searchTime}ms`);

  // Step 2: Generate answer with conversation history
  const answer = await generateRAGAnswer(query, ragResult, chatEngine, conversationHistory, onStream);

  return { answer, ragResult };
}

/**
 * Check if document is ready for RAG queries
 */
export async function isDocumentReady(documentId: string): Promise<boolean> {
  const chunks = await getChunksByDocument(documentId);
  return chunks.length > 0;
}
