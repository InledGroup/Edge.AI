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
        const calculatedProgress = 30 + (progress * 0.6); // 30-90%
        console.log(`📊 [RAG Pipeline] Progress: ${calculatedProgress.toFixed(1)}% - ${status}`);
        onProgress?.({
          documentId,
          stage: 'embedding',
          progress: calculatedProgress,
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
    topK + 3, // Fetch more candidates initially
    documentIds,
    searchQuery, // Use original query for BM25
    {
      semanticWeight: 0.85, // Higher weight for our new better embedding model
      lexicalWeight: 0.15,
      useReranking: true,
      minRelevance: 0.3 // Require minimum relevance to avoid noise
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
  onStream?: (chunk: string) => void,
  additionalContext?: string
): Promise<string> {
  // Create context from retrieved chunks
  const context = createRAGContext(ragResult.chunks);

  console.log('💬 Generating answer with context and history...');

  // Build structured messages
  const messages: { role: string; content: string }[] = [];

  // 1. System Prompt with Context - ENHANCED for better accuracy
  let systemContent = `Eres un asistente de IA avanzado especializado en analizar documentos y responder preguntas basándote EXCLUSIVAMENTE en el contexto proporcionado. Tu objetivo es ser preciso, honesto y útil.

## CONTEXTO DE DOCUMENTOS (Ventana Ampliada):
${context || 'No se encontraron documentos relevantes para esta consulta.'}

## INSTRUCCIONES CRÍTICAS (NO ALUCINAR):
1. **Regla de Oro:** Si la respuesta NO está explícitamente en el texto de arriba, DEBES decir: "Lo siento, los documentos proporcionados no contienen información sobre [tema de la pregunta]".
   - 🚫 NO inventes definiciones.
   - 🚫 NO asumas que una organización es "sin fines de lucro" o "tecnológica" si no lo dice.
   - 🚫 NO uses tu conocimiento general para llenar vacíos de información específica.

2. **Citas Precisas:** Cada afirmación debe estar respaldada. Usa [Doc N] al final de cada frase clave.

3. **Manejo de Ambigüedad:** Si el contexto menciona el término pero no lo define (ej. aparece en un título pero falta el texto descriptivo), indícalo: "El documento menciona 'Inled Group' pero no proporciona una definición explícita."

4. **Respuesta Directa:** Responde concisamente. Si la respuesta es una lista, usa viñetas.

Analiza el contexto con cuidado. A menudo la respuesta está en el texto circundante (Contexto anterior/posterior).`;

  if (additionalContext) {
    systemContent += `\n\n${additionalContext}`;
  }

  messages.push({
    role: 'system',
    content: systemContent
  });

  // 2. Conversation History
  if (conversationHistory && conversationHistory.length > 0) {
    conversationHistory.forEach(msg => {
      messages.push({ role: msg.role, content: msg.content });
    });
  }

  // 3. User Question
  // Ensure we don't duplicate the last message if it's already in history
  const lastHistoryMsg = conversationHistory?.[conversationHistory.length - 1];
  if (!lastHistoryMsg || lastHistoryMsg.content !== query) {
    messages.push({
      role: 'user',
      content: query
    });
  }

  // Generate response using structured messages
  const answer = await chatEngine.generateText(messages, {
    temperature: 0.7,
    maxTokens: 1024,
    stop: ['<|im_end|>', '<|end|>', '<|eot_id|>'],
    onStream
  });

  return answer;
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
    additionalContext?: string;
  }
): Promise<{
  answer: string;
  ragResult: RAGResult;
  metrics?: ReturnType<typeof calculateRAGMetrics>;
  quality?: ReturnType<typeof assessRAGQuality>;
  faithfulness?: number;
}> {
  // Auto-enable query rewriting for short queries
  const isShortQuery = query.split(/\s+/).length < 8;
  const shouldRewrite = options?.useQueryRewriting !== false && (options?.useQueryRewriting || isShortQuery);

  // Step 1: Retrieve relevant chunks with enhanced options
  const ragResult = await queryWithRAG(
    query,
    embeddingEngine,
    topK,
    documentIds,
    chatEngine,
    {
      useQueryExpansion: options?.useQueryExpansion,
      useQueryRewriting: shouldRewrite
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
  const answer = await generateRAGAnswer(query, ragResult, chatEngine, conversationHistory, onStream, options?.additionalContext);

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
