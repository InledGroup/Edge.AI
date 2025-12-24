// Context Window Manager
// Implements sliding window and context compression to maintain constant latency

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export class ContextWindowManager {
  private maxTokens: number;
  private messages: ChatMessage[] = [];
  private systemPrompt: ChatMessage | null = null;

  constructor(maxTokens = 2048) {
    this.maxTokens = maxTokens;
    console.log(`📝 Context window initialized with ${maxTokens} tokens`);
  }

  /**
   * Estimate tokens in text
   * Heuristic: 1 token ≈ 2.5 characters (works for English/Spanish mix)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 2.5);
  }

  /**
   * Get total tokens in context
   */
  private getTotalTokens(): number {
    let total = 0;

    if (this.systemPrompt) {
      total += this.estimateTokens(this.systemPrompt.content);
    }

    for (const msg of this.messages) {
      total += this.estimateTokens(msg.content);
    }

    return total;
  }

  /**
   * Set system prompt (always preserved)
   */
  setSystemPrompt(content: string): void {
    this.systemPrompt = {
      role: 'system',
      content,
      timestamp: Date.now(),
    };
    console.log(`💬 System prompt set (${this.estimateTokens(content)} tokens)`);
  }

  /**
   * Add message and enforce token limit
   */
  addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.enforceLimit();
  }

  /**
   * Enforce token limit using sliding window
   * Removes oldest messages (except system prompt) until under limit
   */
  private enforceLimit(): void {
    const targetTokens = Math.floor(this.maxTokens * 0.8); // Use 80% to leave room for response
    let totalTokens = this.getTotalTokens();

    if (totalTokens <= targetTokens) {
      return;
    }

    console.log(`⚠️ Context full (${totalTokens}/${this.maxTokens} tokens), trimming...`);

    // Remove oldest messages until under limit
    // Keep at least the last 2 messages (last user + assistant)
    while (totalTokens > targetTokens && this.messages.length > 2) {
      const removed = this.messages.shift()!;
      const removedTokens = this.estimateTokens(removed.content);
      totalTokens -= removedTokens;

      console.log(`🗑️ Removed message (${removedTokens} tokens)`);
    }

    console.log(`✅ Context trimmed to ${totalTokens} tokens`);
  }

  /**
   * Compress old messages using summarization
   * Useful for very long conversations
   */
  async compressOldMessages(summarizeFn: (text: string) => Promise<string>): Promise<void> {
    if (this.messages.length < 10) {
      console.log('ℹ️ Not enough messages to compress (need at least 10)');
      return;
    }

    console.log('🗜️ Compressing old messages...');

    // Take messages 0-5 (oldest, but not most recent)
    const toCompress = this.messages.slice(0, 6);
    const conversation = toCompress
      .map((m) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
      .join('\n');

    try {
      const summary = await summarizeFn(conversation);

      // Replace 6 old messages with 1 summary
      this.messages.splice(0, 6, {
        role: 'system',
        content: `[Resumen de conversación anterior]: ${summary}`,
        timestamp: Date.now(),
      });

      console.log(`✅ Compressed 6 messages into summary (${this.estimateTokens(summary)} tokens)`);
    } catch (error) {
      console.error('❌ Failed to compress messages:', error);
    }
  }

  /**
   * Get all messages (including system prompt)
   */
  getMessages(): ChatMessage[] {
    if (this.systemPrompt) {
      return [this.systemPrompt, ...this.messages];
    }
    return this.messages;
  }

  /**
   * Get messages for prompt (formatted)
   */
  getFormattedContext(): string {
    const messages = this.getMessages();
    return messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
  }

  /**
   * Get context stats
   */
  getStats(): {
    messageCount: number;
    totalTokens: number;
    usagePercent: number;
  } {
    const totalTokens = this.getTotalTokens();
    return {
      messageCount: this.messages.length + (this.systemPrompt ? 1 : 0),
      totalTokens,
      usagePercent: totalTokens / this.maxTokens,
    };
  }

  /**
   * Clear all messages (keep system prompt)
   */
  clear(): void {
    this.messages = [];
    console.log('🗑️ Context cleared');
  }

  /**
   * Reset everything
   */
  reset(): void {
    this.messages = [];
    this.systemPrompt = null;
    console.log('🔄 Context reset');
  }
}
