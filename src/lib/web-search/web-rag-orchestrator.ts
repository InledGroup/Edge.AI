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
import { getUseAdvancedRAG, getRAGSettings, getGenerationSettings, getWebSearchSettings } from '../db/settings';
import { semanticChunkText } from '../rag/semantic-chunking';
import { cosineSimilarity, createRAGContext, rerankResults } from '../rag/vector-search';
import { calculateRAGMetrics, assessRAGQuality, calculateFaithfulness } from '../rag/rag-metrics';
import { generateRAGAnswer, processDocument, completeRAGFlow } from '../rag/rag-pipeline';
import { BM25 } from '../rag/bm25';
import { getWorkerPool } from '../workers';
import { createDocument, deleteDocument } from '../db/documents';
import {
  getCachedWebPage,
  cacheWebPage,
  getCachedWebEmbeddings,
  cacheWebEmbeddings,
  cleanupExpiredPages
} from '../db/web-cache';
import { getExtensionBridgeSafe } from '../extension-bridge';

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
   * UNIFICADO: Usa el flujo estándar de documentos
   */
  async search(
    userQuery: string,
    options: WebRAGOptions = {}
  ): Promise<WebRAGResult> {
    // Load latest settings from DB to match UI configuration
    const ragSettings = await getRAGSettings();
    const genSettings = await getGenerationSettings();
    const webSettings = await getWebSearchSettings();

    const {
      sources = webSettings.webSearchSources, 
      maxSearchResults = 10,
      maxUrlsToFetch = webSettings.webSearchMaxUrls || 3,
      topK = ragSettings.topK || 5, 
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
      onProgress?.('query_generation', 10);
      const stepStart = Date.now();

      const searchQuery = await this.generateSearchQuery(userQuery);
      timestamps.queryGeneration = Date.now() - stepStart;

      console.log(`[WebRAG] Generated search query: "${searchQuery}"`);

      // ====================================================================
      // PASO 2: Búsqueda web (navegador)
      // ====================================================================
      onProgress?.('web_search', 20);
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
      onProgress?.('url_selection', 30);
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
        // @ts-ignore - Extra payload for confirmation
        onProgress?.('url_confirmation', 35, 'Confirm', { urls: selectedUrls });
        
        console.log('[WebRAG] Requesting user confirmation for URLs:', selectedUrls);
        const confirmedUrls = await options.onConfirmationRequest(selectedUrls);

        if (!confirmedUrls || confirmedUrls.length === 0) {
           throw new Error('Búsqueda cancelada por el usuario o sin URLs seleccionadas');
        }

        // Actualizar lista de URLs con las confirmadas
        selectedUrls = confirmedUrls;
        console.log(`[WebRAG] User confirmed ${selectedUrls.length} URLs`);
      }

      // ====================================================================
      // PASO 4: Obtener contenido
      // ====================================================================
      onProgress?.('page_fetch', 40);
      const fetchStart = Date.now();

      const hasExtensionContent = selectedResults.some((r: any) => r.metadata?.fullContent);
      let cleanedContents: CleanedContent[] = [];
      let sourcesUsed = 0;

      if (hasExtensionContent) {
        console.log('[WebRAG] Usando contenido pre-extraído de la extensión');
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
      } else {
        const bridge = getExtensionBridgeSafe();
        
        if (!bridge || !bridge.isConnected()) {
          throw new Error('La extensión del navegador no está conectada. Es necesaria para descargar y analizar páginas web sin restricciones.');
        }

        try {
          console.log(`[WebRAG] Extrayendo ${selectedUrls.length} URLs vía extensión...`);
          const response = await bridge.extractUrls(selectedUrls);
          
          if (response.success && response.results && response.results.length > 0) {
            cleanedContents = response.results.map(r => ({
              text: r.content,
              title: r.title || 'Sin título',
              url: r.url,
              extractedAt: Date.now(),
              wordCount: r.wordCount || 0,
            }));
            sourcesUsed = cleanedContents.length;
            timestamps.pageFetch = Date.now() - fetchStart;
            timestamps.contentExtraction = 0; 
            console.log(`[WebRAG] Extracción vía extensión exitosa: ${cleanedContents.length} páginas`);
          } else {
            console.error('[WebRAG] La extensión no devolvió contenido:', response);
            throw new Error('La extensión no pudo extraer el contenido de las páginas seleccionadas.');
          }
        } catch (extError) {
          console.warn('[WebRAG] Error crítico en extracción vía extensión:', extError);
          throw extError instanceof Error ? extError : new Error('Error al intentar extraer contenido con la extensión.');
        }
      }

      if (cleanedContents.length === 0) {
        throw new Error('No se pudo extraer contenido legible de ninguna de las URLs seleccionadas.');
      }

      console.log(`[WebRAG] Listas para RAG: ${cleanedContents.length} páginas extraídas`);

      // ====================================================================
      // PASO 6: Indexar como documentos temporales en DB (NUEVO)
      // ====================================================================
      onProgress?.('chunking', 60);
      const tempDocIds: string[] = [];
      
      for (const content of cleanedContents) {
        try {
          console.log(`[WebRAG] Creando documento temporal para: ${content.title}`);
          const doc = await createDocument({
            name: content.title || 'Página Web',
            type: 'txt',
            content: content.text,
            size: content.text.length,
            metadata: { 
              url: content.url, 
              temporary: true,
              source: 'web_search' 
            }
          });
          
          // Solo lo añadimos si se procesa correctamente
          console.log(`[WebRAG] Generando embeddings para: ${doc.id}`);
          await processDocument(
            doc.id, 
            content.text, 
            this.embeddingEngine, 
            ragSettings.chunkSize || 800,
            (status) => {
              onProgress?.('embedding', 60 + (tempDocIds.length / cleanedContents.length) * 20, `Procesando: ${doc.name}`);
            }
          );
          
          tempDocIds.push(doc.id);
        } catch (docError) {
          console.error(`[WebRAG] Error crítico procesando ${content.url}:`, docError);
        }
      }

      if (tempDocIds.length === 0) {
        throw new Error('Error técnico: Se obtuvo contenido pero falló la indexación en la base de datos local.');
      }

      // ====================================================================
      // PASO 7: Búsqueda y Generación con Pipeline Oficial
      // ====================================================================
      onProgress?.('vector_search', 85);
      
      const result = await completeRAGFlow(
        userQuery,
        this.embeddingEngine,
        this.llmEngine,
        topK,
        tempDocIds, // Filtrar SOLO por las páginas recién descargadas
        options.conversationHistory,
        options.onToken,
        {
          additionalContext: options.additionalContext,
          calculateMetrics: true,
          faithfulnessThreshold: genSettings.faithfulnessThreshold,
          chunkWindowSize: ragSettings.chunkWindowSize
        }
      );

      // ====================================================================
      // PASO 8: Limpieza (Borrar documentos temporales)
      // ====================================================================
      // No bloqueamos la respuesta por la limpieza
      const cleanup = async () => {
        console.log(`[WebRAG] Limpiando ${tempDocIds.length} documentos temporales...`);
        for (const id of tempDocIds) {
          try { await deleteDocument(id); } catch (e) {}
        }
      };
      cleanup();

      onProgress?.('completed', 100);

      return {
        query: userQuery,
        searchQuery,
        searchResults,
        selectedUrls,
        cleanedContents,
        webDocuments: [],
        ragResult: result.ragResult,
        answer: result.answer,
        ragQuality: result.quality?.overall,
        ragMetrics: result.metrics,
        faithfulness: result.faithfulness,
        metadata: {
          totalTime: Date.now() - startTime,
          sourcesUsed: tempDocIds.length,
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

  // ==========================================================================
  // PASO 4: Fetch pages
  // ==========================================================================

  private async fetchPages(urls: string[]): Promise<FetchedPage[]> {
    try {
      // Usar WebSearchWorker (con proxy)
      const workerPool = getWorkerPool();
      const webSearchWorker = await workerPool.getWebSearchWorker();
      
      console.log(`[WebRAG] Fetching ${urls.length} pages via worker (proxy)...`);
      const pages = await webSearchWorker.fetchPages(urls, {
        timeout: 15000, // 15s timeout
        maxSize: 1024 * 1024, // 1MB limit
      });
      
      return pages;
    } catch (error) {
      console.error('[WebRAG] Error fetching pages:', error);
      throw error;
    }
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
    if ('createChatCompletion' in (this.llmEngine as any)) {
      // Convert input to messages if string
      const messages = Array.isArray(input) ? input : [{ role: 'user', content: input }];
      
      if (options.onToken && 'createChatCompletionStream' in (this.llmEngine as any)) {
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
        const response = await (this.llmEngine as any).createChatCompletion(
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
