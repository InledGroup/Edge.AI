import { RAGModelLoader } from './model-loader';

export class CompressionService {
  /**
   * Recomp (Abstractive Compression)
   * Summarizes the retrieved context to remove redundancy and fit token limits.
   * This implementation focuses on extracting the answer-relevant parts using an Instruct Model.
   */
  static async compress(context: string, query: string): Promise<string> {
    const loader = RAGModelLoader.getInstance();
    const generator = await loader.getGenerator();

    // Prompt engineered for abstractive compression (Recomp style)
    const prompt = `Task: Compress the following context to retain only information relevant to the query. Remove redundancies.
Query: ${query}
Context: ${context}
Compressed Summary:`;

    try {
      const result = await generator(prompt, {
        max_new_tokens: 512, // Allow sufficient length for the answer context
        temperature: 0.2, // Low temperature for factual consistency
        repetition_penalty: 1.2,
      });

      return result[0].generated_text.trim();
    } catch (error) {
      console.error('Compression failed:', error);
      // Fallback: Return original context truncated
      return context.substring(0, 3000); 
    }
  }
}
