// RAG Pipeline - Complete Retrieval-Augmented Generation flow
// 100% local processing: chunk → embed → search → generate

import { chunkAndStoreDocument } from './chunking';
import { searchSimilarChunks, createRAGContext } from './vector-search';
import { createEmbeddingsBatch } from '@/lib/db/embeddings';
import { getChunksByDocument } from '@/lib/db/chunks';
import { updateDocumentStatus } from '@/lib/db/documents';
import { expandQuery, rewriteQuery } from './query-expansion';
import { calculateRAGMetrics, assessRAGQuality, calculateFaithfulness } from './rag-metrics';
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
 * Query with RAG: expand query → embed → hybrid search → create context
 */
export async function queryWithRAG(
  query: string,
  embeddingEngine: WllamaEngine,
  topK: number = 5,
  documentIds?: string[],
  chatEngine?: WebLLMEngine | WllamaEngine,
  options?: {
    useQueryExpansion?: boolean;
    useQueryRewriting?: boolean;
  }
): Promise<RAGResult> {
  const startTime = Date.now();

  console.log(`🔍 RAG Query: "${query}"`);

  let searchQuery = query;

  // Optional: Rewrite query for clarity
  if (options?.useQueryRewriting && chatEngine) {
    try {
      searchQuery = await rewriteQuery(query, chatEngine);
      console.log(`✍️ Rewritten query: "${searchQuery}"`);
    } catch (error) {
      console.warn('⚠️ Query rewriting failed, using original');
    }
  }

  // Optional: Expand query for better recall
  let expandedText = searchQuery;
  if (options?.useQueryExpansion && chatEngine) {
    try {
      const expanded = await expandQuery(searchQuery, chatEngine, {
        maxVariations: 2,
        includeOriginal: true
      });
      expandedText = expanded.combined;
      console.log(`🔍 Using expanded query (${expanded.expanded.length} variations)`);
    } catch (error) {
      console.warn('⚠️ Query expansion failed, using original');
    }
  }

  // Step 1: Generate embedding for query
  console.log('🔢 Generating query embedding...');
  const queryEmbedding = await embeddingEngine.generateEmbedding(expandedText);

  // Step 2: Hybrid search with BM25 + semantic
  const chunks = await searchSimilarChunks(
    queryEmbedding,
    topK,
    documentIds,
    searchQuery, // Use original query for BM25
    {
      semanticWeight: 0.7,
      lexicalWeight: 0.3,
      useReranking: true
    }
  );

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
    stop: ['\n👤 Usuario:', '👤 Usuario:', '\n## PREGUNTA DEL USUARIO:', '\nUsuario:'],
    onStream
  });

  return answer;
}

/**
 * Build RAG prompt with context and conversation history
 * MEJORADO: Chain-of-thought reasoning + mejor estructura
 */
function buildRAGPrompt(query: string, context: string, conversationHistory?: Array<{role: string, content: string}>): string {
  if (!context) {
    return `Pregunta: ${query}\n\nResponde de forma clara y concisa.`;
  }

  // Build conversation history if provided
  let historyText = '';
  if (conversationHistory && conversationHistory.length > 0) {
    historyText = '\n\n## HISTORIAL DE CONVERSACIÓN:\n';
    conversationHistory.forEach((msg) => {
      if (msg.role === 'user') {
        historyText += `👤 Usuario: ${msg.content}\n`;
      } else if (msg.role === 'assistant') {
        historyText += `🤖 Asistente: ${msg.content}\n`;
      }
    });
    historyText += '\n';
  }

  // Enhanced prompt - instruye al modelo internamente pero no le pide mostrar pasos
  return `Eres un asistente experto que analiza documentos y responde preguntas de manera precisa y útil.

## CONTEXTO DE DOCUMENTOS:
${context}${historyText}
## PREGUNTA DEL USUARIO:
${query}

## INSTRUCCIONES:

Analiza el contexto proporcionado y responde la pregunta siguiendo este proceso mental:
1. Identifica qué documentos contienen información relevante
2. Sintetiza la información de múltiples fuentes cuando sea apropiado
3. Proporciona una respuesta clara y directa

Tu respuesta debe:
- Basarse PRINCIPALMENTE en el contexto proporcionado
- Citar las fuentes usando formato [Doc N] cuando menciones información específica
- Ser clara, completa pero concisa
- Si usas conocimiento general además del contexto, indica claramente qué proviene de cada fuente
- Solo si el contexto no tiene NINGUNA relación con la pregunta, indica que los documentos no contienen esa información

IMPORTANTE: Proporciona solo la respuesta final. NO muestres tu proceso de análisis ni pasos intermedios.

Respuesta:`;
}

/**
 * Complete RAG flow: query → retrieve → generate
 * MEJORADO: Incluye métricas de calidad
 */
export async function completeRAGFlow(
  query: string,
  embeddingEngine: WllamaEngine,
  chatEngine: WebLLMEngine | WllamaEngine,
  topK: number = 5,
  documentIds?: string[],
  conversationHistory?: Array<{role: string, content: string}>,
  onStream?: (chunk: string) => void,
  options?: {
    useQueryExpansion?: boolean;
    useQueryRewriting?: boolean;
    calculateMetrics?: boolean;
  }
): Promise<{
  answer: string;
  ragResult: RAGResult;
  metrics?: ReturnType<typeof calculateRAGMetrics>;
  quality?: ReturnType<typeof assessRAGQuality>;
  faithfulness?: number;
}> {
  // Step 1: Retrieve relevant chunks with enhanced options
  const ragResult = await queryWithRAG(
    query,
    embeddingEngine,
    topK,
    documentIds,
    chatEngine,
    {
      useQueryExpansion: options?.useQueryExpansion,
      useQueryRewriting: options?.useQueryRewriting
    }
  );

  console.log(`📊 Retrieved ${ragResult.chunks.length} chunks in ${ragResult.searchTime}ms`);

  // Step 2: Calculate quality metrics (if enabled)
  let metrics, quality;
  if (options?.calculateMetrics !== false) {
    const context = createRAGContext(ragResult.chunks);
    metrics = calculateRAGMetrics(query, ragResult.chunks, context);
    quality = assessRAGQuality(metrics);

    console.log(`✅ [RAG Quality] Overall: ${quality.overall}`);
    if (quality.warnings.length > 0) {
      console.log(`⚠️ [RAG Quality] Warnings:`, quality.warnings);
    }
  }

  // Step 3: Generate answer with conversation history
  const answer = await generateRAGAnswer(query, ragResult, chatEngine, conversationHistory, onStream);

  // Step 4: Calculate answer faithfulness (if metrics enabled)
  let faithfulness;
  if (options?.calculateMetrics !== false) {
    const context = createRAGContext(ragResult.chunks);
    faithfulness = calculateFaithfulness(answer, context);
  }

  return { answer, ragResult, metrics, quality, faithfulness };
}

/**
 * Check if document is ready for RAG queries
 */
export async function isDocumentReady(documentId: string): Promise<boolean> {
  const chunks = await getChunksByDocument(documentId);
  return chunks.length > 0;
}
