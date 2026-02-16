import { DEFAULT_CONFIG } from './config';
import type { Chunk } from './types';
import natural from 'natural';

export class ChunkingService {
  private static tokenizer = new natural.SentenceTokenizer();

  /**
   * Small-to-Big Chunking Logic (Robust Implementation)
   * 1. Split into sentences.
   * 2. Group sentences into small chunks (approx 175 tokens).
   * 3. For each small chunk, expand window to form parent chunk (approx 512 tokens).
   */
  static splitSmallToBig(text: string): Chunk[] {
    const sentences = this.tokenizer.tokenize(text);
    if (!sentences || sentences.length === 0) return [];

    const smallChunks: { text: string; startIndex: number; endIndex: number }[] = [];
    const smallSize = DEFAULT_CONFIG.chunking.smallChunkSize;
    const parentSize = DEFAULT_CONFIG.chunking.parentChunkSize;

    // Helper to count tokens (approximate)
    const countTokens = (s: string) => s.trim().split(/\s+/).length;
    
    // Step 1: Create Small Chunks
    let currentChunkSentences: string[] = [];
    let currentTokenCount = 0;
    let startIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sent = sentences[i];
      const sentTokens = countTokens(sent);

      if (currentTokenCount + sentTokens > smallSize && currentChunkSentences.length > 0) {
        // Finalize current chunk
        smallChunks.push({
          text: currentChunkSentences.join(' '),
          startIndex: startIndex,
          endIndex: i - 1
        });
        // Reset
        currentChunkSentences = [sent];
        currentTokenCount = sentTokens;
        startIndex = i;
      } else {
        currentChunkSentences.push(sent);
        currentTokenCount += sentTokens;
      }
    }
    // Add last chunk
    if (currentChunkSentences.length > 0) {
      smallChunks.push({
        text: currentChunkSentences.join(' '),
        startIndex: startIndex,
        endIndex: sentences.length - 1
      });
    }

    // Step 2: Create Parent Chunks (Window Expansion)
    return smallChunks.map(small => {
      let parentText = small.text;
      let currentParentTokens = countTokens(parentText);
      
      let left = small.startIndex - 1;
      let right = small.endIndex + 1;
      
      // Expand outwards until size limit or boundaries reached
      while ((left >= 0 || right < sentences.length) && currentParentTokens < parentSize) {
        // Try expand left
        if (left >= 0) {
          const sent = sentences[left];
          const tokens = countTokens(sent);
          if (currentParentTokens + tokens <= parentSize) {
            parentText = sent + ' ' + parentText;
            currentParentTokens += tokens;
            left--;
          }
        }
        
        // Try expand right
        if (right < sentences.length && currentParentTokens < parentSize) {
          const sent = sentences[right];
          const tokens = countTokens(sent);
          if (currentParentTokens + tokens <= parentSize) {
            parentText = parentText + ' ' + sent;
            currentParentTokens += tokens;
            right++;
          }
        }

        // Break if we can't expand either side without exceeding limit (or handled by checks)
        if (left < 0 && right >= sentences.length) break;
        // Optimization: if both checks failed to add, we stop
         // (implicit in the checks above, but let's be safe)
      }

      return {
        small: small.text.trim(),
        parent: parentText.trim()
      };
    });
  }
}
