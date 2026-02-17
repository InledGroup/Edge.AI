// RAG Pipeline - Complete Retrieval-Augmented Generation flow
// 100% local processing: chunk → embed → search → generate

import { chunkAndStoreDocument } from './chunking';
import { searchSimilarChunks, createRAGContext, reciprocalRankFusion } from './vector-search';
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

  // 1. Optional: Query Expansion
  let queries = [searchQuery];
  if (options?.useQueryExpansion && chatEngine) {
    try {
      const expanded = await expandQuery(searchQuery, chatEngine, {
        maxVariations: 2,
        includeOriginal: false
      });
      queries = [...queries, ...expanded.expanded];
      console.log(`🔍 Using expanded queries (${queries.length} total)`);
    } catch (error) {
      console.warn('⚠️ Query expansion failed');
    }
  }

  // 2. Retrieve chunks for all query variations
  const resultLists: any[][] = [];
  
  for (const q of queries) {
    const queryEmbedding = await embeddingEngine.generateEmbedding(q);
    const chunks = await searchSimilarChunks(
      queryEmbedding,
      topK + 10, // Fetch more for RRF and Reranking
      documentIds,
      searchQuery,
      {
        semanticWeight: 0.85,
        lexicalWeight: 0.15,
        useReranking: true,
        minRelevance: 0.2
      }
    );
    resultLists.push(chunks);
  }

  // 3. Combine results using RRF (Reciprocal Rank Fusion)
  let combinedChunks = queries.length > 1 
    ? reciprocalRankFusion(resultLists) 
    : resultLists[0];

  // 4. LLM-Based Reranking (Listwise)
  if (chatEngine && combinedChunks.length > 1) {
    try {
      console.log('🔄 Performing LLM-based reranking...');
      const candidates = combinedChunks.slice(0, 10);
      const candidatesText = candidates.map((c, i) => `ID ${i}: ${c.chunk.content.substring(0, 200)}...`).join('\n\n');
      
      const rerankPrompt = `Dados estos fragmentos de documentos, ordénalos de más relevante a menos relevante para responder a la pregunta: "${query}". 
Responde ÚNICAMENTE con los IDs separados por comas, del más al menos relevante.
Ejemplo: 3, 0, 2, 1

FRAGMENTOS:
${candidatesText}`;

      const rerankOrder = await chatEngine.generateText([{ role: 'user', content: rerankPrompt }], { maxTokens: 50 });
      const orderIds = rerankOrder.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      
      if (orderIds.length > 0) {
        const reranked = orderIds.map(idx => candidates[idx]).filter(Boolean);
        // Add remaining chunks that weren't in the top 10
        combinedChunks = [...reranked, ...combinedChunks.slice(10)];
        console.log(`✅ LLM Reranking complete. Best ID: ${orderIds[0]}`);
      }
    } catch (error) {
      console.warn('⚠️ LLM Reranking failed, using original order');
    }
  }

  const searchTime = Date.now() - startTime;

  return {
    query,
    chunks: combinedChunks.slice(0, topK),
    totalSearched: combinedChunks.length,
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
  // Create context from retrieved chunks (already reordered for Lost in the Middle)
  const context = createRAGContext(ragResult.chunks);

  console.log('💬 Generating answer with context and history...');

  // Build structured messages
  const messages: { role: string; content: string }[] = [];

  // 1. System Prompt with Context
  let systemContent = `Eres un asistente de IA avanzado especializado en analizar documentos. 
RESPONDE ÚNICAMENTE basándote en el contexto proporcionado.

## CONTEXTO DE DOCUMENTOS (Ventana Ampliada "Small-to-Big"):
${context || 'No se encontraron documentos relevantes.'}

## INSTRUCCIONES:
1. Si no conoces la respuesta, di que no está en los documentos. NO INVENTES.
2. Puedes pedir leer más de un documento si crees que la información está cerca.
   Para expandir conocimientos, indica al final de tu respuesta: "(nombre documento).readmore=(numero de lineas)".
3. Cita las fuentes usando [Doc N].

REGLA DE ORO: La precisión es lo más importante.`;

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
