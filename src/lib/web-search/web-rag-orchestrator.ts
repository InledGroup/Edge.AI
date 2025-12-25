/**
 * Web RAG Orchestrator
 *
 * Orquesta el flujo completo de búsqueda web + RAG en 8 pasos:
 * 1. LLM genera query de búsqueda
 * 2. Navegador busca en web
 * 3. LLM selecciona URLs relevantes
 * 4. Worker descarga páginas
 * 5. Extractor limpia contenido
 * 6. Pipeline RAG procesa (chunking + embeddings)
 * 7. Vector search recupera contexto
 * 8. LLM genera respuesta final
 */

import type {
  WebRAGResult,
  WebRAGOptions,
  SearchResult,
  CleanedContent,
  WebDocument,
  WebDocumentChunk,
  RetrievedWebChunk,
  FetchedPage,
} from './types';
import type { WllamaEngine } from '../ai/wllama-engine';
import type { WebLLMEngine } from '../ai/webllm-engine';
import { WebSearchService } from './web-search';
import { ContentExtractor } from './content-extractor';
import { semanticChunkText } from '../rag/semantic-chunking';
import { getWorkerPool } from '../workers';

/**
 * Remove aiproxy.inled.es from URLs for display
 */
function cleanProxyUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'aiproxy.inled.es') {
      const targetUrl = urlObj.searchParams.get('url');
      return targetUrl ? decodeURIComponent(targetUrl) : url;
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * Motor de LLM (puede ser WebLLM o Wllama)
 */
type LLMEngine = WebLLMEngine | WllamaEngine;

/**
 * Orquestador de búsqueda web + RAG
 */
export class WebRAGOrchestrator {
  private webSearchService: WebSearchService;
  private contentExtractor: ContentExtractor;

  constructor(
    private llmEngine: LLMEngine,
    private embeddingEngine: WllamaEngine,
    webSearchService?: WebSearchService
  ) {
    this.webSearchService = webSearchService || new WebSearchService();
    this.contentExtractor = new ContentExtractor();
  }

  /**
   * Ejecuta búsqueda web + RAG completo
   */
  async search(
    userQuery: string,
    options: WebRAGOptions = {}
  ): Promise<WebRAGResult> {
    const {
      sources = ['wikipedia'],
      maxSearchResults = 10,
      maxUrlsToFetch = 3,
      topK = 5,
      onProgress,
    } = options;

    const startTime = Date.now();
    const timestamps: Record<string, number> = {};

    try {
      // ====================================================================
      // PASO 1: LLM genera query de búsqueda
      // ====================================================================
      onProgress?.('query_generation', 10, 'Generando consulta de búsqueda...');
      const stepStart = Date.now();

      const searchQuery = await this.generateSearchQuery(userQuery);
      timestamps.queryGeneration = Date.now() - stepStart;

      console.log(`[WebRAG] Generated search query: "${searchQuery}"`);

      // ====================================================================
      // PASO 2: Búsqueda web (navegador)
      // ====================================================================
      onProgress?.('web_search', 20, 'Buscando en la web...');
      const searchStart = Date.now();

      const searchResults = await this.webSearchService.search(searchQuery, {
        maxResults: maxSearchResults,
        sources,
      });
      timestamps.webSearch = Date.now() - searchStart;

      console.log(`[WebRAG] Found ${searchResults.length} search results`);

      if (searchResults.length === 0) {
        throw new Error('No se encontraron resultados de búsqueda');
      }

      // ====================================================================
      // PASO 3: LLM selecciona URLs relevantes
      // ====================================================================
      onProgress?.('url_selection', 30, 'Seleccionando fuentes relevantes...');
      const selectionStart = Date.now();

      const selectedIndices = await this.selectRelevantResults(
        userQuery,
        searchResults,
        maxUrlsToFetch
      );
      timestamps.urlSelection = Date.now() - selectionStart;

      const selectedUrls = selectedIndices.map((i) => searchResults[i].url);
      console.log(`[WebRAG] Selected ${selectedUrls.length} URLs to fetch`);

      // ====================================================================
      // PASO 4: Fetch controlado (worker)
      // ====================================================================
      onProgress?.(
        'page_fetch',
        40,
        `Descargando ${selectedUrls.length} páginas...`
      );
      const fetchStart = Date.now();

      const fetchedPages = await this.fetchPages(selectedUrls);
      timestamps.pageFetch = Date.now() - fetchStart;

      console.log(`[WebRAG] Successfully fetched ${fetchedPages.length} pages`);

      if (fetchedPages.length === 0) {
        throw new Error('No se pudo descargar ninguna página');
      }

      // ====================================================================
      // PASO 5: Limpieza de contenido
      // ====================================================================
      onProgress?.('content_extraction', 50, 'Extrayendo contenido limpio...');
      const extractionStart = Date.now();

      const cleanedContents = fetchedPages.map((page) =>
        this.contentExtractor.extract(page.html, page.url, {
          maxWords: 500 // Limitar a 500 palabras por página (~2000 chars)
        })
      );
      timestamps.contentExtraction = Date.now() - extractionStart;

      console.log(
        `[WebRAG] Extracted content from ${cleanedContents.length} pages`
      );

      // ====================================================================
      // PASO 6: Chunking + embeddings (RAG pipeline)
      // ====================================================================
      onProgress?.('chunking', 60, 'Procesando documentos web...');
      const chunkingStart = Date.now();

      const webDocuments = await this.processWebDocuments(
        cleanedContents,
        searchQuery,
        (progress) => {
          onProgress?.('embedding', 60 + progress * 0.2, 'Generando embeddings...');
        }
      );
      timestamps.chunking = Date.now() - chunkingStart;
      timestamps.embedding = timestamps.chunking; // Incluido en chunking

      const totalChunks = webDocuments.reduce((sum, doc) => sum + doc.chunks.length, 0);
      console.log(
        `[WebRAG] Processed ${webDocuments.length} web documents (${totalChunks} chunks)`
      );

      // ====================================================================
      // PASO 7: Vector search
      // ====================================================================
      onProgress?.('vector_search', 80, 'Buscando fragmentos relevantes...');
      const searchVectorStart = Date.now();

      const queryEmbedding = await this.embeddingEngine.generateEmbedding(userQuery);
      const retrievedChunks = await this.searchWebDocuments(
        queryEmbedding,
        webDocuments,
        topK
      );
      timestamps.vectorSearch = Date.now() - searchVectorStart;

      console.log(`[WebRAG] Retrieved ${retrievedChunks.length} relevant chunks`);

      // ====================================================================
      // PASO 8: Generación de respuesta
      // ====================================================================
      onProgress?.('answer_generation', 90, 'Generando respuesta...');
      const answerStart = Date.now();

      const answer = await this.generateAnswer(userQuery, retrievedChunks);
      timestamps.answerGeneration = Date.now() - answerStart;

      console.log(`[WebRAG] Generated answer (${answer.length} characters)`);

      // ====================================================================
      // Resultado final
      // ====================================================================
      const totalTime = Date.now() - startTime;

      onProgress?.('completed', 100, 'Búsqueda completada');

      return {
        query: userQuery,
        searchQuery,
        searchResults,
        selectedUrls,
        cleanedContents,
        webDocuments,
        ragResult: {
          chunks: retrievedChunks,
          totalSearched: totalChunks,
          searchTime: timestamps.vectorSearch,
        },
        answer,
        metadata: {
          totalTime,
          sourcesUsed: fetchedPages.length,
          timestamps: timestamps as any,
        },
      };
    } catch (error) {
      onProgress?.('error', 0, error instanceof Error ? error.message : 'Error desconocido');
      throw error;
    }
  }

  // ==========================================================================
  // PASO 1: Generar query de búsqueda
  // ==========================================================================

  private async generateSearchQuery(userQuery: string): Promise<string> {
    const prompt = `Eres un asistente experto en crear consultas de búsqueda web efectivas.

Tu tarea es convertir la pregunta del usuario en una consulta de búsqueda corta y precisa que maximice la probabilidad de encontrar información relevante.

Reglas:
- Máximo 5-7 palabras clave
- Elimina palabras de relleno ("cómo", "qué", "cuál", etc.)
- Incluye el año actual (2025) si la pregunta requiere información reciente
- Usa inglés para contenido técnico, español para contenido general
- NO agregues comillas ni operadores especiales

Pregunta del usuario: ${userQuery}

Responde SOLO con la consulta de búsqueda, sin explicaciones.

Consulta de búsqueda:`;

    const response = await this.generateText(prompt, {
      temperature: 0.3,
      max_tokens: 50,
    });

    // Limpiar y normalizar
    return response.trim().replace(/["']/g, '').slice(0, 100);
  }

  // ==========================================================================
  // PASO 3: Seleccionar URLs relevantes
  // ==========================================================================

  private async selectRelevantResults(
    userQuery: string,
    results: SearchResult[],
    maxUrls: number
  ): Promise<number[]> {
    // Formatear resultados para el LLM
    const resultsText = results
      .map((r, i) => `[${i}] ${r.title}\n    ${r.snippet}`)
      .join('\n\n');

    const prompt = `Eres un asistente que selecciona las fuentes web más relevantes para responder una pregunta.

Pregunta del usuario: ${userQuery}

Resultados de búsqueda disponibles:
${resultsText}

Selecciona los ${Math.min(maxUrls, results.length)} resultados MÁS relevantes que ayudarían a responder la pregunta. Prioriza fuentes que:
- Sean directamente relevantes a la pregunta
- Tengan información actualizada
- Sean fuentes confiables

Responde SOLO con un JSON en este formato exacto:
{"indices": [0, 2, 5]}

JSON:`;

    const response = await this.generateText(prompt, {
      temperature: 0.1,
      max_tokens: 100,
    });

    // Extraer JSON de la respuesta
    try {
      const jsonMatch = response.match(/\{[^}]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const indices = (parsed.indices || []) as number[];

      // Validar y limitar índices
      const validIndices = indices
        .filter((i) => i >= 0 && i < results.length)
        .slice(0, maxUrls);

      // Si no hay índices válidos, usar los primeros resultados
      if (validIndices.length === 0) {
        return Array.from({ length: Math.min(maxUrls, results.length) }, (_, i) => i);
      }

      return validIndices;
    } catch (error) {
      console.warn('[WebRAG] Failed to parse LLM selection, using first results', error);
      // Fallback: usar primeros resultados
      return Array.from({ length: Math.min(maxUrls, results.length) }, (_, i) => i);
    }
  }

  // ==========================================================================
  // PASO 4: Fetch páginas
  // ==========================================================================

  private async fetchPages(urls: string[]): Promise<FetchedPage[]> {
    const workerPool = getWorkerPool();
    const webSearchWorker = await workerPool.getWebSearchWorker();

    const pages = await webSearchWorker.fetchPages(urls, {
      maxSize: 500 * 1024, // 500KB
      timeout: 10000, // 10s
    });

    return pages as FetchedPage[];
  }

  // ==========================================================================
  // PASO 6: Procesar documentos web (chunking + embeddings)
  // ==========================================================================

  private async processWebDocuments(
    contents: CleanedContent[],
    searchQuery: string,
    onProgress?: (progress: number) => void
  ): Promise<WebDocument[]> {
    const documents: WebDocument[] = [];

    for (let i = 0; i < contents.length; i++) {
      const content = contents[i];

      // Chunking semántico con chunks MÁS PEQUEÑOS para web
      // (el contenido web suele ser más denso que PDFs)
      const chunks = await semanticChunkText(content.text, {
        maxChunkSize: 400, // Reducido de 800 a 400 caracteres
        overlapSize: 50,   // Reducido de 100 a 50
      });

      // Generar embeddings
      const texts = chunks.map((c) => c.content);
      const embeddings = await this.embeddingEngine.generateEmbeddingsBatch(
        texts,
        4 // maxConcurrent
      );

      // Crear chunks con embeddings
      const webChunks: WebDocumentChunk[] = chunks.map((chunk, j) => ({
        content: chunk.content,
        index: chunk.index,
        embedding: new Float32Array(embeddings[j]),
        metadata: {
          startChar: chunk.metadata.startChar,
          endChar: chunk.metadata.endChar,
          type: chunk.metadata.type as any,
          prevContext: chunk.metadata.prevContext,
          nextContext: chunk.metadata.nextContext,
        },
      }));

      // Crear documento web temporal
      const webDoc: WebDocument = {
        id: `web-${Date.now()}-${i}`,
        type: 'web',
        url: content.url,
        title: content.title,
        content: content.text,
        chunks: webChunks,
        temporary: true,
        fetchedAt: content.extractedAt,
        ttl: 3600000, // 1 hora
        metadata: {
          source: 'wikipedia' as const, // TODO: obtener del SearchResult
          searchQuery,
          originalSize: content.text.length,
          fetchTime: 0, // TODO: pasar desde FetchedPage
        },
      };

      documents.push(webDoc);

      // Reportar progreso
      onProgress?.(((i + 1) / contents.length) * 100);
    }

    return documents;
  }

  // ==========================================================================
  // PASO 7: Buscar en documentos web
  // ==========================================================================

  private async searchWebDocuments(
    queryEmbedding: Float32Array,
    webDocuments: WebDocument[],
    topK: number
  ): Promise<RetrievedWebChunk[]> {
    // Recopilar todos los chunks con sus embeddings
    const allChunks: Array<{
      chunk: WebDocumentChunk;
      document: WebDocument;
    }> = [];

    webDocuments.forEach((doc) => {
      doc.chunks.forEach((chunk) => {
        allChunks.push({ chunk, document: doc });
      });
    });

    // Calcular similitud con cada chunk
    const similarities = allChunks.map(({ chunk }) => {
      const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      return similarity;
    });

    // Ordenar por similitud y tomar top-K
    const indices = Array.from({ length: allChunks.length }, (_, i) => i);
    indices.sort((a, b) => similarities[b] - similarities[a]);

    const topIndices = indices.slice(0, topK);

    // Crear RetrievedWebChunk[]
    const retrieved: RetrievedWebChunk[] = topIndices.map((i) => {
      const { chunk, document } = allChunks[i];
      return {
        content: chunk.content,
        score: similarities[i],
        document: {
          id: document.id,
          title: document.title,
          url: document.url,
          type: 'web',
        },
        metadata: chunk.metadata,
      };
    });

    return retrieved;
  }

  /**
   * Calcula similitud coseno entre dos vectores
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ==========================================================================
  // PASO 8: Generar respuesta final
  // ==========================================================================

  private async generateAnswer(
    query: string,
    chunks: RetrievedWebChunk[]
  ): Promise<string> {
    // Formatear contexto RAG
    const context = chunks
      .map((chunk, i) => {
        const score = (chunk.score * 100).toFixed(1);
        const cleanUrl = cleanProxyUrl(chunk.document.url);
        return `[Fuente ${i + 1}: ${chunk.document.title} (${score}% relevancia)]
URL: ${cleanUrl}

${chunk.content}`;
      })
      .join('\n\n---\n\n');

    // Prompt para respuesta final
    const prompt = `Eres un asistente útil que responde preguntas usando información obtenida de la web.

CONTEXTO DE FUENTES WEB:
${context}

PREGUNTA DEL USUARIO: ${query}

Instrucciones:
- Responde SOLO usando la información del contexto proporcionado
- Si el contexto no contiene información suficiente, indícalo claramente
- Cita las fuentes mencionando el título o número de fuente
- Sé conciso y preciso
- NO inventes información que no esté en el contexto

RESPUESTA:`;

    const answer = await this.generateText(prompt, {
      temperature: 0.7,
      max_tokens: 512,
    });

    return answer.trim();
  }

  // ==========================================================================
  // UTILIDADES
  // ==========================================================================

  /**
   * Genera texto con el motor LLM (abstrae WebLLM y Wllama)
   */
  private async generateText(
    prompt: string,
    options: { temperature: number; max_tokens: number }
  ): Promise<string> {
    // WebLLM
    if ('generateText' in this.llmEngine) {
      return await this.llmEngine.generateText(prompt, {
        ...options,
        stream: false,
      });
    }

    // Wllama (chat API)
    if ('createChatCompletion' in this.llmEngine) {
      const response = await this.llmEngine.createChatCompletion(
        [{ role: 'user', content: prompt }],
        {
          temperature: options.temperature,
          max_tokens: options.max_tokens,
        }
      );
      return response;
    }

    throw new Error('LLM engine does not support text generation');
  }
}
