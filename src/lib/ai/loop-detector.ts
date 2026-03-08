/**
 * LoopDetector - Detects repetitive patterns in generated text
 * Useful for catching LLM "infinite loops" and stopping them early.
 */

export class LoopDetector {
  private buffer: string = '';
  private readonly minPatternLength: number;
  private readonly maxWindowSize: number;
  private readonly repetitionThreshold: number;

  /**
   * @param minPatternLength Minimum length of a string to be considered a pattern
   * @param maxWindowSize Maximum history to keep for analysis
   * @param repetitionThreshold How many times a pattern must repeat to trigger detection
   */
  constructor(
    minPatternLength: number = 15,
    maxWindowSize: number = 500,
    repetitionThreshold: number = 3
  ) {
    this.minPatternLength = minPatternLength;
    this.maxWindowSize = maxWindowSize;
    this.repetitionThreshold = repetitionThreshold;
  }

  /**
   * Adds a new chunk of text and checks for loops
   * @returns true if a loop is detected, false otherwise
   */
  detect(chunk: string): boolean {
    this.buffer += chunk;
    
    // Maintain window size
    if (this.buffer.length > this.maxWindowSize) {
      this.buffer = this.buffer.substring(this.buffer.length - this.maxWindowSize);
    }

    if (this.buffer.length < this.minPatternLength * this.repetitionThreshold) {
      return false;
    }

    // Heuristic 1: Check for identical consecutive substrings
    // We look for patterns of varying lengths
    for (let len = this.minPatternLength; len <= Math.floor(this.buffer.length / this.repetitionThreshold); len++) {
      const lastPattern = this.buffer.substring(this.buffer.length - len);
      
      let count = 1;
      let pos = this.buffer.length - (len * 2);
      
      while (pos >= 0) {
        const prevPattern = this.buffer.substring(pos, pos + len);
        if (prevPattern === lastPattern) {
          count++;
          pos -= len;
          if (count >= this.repetitionThreshold) {
            console.warn('🔄 Loop detected! Pattern:', lastPattern);
            return true;
          }
        } else {
          break;
        }
      }
    }

    // Heuristic 2: Character frequency check (for "aaaaa...")
    if (this.buffer.length > 50) {
      const lastChar = this.buffer[this.buffer.length - 1];
      let charRepeat = 0;
      for (let i = this.buffer.length - 1; i >= this.buffer.length - 30; i--) {
        if (this.buffer[i] === lastChar) charRepeat++;
        else break;
      }
      if (charRepeat >= 25) return true;
    }

    return false;
  }

  reset() {
    this.buffer = '';
  }
}
