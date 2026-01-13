import { MLCEngine } from '@mlc-ai/web-llm';

console.log('Checking WebLLM capabilities...');
const engine = new MLCEngine();

// Check for embedding methods
if (typeof engine.embeddings === 'function' || typeof (engine as any).embedding === 'function') {
  console.log('✅ WebLLM supports embeddings!');
} else {
  console.log('❌ No explicit embedding support found in MLCEngine');
}
