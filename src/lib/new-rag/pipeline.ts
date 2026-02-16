import { RAGModelLoader } from './model-loader';
import { MilvusConnector } from './milvus-client';
import { ChunkingService } from './chunking-service';
import { Reranker } from './reranker';
import { CompressionService } from './compression';
import { SparseVectorizer } from './sparse-vectorizer';
import type { RAGResponse } from './types';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_CONFIG } from './config';

export class AdvancedRAGPipeline {
  private static instance: AdvancedRAGPipeline;
  private milvus: MilvusConnector;
  private loader: RAGModelLoader;
  private static qaPrototype: number[] | null = null;
  private static chatPrototype: number[] | null = null;

  constructor() {
    this.milvus = new MilvusConnector();
    this.loader = RAGModelLoader.getInstance();
  }

  static getInstance() {
    if (!this.instance) this.instance = new AdvancedRAGPipeline();
    return this.instance;
  }

  /**
   * Indexing Process
   * Splits text into Small-to-Big chunks, generates Hybrid Embeddings, and indexes in Milvus.
   */
  async indexDocument(text: string, metadata: any = {}) {
    const chunks = ChunkingService.splitSmallToBig(text);
    const embedder = await this.loader.getEmbedder();
    
    // Process chunks in batches to avoid blocking
    const milvusData = [];
    
    for (const c of chunks) {
      // 1. Generate Dense Embedding (BGE-M3)
      // pooling: 'mean' or 'cls' depending on model. BGE-M3 often uses CLS or Mean. 
      // Transformers.js feature-extraction defaults to mean pooling often, but let's be explicit.
      const denseOutput = await embedder(c.small, { pooling: 'mean', normalize: true });
      const denseVector = Array.from(denseOutput.data);
      
      // 2. Generate Sparse Vector (Custom TF-IDF Hashing)
      const sparseVector = SparseVectorizer.encode(c.small);

      milvusData.push({
        id: uuidv4(),
        dense_vector: denseVector,
        sparse_vector: sparseVector,
        content: c.parent, // Store parent chunk for retrieval
        small_content: c.small, // Store small chunk for reference/debug
        metadata: metadata
      });
    }

    if (milvusData.length > 0) {
      await this.milvus.insert(milvusData);
    }
    
    return milvusData.length;
  }

  /**
   * Query Execution Pipeline (Maximum Performance Configuration)
   */
  async execute(query: string, onProgress?: (step: string, progress: number, message: string) => void): Promise<RAGResponse> {
    // 1. Query Classification (BERT)
    // Decide if we need retrieval or if it's just chitchat
    if (onProgress) onProgress('classification', 10, 'Clasificando consulta...');
    const isRetrievalNeeded = await this.classifyQuery(query);
    if (!isRetrievalNeeded) {
      console.log("Query classified as Direct/Chat");
      return { mode: 'direct', context: null };
    }

    console.log("Query classified as Information Seeking (RAG)");

    // 2. HyDE (Hypothetical Document Embedding)
    // Generate a hypothetical answer to improve retrieval
    if (onProgress) onProgress('hyde', 30, 'Generando respuesta hipotética (HyDE)...');
    const hypoDoc = await this.generateHypotheticalDoc(query);
    console.log("Generated HyDE document:", hypoDoc.substring(0, 50) + "...");
    
    // 3. Embedding Generation (Dense + Sparse)
    if (onProgress) onProgress('embedding', 50, 'Búsqueda híbrida (Densa + Dispersa)...');
    const embedder = await this.loader.getEmbedder();
    
    // Dense: Embed the HyDE document (or Query + HyDE)
    // Fudan paper suggests embedding the HyDE document for dense retrieval.
    const denseOutput = await embedder(hypoDoc, { pooling: 'mean', normalize: true });
    const queryDense = Array.from(denseOutput.data) as number[];
    
    // Sparse: Embed the original query (Keywords are in the query)
    const querySparse = SparseVectorizer.encode(query); 

    // 4. Hybrid Retrieval (Milvus)
    const topHits = await this.milvus.searchHybrid(
      queryDense,
      querySparse,
      DEFAULT_CONFIG.search.topK
    );
    console.log(`Retrieved ${topHits.length} candidates`);

    // 5. monoT5 Reranking
    // Re-score the top 50 candidates using a powerful cross-encoder (monoT5)
    if (onProgress) onProgress('reranking', 70, 'Re-ordenando resultados (monoT5)...');
    const rerankedHits = await Reranker.rerank(query, topHits, DEFAULT_CONFIG.search.topK);

    // 6. Select Top K (e.g., 5 or 10)
    const topK = rerankedHits.slice(0, 10);

    // 7. Reverse Re-packaging
    // Sort so the best document is last (closest to the query in the prompt)
    const repacked = Reranker.reverseRepack(topK);

    // 8. Recomp Compression
    // Abstractive compression of the retrieved context
    if (onProgress) onProgress('compression', 90, 'Comprimiendo contexto (Recomp)...');
    const fullContext = repacked.map(h => h.content).join('\n\n');
    const compressedContext = await CompressionService.compress(fullContext, query);

    if (onProgress) onProgress('completed', 100, 'Contexto listo.');

    return {
      mode: 'rag',
      context: compressedContext,
      sources: repacked.map(h => ({ id: h.id, metadata: h.metadata }))
    };
  }

  // --- Helpers ---

  private async classifyQuery(query: string): Promise<boolean> {
    const classifier = await this.loader.getClassifier();
    
    // Initialize Prototypes if needed
    if (!AdvancedRAGPipeline.qaPrototype || !AdvancedRAGPipeline.chatPrototype) {
        const qaPhrases = [
            "What is the capital of France?", "Explain the theory of relativity.", "Who wrote Don Quixote?",
            "How does photosynthesis work?", "Define machine learning.",
            "¿Cuál es la capital de Francia?", "Explica la teoría de la relatividad.", "¿Quién escribió Don Quijote?"
        ];
        const chatPhrases = [
            "Hello", "Hi", "Good morning", "How are you?", "Nice to meet you",
            "Hola", "Buenos días", "¿Cómo estás?", "Gracias", "Adiós"
        ];

        // Compute centroids
        const embed = async (texts: string[]) => {
           const vectors: number[][] = [];
           for (const t of texts) {
             const out = await classifier(t, { pooling: 'mean', normalize: true });
             vectors.push(Array.from(out.data) as number[]);
           }
           return vectors;
        };

        const qaVecs = await embed(qaPhrases);
        const chatVecs = await embed(chatPhrases);
        
        AdvancedRAGPipeline.qaPrototype = this.computeCentroid(qaVecs);
        AdvancedRAGPipeline.chatPrototype = this.computeCentroid(chatVecs);
    }

    // Embed Query
    const queryOut = await classifier(query, { pooling: 'mean', normalize: true });
    const queryVec = Array.from(queryOut.data) as number[];

    // Cosine Similarity
    const simQA = this.cosineSimilarity(queryVec, AdvancedRAGPipeline.qaPrototype!);
    const simChat = this.cosineSimilarity(queryVec, AdvancedRAGPipeline.chatPrototype!);

    // Heuristic Override for question words
    const questionWords = /^(who|what|where|when|why|how|define|explain|quién|qué|dónde|cuándo|por qué|cómo|explica|define)/i;
    if (questionWords.test(query)) return true;

    return simQA > simChat; 
  }

  private async generateHypotheticalDoc(query: string): Promise<string> {
    const generator = await this.loader.getGenerator();
    // Instruction for HyDE
    const prompt = `Write a comprehensive answer to the question: "${query}"`;
    const result = await generator(prompt, { 
      max_new_tokens: 128,
      do_sample: true, 
      temperature: 0.7 
    });
    return result[0].generated_text;
  }

  private computeCentroid(vectors: number[][]): number[] {
      if (vectors.length === 0) return [];
      const dim = vectors[0].length;
      const centroid = new Array(dim).fill(0);
      for (const vec of vectors) {
          for (let i = 0; i < dim; i++) centroid[i] += vec[i];
      }
      return centroid.map(v => v / vectors.length);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
      let dot = 0, magA = 0, magB = 0;
      for (let i = 0; i < a.length; i++) {
          dot += a[i] * b[i];
          magA += a[i] * a[i];
          magB += b[i] * b[i];
      }
      return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
  }
}
