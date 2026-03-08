// RAG Pipeline - Complete Retrieval-Augmented Generation flow
// 100% local processing: chunk → embed → search → generate

import { chunkAndStoreDocument } from './chunking';
import { searchSimilarChunks, createRAGContext, reciprocalRankFusion } from './vector-search';
import { createEmbeddingsBatch } from '@/lib/db/embeddings';
import { getChunksByDocument } from '@/lib/db/chunks';
import { updateDocumentStatus } from '@/lib/db/documents';
import { expandQuery, rewriteQuery } from './query-expansion';
import { calculateRAGMetrics, assessRAGQuality, calculateFaithfulness } from './rag-metrics';
import { getGenerationSettings, getRAGSettings } from '@/lib/db/settings';
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
    chunkWindowSize?: number;
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
      q, // Use expanded query for BM25 as well
      {
        semanticWeight: 0.8,
        lexicalWeight: 0.2,
        useReranking: true,
        minRelevance: 0.15,
        chunkWindowSize: options?.chunkWindowSize
      } as any
    );
    resultLists.push(chunks);
  }

  // 3. Combine results using RRF (Reciprocal Rank Fusion)
  let combinedChunks = queries.length > 1 
    ? reciprocalRankFusion(resultLists) 
    : resultLists[0];

  // 4. Optional: LLM-Based Reranking (Listwise)
  if (chatEngine && combinedChunks.length > 1) {
    try {
      console.log('🔄 [RAG Pipeline] Performing LLM-based reranking...');
      const candidates = combinedChunks.slice(0, 10);
      const candidatesText = candidates.map((c, i) => `[ID ${i}]: ${c.chunk.content.substring(0, 300)}...`).join('\n\n');
      
      const rerankPrompt = `Dados estos fragmentos de documentos, ordénalos de más relevante a menos relevante para responder a la pregunta: "${query}". 
Responde ÚNICAMENTE con los IDs separados por comas, del más al menos relevante.
Ejemplo: 3, 0, 2, 1

FRAGMENTOS:
${candidatesText}`;

      const rerankOrder = await chatEngine.generateText([{ role: 'user', content: rerankPrompt }], { 
        maxTokens: 50,
        temperature: 0.1 
      });
      
      const orderIds = rerankOrder
        .split(/[,\s]+/)
        .map(s => parseInt(s.replace(/[^0-9]/g, '')))
        .filter(n => !isNaN(n) && n >= 0 && n < candidates.length);
      
      if (orderIds.length > 0) {
        const reranked = orderIds.map(idx => candidates[idx]).filter(Boolean);
        // Add remaining candidates and then the rest of the chunks
        const rerankedIds = new Set(orderIds);
        const remainingCandidates = candidates.filter((_, i) => !rerankedIds.has(i));
        combinedChunks = [...reranked, ...remainingCandidates, ...combinedChunks.slice(10)];
        console.log(`✅ [RAG Pipeline] LLM Reranking complete. Best chunk ID: ${orderIds[0]}`);
      }
    } catch (error) {
      console.warn('⚠️ [RAG Pipeline] LLM Reranking failed, using original order');
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
 * RESTAURADO: Estructura de razonamiento Chain-of-Thought (CoT) de alta precisión
 */
export async function generateRAGAnswer(
  query: string,
  ragResult: RAGResult,
  chatEngine: WebLLMEngine | WllamaEngine,
  conversationHistory?: Array<{role: string, content: string}>,
  onStream?: (chunk: string) => void,
  additionalContext?: string,
  signal?: AbortSignal
): Promise<string> {
  // Get dynamic generation settings from database
  const genSettings = await getGenerationSettings();
  const temperature = genSettings.temperature ?? 0.3; 
  const maxTokens = genSettings.maxTokens ?? 1024;

  // Estimate model context window
  const engineLimit = (chatEngine as any).getContextWindowSize?.() || 4096;
  const estimatedWindow = engineLimit; 
  const safetyMargin = Math.min(600, Math.floor(estimatedWindow * 0.2));
  const maxPromptTokens = estimatedWindow - maxTokens - safetyMargin;
  
  // 1 token ≈ 3 chars (very conservative for technical/CoT prompts)
  const maxPromptChars = maxPromptTokens * 3; 

  // Create context from retrieved chunks
  let contextChunks = [...ragResult.chunks];
  let context = createRAGContext(contextChunks);

  // Dynamic truncation
  if (context.length > maxPromptChars) {
    console.warn(`⚠️ [RAG Pipeline] Truncating context for CoT...`);
    while (context.length > maxPromptChars && contextChunks.length > 1) {
      const middleIndex = Math.floor(contextChunks.length / 2);
      contextChunks.splice(middleIndex, 1);
      context = createRAGContext(contextChunks);
    }
  }

  console.log(`💬 Generating synthesized answer (Window: ${estimatedWindow}, Temp: ${temperature})...`);

  // Build structured messages
  const messages: { role: string; content: string }[] = [];

  // 1. System Prompt with Enhanced Synthesis instructions
  let systemContent = `Eres un analista técnico experto con memoria persistente. Tu misión es sintetizar la información de múltiples documentos y tus recuerdos sobre el usuario para responder preguntas de forma exhaustiva y precisa.

## REGLAS DE ORO:
1. SIEMPRE utiliza la información de los fragmentos proporcionados.
2. Si la información no está en los documentos, busca en tus RECUERDOS ADICIONALES abajo.
3. Si la información no está en ninguna parte, di: "Lo siento, la información solicitada no se encuentra en los documentos disponibles ni en mis recuerdos."
4. CITA OBLIGATORIAS para documentos: Usa [Doc N] al final de cada dato relevante.
5. NO copies y pegues directamente; explica y conecta los conceptos de forma profesional.

## CONTEXTO DE DOCUMENTOS:
${context || 'No hay documentos relevantes.'}`;

  if (additionalContext) {
    systemContent += `\n\n## RECUERDOS Y CONTEXTO DEL USUARIO (PRIORIDAD ALTA):\n${additionalContext}`;
  }

  messages.push({
    role: 'system',
    content: systemContent
  });

  // 2. Conversation History
  if (conversationHistory && conversationHistory.length > 0) {
    const historyLimit = genSettings.historyLimit || 5;
    let limitedHistory = conversationHistory.slice(-historyLimit);
    limitedHistory.forEach(msg => {
      messages.push({ role: msg.role, content: msg.content });
    });
  }

  // 3. User Question with emphasis on synthesis
  const finalPrompt = `Pregunta del usuario: "${query}"\n\nInstrucción: Analiza todos los fragmentos proporcionados arriba y redacta una respuesta coherente y detallada que sintetice los puntos clave. Asegúrate de citar las fuentes [Doc N].`;

  messages.push({
    role: 'user',
    content: finalPrompt
  });

  // Generate response
  return await chatEngine.generateText(messages, {
    temperature: temperature,
    maxTokens: maxTokens,
    stop: ['<|im_end|>', '<|end|>', '<|eot_id|>'],
    onStream,
    signal
  });
}

/**
 * Complete RAG flow: query → retrieve → generate
 * MEJORADO: Incluye métricas de calidad y carga completa de settings
 */
export async function completeRAGFlow(
  query: string,
  embeddingEngine: WllamaEngine,
  chatEngine: WebLLMEngine | WllamaEngine,
  topK?: number,
  documentIds?: string[],
  conversationHistory?: Array<{role: string, content: string}>,
  onStream?: (chunk: string) => void,
  options?: {
    useQueryExpansion?: boolean;
    useQueryRewriting?: boolean;
    calculateMetrics?: boolean;
    additionalContext?: string;
    faithfulnessThreshold?: number;
    chunkWindowSize?: number;
    signal?: AbortSignal;
  }
): Promise<{
  answer: string;
  ragResult: RAGResult;
  metrics?: ReturnType<typeof calculateRAGMetrics>;
  quality?: ReturnType<typeof assessRAGQuality>;
  faithfulness?: number;
}> {
  // Load settings from database
  const ragSettings = await getRAGSettings();
  const genSettings = await getGenerationSettings();

  // Auto-enable query rewriting for short queries
  const isShortQuery = query.split(/\s+/).length < 8;
  const shouldRewrite = options?.useQueryRewriting !== false && (options?.useQueryRewriting || isShortQuery);

  // Use effective parameters from settings if not explicitly provided
  const effectiveTopK = topK ?? ragSettings.topK ?? 5;
  const effectiveWindowSize = options?.chunkWindowSize !== undefined 
    ? options.chunkWindowSize 
    : (ragSettings.chunkWindowSize ?? 1);

  const ragResult = await queryWithRAG(
    query,
    embeddingEngine,
    effectiveTopK,
    documentIds,
    chatEngine,
    {
      useQueryExpansion: options?.useQueryExpansion,
      useQueryRewriting: shouldRewrite,
      chunkWindowSize: effectiveWindowSize
    }
  );

  console.log(`📊 Retrieved ${ragResult.chunks.length} chunks (Window: +${effectiveWindowSize}) in ${ragResult.searchTime}ms`);

  // Step 2: Calculate quality metrics (if enabled)
  let metrics, quality;
  if (options?.calculateMetrics !== false) {
    const context = createRAGContext(ragResult.chunks);
    metrics = calculateRAGMetrics(query, ragResult.chunks, context);
    quality = assessRAGQuality(metrics);

    console.log(`✅ [RAG Quality] Overall: ${quality.overall}`);
  }

  // Step 3: Generate answer with conversation history
  const answer = await generateRAGAnswer(query, ragResult, chatEngine, conversationHistory, onStream, options?.additionalContext, options?.signal);

  // Step 4: Calculate answer faithfulness (if metrics enabled)
  let faithfulness;
  if (options?.calculateMetrics !== false) {
    const context = createRAGContext(ragResult.chunks);
    const threshold = options?.faithfulnessThreshold ?? genSettings.faithfulnessThreshold ?? 0.45;
    console.log(`⚖️ [RAG Pipeline] Applying Faithfulness Threshold: ${threshold}`);
    faithfulness = calculateFaithfulness(answer, context, threshold);
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
