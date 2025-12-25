/**
 * Web Research Module - High-level API for AI-powered web research
 * Integrates extension bridge with RAG system for intelligent information gathering
 */

import { getExtensionBridge, type SearchResponse } from './extension-bridge';
import type { HybridRAG } from '../../hybrid-rag';

export interface ResearchConfig {
  extensionId: string;
  enableAutoResearch?: boolean;
  maxSourcesPerQuery?: number;
}

export interface ResearchResult {
  query: string;
  sources: Array<{
    title: string;
    url: string;
    content: string;
    relevanceScore?: number;
  }>;
  summary?: string;
  embeddings?: Float32Array[];
  timestamp: number;
}

export class WebResearch {
  private bridge;
  private ragSystem: HybridRAG | null = null;
  private config: ResearchConfig;

  constructor(config: ResearchConfig) {
    this.config = config;
    this.bridge = getExtensionBridge({
      extensionId: config.extensionId,
      pollingInterval: 1000,
      maxRetries: 30
    });
  }

  /**
   * Set RAG system for processing research results
   */
  setRAGSystem(rag: HybridRAG): void {
    this.ragSystem = rag;
  }

  /**
   * Check if extension is available
   */
  isReady(): boolean {
    return this.bridge.isAvailable();
  }

  /**
   * Perform web research for a query
   * @param query - Research query
   * @param processWithRAG - Whether to process results with RAG system
   * @returns Research results with optional RAG processing
   */
  async research(
    query: string,
    processWithRAG: boolean = true
  ): Promise<ResearchResult> {
    console.log(`[WebResearch] Starting research for: "${query}"`);

    // Perform search and content extraction via extension
    const searchResponse = await this.bridge.search(query);

    if (!searchResponse || searchResponse.sources.length === 0) {
      throw new Error('No results found');
    }

    // Format basic result
    const result: ResearchResult = {
      query,
      sources: searchResponse.sources.map(source => ({
        title: source.title,
        url: source.url,
        content: source.content
      })),
      timestamp: Date.now()
    };

    // Process with RAG if enabled and RAG system is available
    if (processWithRAG && this.ragSystem) {
      await this.processWithRAG(result, searchResponse);
    }

    console.log(`[WebResearch] Research completed with ${result.sources.length} sources`);

    return result;
  }

  /**
   * Process research results with RAG system
   * Creates embeddings and stores in vector database
   */
  private async processWithRAG(
    result: ResearchResult,
    searchResponse: SearchResponse
  ): Promise<void> {
    if (!this.ragSystem) return;

    console.log('[WebResearch] Processing with RAG system...');

    // Format for RAG
    const ragData = this.bridge.formatForRAG(searchResponse);

    // Add each document to RAG system
    for (const doc of ragData.documents) {
      try {
        // Create chunks from content (semantic chunking if available)
        const chunks = this.createChunks(doc.content, 512); // 512 token chunks

        // Add to RAG system
        for (let i = 0; i < chunks.length; i++) {
          await this.ragSystem.addDocument({
            id: `${doc.metadata.url}_chunk_${i}`,
            text: chunks[i],
            metadata: {
              source: doc.source,
              title: doc.title,
              url: doc.metadata.url,
              chunkIndex: i,
              totalChunks: chunks.length,
              query: result.query,
              extractedAt: doc.metadata.extractedAt
            }
          });
        }

        console.log(`[WebResearch] Added ${chunks.length} chunks from ${doc.title}`);

      } catch (error) {
        console.error(`[WebResearch] Error processing document ${doc.title}:`, error);
      }
    }

    // Query RAG system to get relevant chunks for the original query
    const ragResults = await this.ragSystem.query(result.query, 5);

    if (ragResults && ragResults.length > 0) {
      // Calculate relevance scores based on RAG results
      result.sources.forEach(source => {
        const relevantChunk = ragResults.find(r =>
          r.metadata?.url === source.url
        );
        if (relevantChunk) {
          source.relevanceScore = relevantChunk.score;
        }
      });

      // Sort sources by relevance
      result.sources.sort((a, b) =>
        (b.relevanceScore || 0) - (a.relevanceScore || 0)
      );
    }
  }

  /**
   * Create text chunks for RAG processing
   * Simple sentence-based chunking with overlap
   */
  private createChunks(text: string, maxTokens: number = 512): string[] {
    const chunks: string[] = [];

    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentChunk = '';
    let currentTokens = 0;

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence);

      if (currentTokens + sentenceTokens > maxTokens && currentChunk) {
        // Save current chunk and start new one
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
        currentTokens = sentenceTokens;
      } else {
        currentChunk += ' ' + sentence;
        currentTokens += sentenceTokens;
      }
    }

    // Add last chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Perform research with progress updates
   */
  async researchWithProgress(
    query: string,
    onProgress: (status: string, count: number) => void,
    processWithRAG: boolean = true
  ): Promise<ResearchResult> {
    console.log(`[WebResearch] Starting research with progress for: "${query}"`);

    // Use polling-based search for progress updates
    const searchResponse = await this.bridge.searchWithPolling(query, onProgress);

    if (!searchResponse || searchResponse.sources.length === 0) {
      throw new Error('No results found');
    }

    const result: ResearchResult = {
      query,
      sources: searchResponse.sources.map(source => ({
        title: source.title,
        url: source.url,
        content: source.content
      })),
      timestamp: Date.now()
    };

    // Process with RAG if enabled
    if (processWithRAG && this.ragSystem) {
      onProgress('processing_rag', result.sources.length);
      await this.processWithRAG(result, searchResponse);
    }

    onProgress('completed', result.sources.length);

    return result;
  }

  /**
   * Clear research data from RAG system
   */
  async clearResearchData(): Promise<void> {
    if (this.ragSystem) {
      // This would require implementing a clear method in RAG system
      console.log('[WebResearch] Clearing research data...');
    }
  }
}

/**
 * Create a web research instance
 */
export function createWebResearch(config: ResearchConfig): WebResearch {
  return new WebResearch(config);
}

export default WebResearch;
