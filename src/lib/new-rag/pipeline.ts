import { ARAGIndexer } from './arag-indexer';
import { ARAGAgent } from './arag-agent';
import type { RAGResponse } from './types';

export class AdvancedRAGPipeline {
  private static instance: AdvancedRAGPipeline;
  private indexer = new ARAGIndexer();
  private agent = new ARAGAgent();

  static getInstance() {
    if (!this.instance) this.instance = new AdvancedRAGPipeline();
    return this.instance;
  }

  /**
   * A-RAG Hierarchical Indexing
   */
  async indexDocument(text: string, metadata: any = {}, onProgress?: (progress: number, message: string) => void) {
    return await this.indexer.index(text, metadata, onProgress);
  }

  /**
   * A-RAG Agentic Execution Loop
   */
  async execute(query: string, onProgress?: (step: string, progress: number, message: string) => void): Promise<RAGResponse> {
    if (onProgress) onProgress('research', 10, 'Iniciando investigación agéntica...');
    
    const answer = await this.agent.run(query, (msg) => {
      if (onProgress) onProgress('research', 50, msg);
    });

    if (onProgress) onProgress('completed', 100, 'Investigación concluida.');

    return {
      mode: 'rag',
      context: null, // Context is now managed internally by the agent's history
      answer: answer,
      sources: [] // Sources are tracked in the agent loop
    };
  }
}
