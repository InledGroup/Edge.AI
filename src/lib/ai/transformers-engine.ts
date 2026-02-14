
import { 
  AutoProcessor, 
  AutoTokenizer,
  AutoModelForCausalLM, 
  TextStreamer,
  env 
} from '@huggingface/transformers';
import type { GenerationOptions, ProgressCallback } from './webllm-engine';
import { i18nStore } from '../stores/i18n';

// Configure transformers.js to use local cache and WebGPU
env.allowLocalModels = false;
env.useBrowserCache = true;
// env.backends.onnx.wasm.numThreads = 4; // Adjust if needed

export class TransformersEngine {
  private model: any = null;
  private processor: any = null;
  private tokenizer: any = null;
  private modelId: string = '';
  private isInitialized: boolean = false;

  constructor() {
    console.log('🤖 Transformers Engine created');
  }

  async initialize(modelId: string, onProgress?: ProgressCallback): Promise<void> {
    if (this.isInitialized && this.modelId === modelId) return;

    try {
      console.log(`🚀 Initializing Transformers.js with ${modelId}`);
      onProgress?.(0, i18nStore.t('models.progress.loadingWasm'));

      // 1. Load Processor (includes tokenizer and audio feature extractor)
      try {
        this.processor = await AutoProcessor.from_pretrained(modelId, {
          progress_callback: (p: any) => {
            if (p.status === 'progress') {
               onProgress?.(p.progress, `Loading Processor: ${p.file}`);
            }
          }
        });
        this.tokenizer = this.processor.tokenizer;
      } catch (e) {
        console.warn('⚠️ AutoProcessor failed (likely missing config), falling back to AutoTokenizer', e);
        this.tokenizer = await AutoTokenizer.from_pretrained(modelId, {
          progress_callback: (p: any) => {
            if (p.status === 'progress') {
               onProgress?.(p.progress, `Loading Tokenizer: ${p.file}`);
            }
          }
        });
      }

      // 2. Load Model (WebGPU)
      const device = 'webgpu'; 
      
      this.model = await AutoModelForCausalLM.from_pretrained(modelId, {
        device,
        dtype: 'fp32', // or q4/q8 if available in ONNX
        progress_callback: (p: any) => {
          if (p.status === 'progress') {
             onProgress?.(p.progress, `Loading Model: ${p.file}`);
          }
        }
      });

      this.modelId = modelId;
      this.isInitialized = true;
      onProgress?.(100, i18nStore.t('models.progress.modelReady') + ' (Transformers)');
      
    } catch (error) {
      console.error('❌ Transformers Engine Init Error:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  async chat(messages: any[], options: GenerationOptions = {}): Promise<any> {
    // Basic chat implementation
    // For LFM Audio, we might need manual prompt formatting if the tokenizer doesn't have a chat template
    
    // Convert messages to prompt
    // Assuming the processor has apply_chat_template, otherwise manual
    let prompt = "";
    if (this.tokenizer?.chat_template) {
       prompt = this.tokenizer.apply_chat_template(messages, { tokenize: false, add_generation_prompt: true });
    } else {
       // Fallback manual formatting
       prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';
    }

    const response = await this.generateText(prompt, options);
    return { role: 'assistant', content: response };
  }

  async generateText(
    input: string | { role: string; content: string | any[] }[],
    options: GenerationOptions = {}
  ): Promise<string> {
    if (!this.isInitialized) throw new Error('Transformers Engine not initialized');

    const { temperature = 0.7, maxTokens = 512, onStream, onAudio } = options;

    // 1. Prepare Inputs
    let textInput = "";
    let audioInput: Float32Array | null = null;

    if (typeof input === 'string') {
      textInput = input;
    } else if (Array.isArray(input)) {
       textInput = JSON.stringify(input); // Placeholder
    }

    // Tokenize
    // Use processor if available (for audio input support), else tokenizer
    const inputs = this.processor ? await this.processor(textInput) : await this.tokenizer(textInput);
    
    // 2. Generate
    const streamer = new TextStreamer(this.tokenizer, {
      skip_prompt: true,
      callback_function: (text: string) => {
        if (onStream) onStream(text);
      }
    });

    const output = await this.model.generate({
      ...inputs,
      max_new_tokens: maxTokens,
      temperature,
      do_sample: temperature > 0,
      streamer,
    });

    const decodedText = this.tokenizer.decode(output[0], { skip_special_tokens: true });
    return decodedText;
  }

  getBackend() { return 'webgpu'; }
  isReady() { return this.isInitialized; }
  getModelUrl() { return this.modelId; }
  async reset() { 
    this.model = null; 
    this.processor = null; 
    this.isInitialized = false; 
  }
}
