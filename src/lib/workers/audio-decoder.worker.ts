
import { MimiModel, env } from '@huggingface/transformers';
import type { AudioDecoderWorkerMessage, WorkerResponse } from './worker-types';

// Configure transformers
env.allowLocalModels = false;
env.useBrowserCache = true;

let model: any = null;
let isInitializing = false;

self.onmessage = async (e: MessageEvent<AudioDecoderWorkerMessage>) => {
  const { id, type, payload } = e.data as any; // Cast to access ID for response

  try {
    switch (type) {
      case 'init':
        if (model || isInitializing) {
          postResponse(id, 'success', { message: 'Already initialized' });
          return;
        }
        isInitializing = true;
        const modelId = (payload as any).modelId || 'kyutai/mimi';
        const device = (payload as any).device || 'wasm'; // Default to CPU for stability in worker

        console.log(`[AudioWorker] Loading Mimi model ${modelId} on ${device}...`);
        
        model = await MimiModel.from_pretrained(modelId, {
          device,
          dtype: 'fp32', // Mimi usually requires fp32 or specific quantization
        });
        
        isInitializing = false;
        console.log('[AudioWorker] Model loaded');
        postResponse(id, 'success', { message: 'Model loaded' });
        break;

      case 'decode':
        if (!model) throw new Error('Audio decoder not initialized');
        const { tokens } = payload as any;
        
        // tokens is number[][], shape (B, 8)
        // Mimi decode expects tensor of shape (1, 8, T)? 
        // Or (1, T, 8)? 
        // Based on python: "mimi_codes = torch.stack(audio_out[:-1], 1).unsqueeze(0)" 
        // -> audio_out list of (8) -> stack dim 1 -> (8, T) ? No.
        
        // Let's assume transformers.js implementation follows the standard input.
        // Usually: input_values (batch_size, num_codebooks, sequence_length)
        
        // We have `tokens` which is an array of frames (each frame is [c0, c1...c7]).
        // So we have [ [c0,c1..], [c0,c1..] ... ] -> Length T.
        // We need to transpose this to [ [c0, c0...], [c1, c1...] ... ] -> Shape (8, T).
        // And then add batch dim -> (1, 8, T).
        
        const numFrames = tokens.length;
        const numCodebooks = 8;
        
        // Transpose
        const transposed = new Array(numCodebooks).fill(0).map(() => new Array(numFrames));
        for (let t = 0; t < numFrames; t++) {
          for (let c = 0; c < numCodebooks; c++) {
            transposed[c][t] = tokens[t][c];
          }
        }
        
        // Create tensor-like structure (or pass nested array if supported)
        // Transformers.js generally supports nested arrays and converts them.
        // Input should be `input_ids` or `codes`.
        // For MimiModel, the input arg is typically `input_ids`.
        // Shape: (batch_size, num_codebooks, sequence_length) -> (1, 8, T)
        
        const inputIds = [transposed]; // Add batch dim
        
        const output = await model.decode(inputIds);
        // Output should contain `waveform`.
        // Waveform shape: (batch_size, channels, samples)
        
        const audioData = output.waveform.data; // Float32Array
        
        postResponse(id, 'success', { audio: audioData }, [audioData.buffer]);
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error: any) {
    console.error('[AudioWorker] Error:', error);
    postResponse(id, 'error', undefined, undefined, error.message);
  }
};

function postResponse(id: string, type: 'success' | 'error', payload?: any, transfer?: Transferable[], error?: string) {
  const response: WorkerResponse = {
    id,
    type,
    payload,
    error
  };
  self.postMessage(response, { transfer });
}
