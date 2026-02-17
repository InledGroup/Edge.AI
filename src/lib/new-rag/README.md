# New RAG Pipeline (Maximum Performance)

This directory contains a complete, functional implementation of a high-performance RAG pipeline based on the [Fudan University study](https://arxiv.org/pdf/2407.01219).

## Architecture

1.  **Query Classification**: BERT-based prototype classification to determine if retrieval is needed.
2.  **Chunking**: "Small-to-Big" strategy (175 token chunks -> 512 token context) using NLP sentence splitting.
3.  **Embedding**: 
    *   **Dense**: `Xenova/bge-m3` (State-of-the-art multilingual embedding).
    *   **Sparse**: Custom Hashing Vectorizer (TF-IDF equivalent) for lexical matching.
4.  **Retrieval**: Hybrid Search (Dense + Sparse) stored in **Local IndexedDB** (Edge-Only).
5.  **Reranking**: `monoT5` (Sequence-to-Sequence) reranker for precise relevance scoring.
6.  **Repackaging**: Reverse order (most relevant last) to optimize for LLM recency bias.
7.  **Compression**: Abstractive summarization (Recomp) using `flan-t5` to minimize context window usage.

## Usage

```typescript
import { AdvancedRAGPipeline } from '@/lib/new-rag';

const rag = AdvancedRAGPipeline.getInstance();

// Indexing a document
await rag.indexDocument(fullText, { title: "My Doc", source: "..." });

// Querying
const result = await rag.execute("What is the specific detail about X?");

if (result.mode === 'rag') {
  console.log("Compressed Context:", result.context);
  // Pass to your LLM
} else {
  console.log("Direct answer possible (Retrieval not needed)");
}
```

## Dependencies

*   `@huggingface/transformers`: Local model inference.
*   `idb`: Local IndexedDB management.
*   `natural`: NLP utilities (tokenization).
*   `uuid`: ID generation.

## Configuration

Edit `src/lib/new-rag/config.ts` to adjust model selection and local storage settings.
