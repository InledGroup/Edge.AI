
import * as webllm from '@mlc-ai/web-llm';

console.log('Available models:');
try {
    const list = webllm.prebuiltAppConfig.model_list;
    list.forEach(m => {
        console.log(`- ${m.model_id} (family: ${m.model_lib})`);
    });
} catch (e) {
    console.error(e);
}
