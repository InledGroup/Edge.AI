// HuggingFace Inference API Client
// Provides fast, cloud-based AI inference with streaming support

import { HfInference } from '@huggingface/inference';
import type { GenerationOptions } from './webllm-engine';

/**
 * HuggingFace API Client for cloud-based inference
 * Faster than local models, requires internet connection
 */
export class HuggingFaceClient {
  private hf: HfInference;
  private apiKey: string;
  private embeddingModel: string = 'sentence-transformers/all-MiniLM-L6-v2';

  constructor(apiKey: string) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('HuggingFace API key is required');
    }

    this.apiKey = apiKey;
    this.hf = new HfInference(apiKey);
    console.log('✅ HuggingFace client initialized');
  }

  /**
   * Generate embeddings for semantic search using HuggingFace API
   * Uses sentence-transformers/all-MiniLM-L6-v2 (384 dimensions)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      console.log('🔢 Generating embedding via HuggingFace API...');

      const response = await this.hf.featureExtraction({
        model: this.embeddingModel,
        inputs: text,
      });

      // The response can be a single embedding or batch
      let embedding: number[];
      if (Array.isArray(response)) {
        // Check if it's a 2D array (batch of embeddings)
        if (Array.isArray(response[0])) {
          embedding = response[0] as number[];
        } else {
          embedding = response as number[];
        }
      } else {
        throw new Error('Unexpected embedding response format');
      }

      console.log('✅ Generated embedding:', embedding.length, 'dimensions');
      return embedding;
    } catch (error) {
      console.error('❌ Embedding generation failed:', error);
      throw new Error(
        `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate text using HuggingFace Inference API
   * Supports streaming for better UX
   */
  async generateText(
    prompt: string,
    modelName: string,
    options: GenerationOptions = {}
  ): Promise<string> {
    const {
      temperature = 0.7,
      maxTokens = 512,
      topP = 0.95,
      onStream,
    } = options;

    try {
      console.log('💬 Generating text via HuggingFace API...');
      console.log('Model:', modelName);

      // Check if the model supports streaming
      const supportsStreaming = this.modelSupportsStreaming(modelName);

      if (onStream && supportsStreaming) {
        // Streaming mode
        let fullResponse = '';

        const stream = this.hf.textGenerationStream({
          model: modelName,
          inputs: prompt,
          parameters: {
            temperature,
            max_new_tokens: maxTokens,
            top_p: topP,
            return_full_text: false,
          },
        });

        for await (const chunk of stream) {
          if (chunk.token?.text) {
            fullResponse += chunk.token.text;
            onStream(chunk.token.text);
          }
        }

        console.log('✅ Generated', fullResponse.length, 'characters (streamed)');
        return fullResponse;
      } else {
        // Non-streaming mode
        const response = await this.hf.textGeneration({
          model: modelName,
          inputs: prompt,
          parameters: {
            temperature,
            max_new_tokens: maxTokens,
            top_p: topP,
            return_full_text: false,
          },
        });

        const generatedText = response.generated_text;

        // If streaming callback was provided but not supported, simulate streaming
        if (onStream && !supportsStreaming) {
          await this.simulateStreaming(generatedText, onStream);
        }

        console.log('✅ Generated', generatedText.length, 'characters');
        return generatedText;
      }
    } catch (error) {
      console.error('❌ Text generation failed:', error);

      // Provide more helpful error messages
      if (error instanceof Error) {
        if (error.message.includes('429')) {
          throw new Error(
            'Rate limit exceeded. Please wait a moment and try again, or use a different model.'
          );
        } else if (error.message.includes('401') || error.message.includes('403')) {
          throw new Error(
            'Invalid API key. Please check your HuggingFace API key and try again.'
          );
        } else if (error.message.includes('404')) {
          throw new Error(
            `Model "${modelName}" not found. Please check the model name and try again.`
          );
        }
      }

      throw new Error(
        `Failed to generate text: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if a model supports streaming
   * Most modern LLMs do, but some older models don't
   */
  private modelSupportsStreaming(modelName: string): boolean {
    // Most popular models support streaming
    const streamingModels = [
      'meta-llama',
      'mistralai',
      'google/flan',
      'bigscience/bloom',
      'gpt2',
      'EleutherAI',
    ];

    return streamingModels.some((model) =>
      modelName.toLowerCase().includes(model.toLowerCase())
    );
  }

  /**
   * Simulate streaming for models that don't support it
   * Splits response into words and sends them progressively
   */
  private async simulateStreaming(
    text: string,
    onStream: (chunk: string) => void
  ): Promise<void> {
    const words = text.split(' ');
    for (const word of words) {
      onStream(word + ' ');
      // Small delay to simulate streaming (20ms per word)
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /**
   * Test the API key by making a simple request
   */
  async testAPIKey(): Promise<boolean> {
    try {
      console.log('🧪 Testing HuggingFace API key...');

      // Try a simple embedding request
      await this.generateEmbedding('test');

      console.log('✅ API key is valid');
      return true;
    } catch (error) {
      console.error('❌ API key test failed:', error);
      return false;
    }
  }

  /**
   * Get the embedding model being used
   */
  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  /**
   * Change the embedding model
   * Default: sentence-transformers/all-MiniLM-L6-v2 (384 dims)
   * Alternative: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 (384 dims, better for Spanish)
   */
  setEmbeddingModel(modelName: string): void {
    this.embeddingModel = modelName;
    console.log('📝 Embedding model changed to:', modelName);
  }
}

/**
 * Popular HuggingFace models for text generation
 */
export interface HuggingFaceModelInfo {
  name: string;
  displayName: string;
  description: string;
  contextLength: number;
  recommended: boolean;
  language: 'multilingual' | 'english' | 'spanish';
}

export function getPopularHuggingFaceModels(): HuggingFaceModelInfo[] {
  return [
    {
      name: 'google/flan-t5-large',
      displayName: 'FLAN-T5 Large (Recomendado)',
      description: 'Modelo equilibrado, buena calidad, multilingüe',
      contextLength: 512,
      recommended: true,
      language: 'multilingual',
    },
    {
      name: 'mistralai/Mistral-7B-Instruct-v0.2',
      displayName: 'Mistral 7B Instruct',
      description: 'Excelente calidad, modelo grande',
      contextLength: 8192,
      recommended: false,
      language: 'multilingual',
    },
    {
      name: 'meta-llama/Llama-2-7b-chat-hf',
      displayName: 'Llama 2 7B Chat',
      description: 'Alta calidad, de Meta',
      contextLength: 4096,
      recommended: false,
      language: 'multilingual',
    },
    {
      name: 'google/flan-t5-base',
      displayName: 'FLAN-T5 Base',
      description: 'Más rápido, menor calidad',
      contextLength: 512,
      recommended: false,
      language: 'multilingual',
    },
    {
      name: 'bigscience/bloom-560m',
      displayName: 'BLOOM 560M',
      description: 'Ligero y multilingüe',
      contextLength: 2048,
      recommended: false,
      language: 'multilingual',
    },
  ];
}

/**
 * Validate a HuggingFace API key format
 * Keys should start with "hf_"
 */
export function validateAPIKey(apiKey: string): {
  valid: boolean;
  error?: string;
} {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, error: 'API key cannot be empty' };
  }

  if (!apiKey.startsWith('hf_')) {
    return {
      valid: false,
      error: 'HuggingFace API keys should start with "hf_"',
    };
  }

  if (apiKey.length < 20) {
    return { valid: false, error: 'API key seems too short' };
  }

  return { valid: true };
}
