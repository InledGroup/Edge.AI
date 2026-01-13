import * as webllm from '@mlc-ai/web-llm';

console.log('Available WebLLM Models:');
webllm.prebuiltAppConfig.model_list.forEach(m => {
  if (m.model_id.toLowerCase().includes('embed')) {
    console.log(`- ${m.model_id}`);
  }
});

// Also print some chat models to see the pattern
console.log('\nSome Chat Models:');
webllm.prebuiltAppConfig.model_list.slice(0, 5).forEach(m => console.log(`- ${m.model_id}`));
