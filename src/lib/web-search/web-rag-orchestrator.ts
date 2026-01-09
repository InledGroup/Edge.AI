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
import {
  getCachedWebPage,
  cacheWebPage,
  getCachedWebEmbeddings,
  cacheWebEmbeddings,
  cleanupExpiredPages
} from '../db/web-cache';

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
    webSearchService: WebSearchService
  ) {
    this.webSearchService = webSearchService;
    this.contentExtractor = new ContentExtractor();
  }

  /**
   * Create and initialize a WebRAGOrchestrator with extension support
   */
  static async create(
    llmEngine: LLMEngine,
    embeddingEngine: WllamaEngine
  ): Promise<WebRAGOrchestrator> {
    const { initializeWebSearch } = await import('./index');
    const webSearchService = await initializeWebSearch();
    console.log('[WebRAG] ✅ Initialized with extension support');
    return new WebRAGOrchestrator(llmEngine, embeddingEngine, webSearchService);
  }

  /**
   * Ejecuta búsqueda web + RAG completo
   * MEJORADO: Con caché de páginas y embeddings
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
      // Cleanup expired cache entries (async, don't wait)
      cleanupExpiredPages().catch(err =>
        console.warn('Failed to cleanup web cache:', err)
      );
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

      const selectedResults = selectedIndices.map((i) => searchResults[i]);
      let selectedUrls = selectedResults.map((r) => r.url);
      console.log(`[WebRAG] Selected ${selectedResults.length} URLs to fetch`);

      // ====================================================================
      // PASO 3.5: Confirmación de usuario (si está habilitada)
      // ====================================================================
      if (options.confirmUrls && options.onConfirmationRequest) {
        onProgress?.('url_confirmation', 35, 'Esperando confirmación de usuario...', { urls: selectedUrls });
        
        console.log('[WebRAG] Requesting user confirmation for URLs:', selectedUrls);
        const confirmedUrls = await options.onConfirmationRequest(selectedUrls);

        if (!confirmedUrls || confirmedUrls.length === 0) {
           throw new Error('Búsqueda cancelada por el usuario o sin URLs seleccionadas');
        }

        // Actualizar lista de URLs con las confirmadas
        selectedUrls = confirmedUrls;
        
        // Filtrar selectedResults para mantener consistencia (opcional, pero bueno para logs)
        // Nota: selectedResults ya no coincidirá exactamente si el usuario editó la lista, 
        // pero usaremos selectedUrls para el fetch.
        console.log(`[WebRAG] User confirmed ${selectedUrls.length} URLs`);
      }

      // ====================================================================
      // PASO 4: Obtener contenido (ya sea desde extensión o fetching)
      // ====================================================================
      onProgress?.(
        'page_fetch',
        40,
        `Obteniendo contenido de ${selectedResults.length} páginas...`
      );
      const fetchStart = Date.now();

      // Check if we have content from extension (fullContent in metadata)
      const hasExtensionContent = selectedResults.some(
        (r: any) => r.metadata?.fullContent
      );

      let cleanedContents: CleanedContent[];
      let sourcesUsed = 0;

      if (hasExtensionContent) {
        // Use content already extracted by extension
        console.log(`[WebRAG] Using content extracted by browser extension`);
        cleanedContents = selectedResults
          .filter((r: any) => r.metadata?.fullContent)
          .map((r: any) => ({
            text: r.metadata.fullContent,
            title: r.title,
            url: r.url,
            extractedAt: r.fetchedAt || Date.now(),
            wordCount: r.metadata.wordCount || 0,
          }));
        timestamps.pageFetch = Date.now() - fetchStart;
        sourcesUsed = cleanedContents.length;
        console.log(`[WebRAG] Using ${cleanedContents.length} pre-extracted pages from extension`);
      } else {
        // Fallback to traditional fetch + extraction
        const fetchedPages = await this.fetchPages(selectedUrls);
        timestamps.pageFetch = Date.now() - fetchStart;

        console.log(`[WebRAG] Successfully fetched ${fetchedPages.length} pages`);

        if (fetchedPages.length === 0) {
          throw new Error('No se pudo descargar ninguna página');
        }

        sourcesUsed = fetchedPages.length;

        // ====================================================================
        // PASO 5: Limpieza de contenido
        // ====================================================================
        onProgress?.('content_extraction', 50, 'Extrayendo contenido limpio...');
        const extractionStart = Date.now();

        cleanedContents = fetchedPages.map((page) =>
          this.contentExtractor.extract(page.html, page.url, {
            maxWords: 2000 // Aumentado a 2000 palabras (~8000 chars) para capturar más contexto
          })
        );
        timestamps.contentExtraction = Date.now() - extractionStart;
      }

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

      const answer = await this.generateAnswer(userQuery, retrievedChunks, options.onToken);
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
          sourcesUsed,
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
    const messages = [
      {
        role: 'system',
        content: `Eres un asistente experto en crear consultas de búsqueda web efectivas.
Tu tarea es convertir la pregunta del usuario en una consulta de búsqueda corta y precisa que maximice la probabilidad de encontrar información relevante.

Reglas:
- Máximo 5-7 palabras clave
- Elimina palabras de relleno ("cómo", "qué", "cuál", etc.)
- Incluye el año actual (2025) si la pregunta requiere información reciente
- Usa inglés para contenido técnico, español para contenido general
- NO agregues comillas ni operadores especiales

Responde SOLO con la consulta de búsqueda, sin explicaciones.`
      },
      {
        role: 'user',
        content: `Pregunta del usuario: ${userQuery}\n\nConsulta de búsqueda:`
      }
    ];

    const response = await this.generateText(messages, {
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

    const messages = [
      {
        role: 'system',
        content: `Eres un asistente que selecciona las fuentes web más relevantes para responder una pregunta.
Selecciona los ${Math.min(maxUrls, results.length)} resultados MÁS relevantes que ayudarían a responder la pregunta. Prioriza fuentes que:
- Sean directamente relevantes a la pregunta
- Tengan información actualizada
- Sean fuentes confiables

Responde SOLO con un JSON en este formato exacto:
{"indices": [0, 2, 5]}`
      },
      {
        role: 'user',
        content: `Pregunta del usuario: ${userQuery}\n\nResultados de búsqueda disponibles:\n${resultsText}\n\nJSON:`
      }
    ];

    const response = await this.generateText(messages, {
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

  // ... (PASO 4 to 7 omitted as they don't generate text) ...

  // ==========================================================================
  // PASO 8: Generar respuesta final
  // ==========================================================================

  private async generateAnswer(
    query: string,
    chunks: RetrievedWebChunk[],
    onToken?: (token: string) => void
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

    const messages = [
      {
        role: 'system',
        content: `Eres un asistente experto que sintetiza información de múltiples fuentes web para proporcionar respuestas completas y precisas.

CONTEXTO DE FUENTES WEB:
${context}

INSTRUCCIONES:
- Analiza y sintetiza la información de TODAS las fuentes proporcionadas
- Combina información complementaria de diferentes fuentes cuando sea relevante
- Cita las fuentes usando su número (ej: "Según la Fuente 1...")
- Prioriza información de fuentes con mayor relevancia (%)
- Si encuentras información contradictoria entre fuentes, menciónalo
- Haz inferencias razonables basándote en la información disponible
- Proporciona una respuesta completa y bien estructurada
- Solo indica falta de información si NINGUNA fuente contiene datos relacionados`
      },
      {
        role: 'user',
        content: `PREGUNTA DEL USUARIO: ${query}`
      }
    ];

    const answer = await this.generateText(messages, {
      temperature: 0.7,
      max_tokens: 1024, // Aumentado de 512 a 1024 para respuestas más completas
      stop: ['<|im_end|>', '<|end|>', '<|eot_id|>'],
      onToken, // Pass streaming callback
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
    input: string | { role: string; content: string }[],
    options: { temperature: number; max_tokens: number; stop?: string[]; onToken?: (token: string) => void }
  ): Promise<string> {
    // WebLLM with streaming support
    if ('generateText' in this.llmEngine) {
      if (options.onToken) {
        // Stream mode - WebLLM uses 'onStream' parameter
        return await this.llmEngine.generateText(input, {
          temperature: options.temperature,
          maxTokens: options.max_tokens,
          stop: options.stop,
          onStream: options.onToken, // Map onToken to onStream for WebLLM
        });
      } else {
        // Non-stream mode
        return await this.llmEngine.generateText(input, {
          temperature: options.temperature,
          maxTokens: options.max_tokens,
          stop: options.stop,
        });
      }
    }

    // Wllama (chat API) - legacy support check
    // Since we updated WllamaEngine to have generateText matching WebLLMEngine signature,
    // this branch might be redundant if WllamaEngine also has generateText.
    // However, keeping it safe if llmEngine is typed strictly.
    // BUT wait, WllamaEngine has generateText now. The type definition LLMEngine union should cover it.
    
    // Fallback for any other engine type or if WllamaEngine uses different interface in types
    if ('createChatCompletion' in this.llmEngine) {
      // Convert input to messages if string
      const messages = Array.isArray(input) ? input : [{ role: 'user', content: input }];
      
      if (options.onToken && 'createChatCompletionStream' in this.llmEngine) {
        // Stream mode for Wllama raw
        return await (this.llmEngine as any).createChatCompletionStream(
          messages,
          {
            temperature: options.temperature,
            max_tokens: options.max_tokens,
            stop: options.stop,
          },
          options.onToken
        );
      } else {
        // Non-stream mode
        const response = await this.llmEngine.createChatCompletion(
          messages,
          {
            temperature: options.temperature,
            max_tokens: options.max_tokens,
            stop: options.stop,
          }
        );
        return response; // Assuming it returns string content
      }
    }

    throw new Error('LLM engine does not support text generation');
  }
}
