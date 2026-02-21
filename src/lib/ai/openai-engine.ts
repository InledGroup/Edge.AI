// OpenAI-compatible Engine - For connecting to remote inference providers
// Supports Ollama, LM Studio, OpenAI, etc.

import { getSetting } from '../db/settings';
import { getExtensionBridge } from '../extension-bridge';

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  tools?: any[];
  tool_choice?: any;
  onStream?: (chunk: string) => void;
  onAudio?: (audio: Float32Array | Uint8Array) => void;
}

export interface ProgressCallback {
  (progress: number, status: string): void;
}

/**
 * OpenAI Engine for remote AI inference
 */
export class OpenAIEngine {
  private modelName: string = '';
  private apiUrl: string = '';
  private apiKey: string = '';
  private isInitialized: boolean = false;

  constructor() {
    console.log('🌐 OpenAI Engine created');
  }

  async initialize(modelName: string, onProgress?: ProgressCallback): Promise<void> {
    try {
      this.apiUrl = await getSetting('outboundApiUrl') || 'http://localhost:11434/v1';
      this.apiKey = await getSetting('outboundApiKey') || '';
      this.modelName = modelName || await getSetting('outboundModelId') || 'llama3.2';
      
      onProgress?.(50, `Connecting to ${this.apiUrl}...`);
      
      const bridge = getExtensionBridge();
      const headers: any = {};
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

      const response = await bridge.fetchJson(`${this.apiUrl.replace(/\/+$/, '')}/models`, {
        headers
      });

      if (!response.success) {
        console.warn('⚠️ Could not fetch models from remote provider via extension, but will try chat anyway.');
      }

      this.isInitialized = true;
      onProgress?.(100, 'Remote engine ready');
    } catch (error) {
      console.error('❌ OpenAI Engine Error:', error);
      this.isInitialized = true;
      onProgress?.(100, 'Remote engine initialized (with connectivity warnings)');
    }
  }

  async chat(messages: any[], options: GenerationOptions = {}): Promise<any> {
    if (!this.isInitialized) await this.initialize(this.modelName);
    
    const { temperature = 0.7, maxTokens = 2048, topP = 1, stop, tools, onStream } = options;

    try {
      const bridge = getExtensionBridge();
      
      // If streaming is requested but we are using extension bridge, we have a problem
      // For now, let's warn and use non-streaming
      if (onStream) {
        console.warn('⚠️ Streaming is not yet supported via extension proxy. Falling back to non-streaming.');
      }

      const headers: any = {};
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

      const response = await bridge.postJson(`${this.apiUrl.replace(/\/+$/, '')}/chat/completions`, {
        model: this.modelName,
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: topP,
        stop,
        tools,
        stream: false // Force false for extension proxy
      }, headers);

      if (!response.success) {
        throw new Error(`Remote API error: ${response.error}`);
      }

      return response.data.choices[0].message;
    } catch (error) {
      console.error('❌ Remote API Error:', error);
      throw error;
    }
  }

  async generateText(input: string | any[], options: GenerationOptions = {}): Promise<string> {
    const messages = typeof input === 'string' ? [{ role: 'user', content: input }] : input;
    const response = await this.chat(messages, options);
    return response.content;
  }

  async generateEmbedding(text: string): Promise<Float32Array> {
    const response = await fetch(`${this.apiUrl.replace(/\/+$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.apiKey ? `Bearer ${this.apiKey}` : '',
      },
      body: JSON.stringify({
        model: this.modelName,
        input: text
      })
    });

    if (!response.ok) throw new Error('Embedding failed');
    const data = await response.json();
    return new Float32Array(data.data[0].embedding);
  }

  async generateEmbeddingsBatch(texts: string[]): Promise<Float32Array[]> {
    const response = await fetch(`${this.apiUrl.replace(/\/+$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.apiKey ? `Bearer ${this.apiKey}` : '',
      },
      body: JSON.stringify({
        model: this.modelName,
        input: texts
      })
    });

    if (!response.ok) throw new Error('Batch embedding failed');
    const data = await response.json();
    return data.data.map((item: any) => new Float32Array(item.embedding));
  }

  isReady(): boolean { return this.isInitialized; }
  getModelName(): string { return this.modelName; }
  getContextWindowSize(): number { return 8192; } // Generic default
  async reset() { this.isInitialized = false; }
}
