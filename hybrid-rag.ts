// Hybrid RAG System
// Intelligent system that uses HuggingFace API, WebLLM GPU, or Wllama CPU
// with automatic fallback based on availability and configuration

import { WebLLMEngine, type GenerationOptions, type ProgressCallback, getAvailableModelIds } from './webllm-engine';
import { WllamaEngine } from './wllama-engine';
import { HuggingFaceClient } from './huggingface-client';
import { detectDeviceCapabilities, type DeviceCapabilities, isWebLLMModel } from './model-detector';
import { chunkText, processPdfFromUrl } from '../rag'; // Reuse PDF utilities
import { semanticChunkText, formatChunkWithContext, type SemanticChunk } from './semantic-chunking';
import { multiLevelCache, type RAGDocument as CachedRAGDocument } from '../cache/multi-level-cache';
import { memoryMonitor, type MemoryPressure } from '../monitoring/memory-monitor';
import { executionScheduler } from './execution-scheduler';
import { generateUUID } from '../utils';

export type RAGBackend = 'huggingface' | 'webllm-gpu' | 'wllama-cpu';

export interface RAGDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: any;
}

export interface RAGSearchResult {
  document: RAGDocument;
  score: number;
}

export interface RAGConfig {
  // HuggingFace API configuration (optional)
  huggingfaceApiKey?: string;
  useHuggingfaceApi?: boolean;

  // Model configuration
  modelName: string; // Can be WebLLM or HuggingFace model

  // AI backend preference (optional, will auto-detect if not provided)
  preferredBackend?: RAGBackend;

  // Chatbot configuration
  personality?: string;
  temperature?: number;
  maxTokens?: number;

  // Cache configuration
  chatbotId?: string; // Required for caching embeddings
  enableCache?: boolean; // Default: true
}

/**
 * Hybrid RAG System with intelligent backend selection
 * Priority: HuggingFace API → WebLLM GPU → WebLLM CPU
 */
export class HybridRAGSystem {
  private documents: RAGDocument[] = [];
  private backend: RAGBackend = 'wllama-cpu';
  private deviceCapabilities: DeviceCapabilities | null = null;

  // AI engines
  private webllmEngine: WebLLMEngine | null = null;
  private wllamaEngine: WllamaEngine | null = null;
  private wllamaEmbeddingsEngine: WllamaEngine | null = null; // Separate engine for embeddings when using WebLLM
  private hfClient: HuggingFaceClient | null = null;

  // Configuration
  private config: RAGConfig | null = null;
  private isInitialized: boolean = false;

  constructor() {
    console.log('🎯 Hybrid RAG System created');
  }

  /**
   * Initialize the RAG system with intelligent backend selection
   * 1. If HuggingFace API key is provided and enabled → use HF API
   * 2. Otherwise → detect device capabilities
   *    a. If WebGPU available → use WebLLM with GPU
   *    b. If not → use Wllama with pure WebAssembly/CPU (no ONNX Runtime)
   */
  async initialize(
    config: RAGConfig,
    progressCallback?: ProgressCallback
  ): Promise<void> {
    if (this.isInitialized) {
      console.log('✅ Hybrid RAG already initialized');
      return;
    }

    try {
      console.log('🚀 Initializing Hybrid RAG System...');
      this.config = config;
      progressCallback?.(0, 'Inicializando sistema RAG...');

      // Initialize multi-level cache
      console.log('💾 Initializing cache system...');
      await multiLevelCache.init();

      // Check memory before proceeding
      memoryMonitor.logMemoryStats();
      const memoryPressure = memoryMonitor.checkMemoryPressure();
      if (memoryPressure === 'critical') {
        throw new Error(
          'Memoria insuficiente para inicializar el sistema RAG. Cierra otras pestañas o aplicaciones.'
        );
      }

      // Step 1: Detect device capabilities
      console.log('📊 Detecting device capabilities...');
      progressCallback?.(10, 'Detectando capacidades del dispositivo...');
      this.deviceCapabilities = await detectDeviceCapabilities();

      // CRITICAL: Override user-configured model with automatic selection
      // This ensures the model matches the device's capabilities
      if (this.deviceCapabilities.recommendedModel) {
        console.log(`🎯 AUTOMATIC MODEL SELECTION: Using ${this.deviceCapabilities.recommendedModel}`);
        console.log(`   Reason: ${this.deviceCapabilities.modelRecommendation?.reason}`);

        // Validate that the recommended model can run on this device
        const validation = await this.validateModelMemory(
          this.deviceCapabilities.recommendedModel,
          this.deviceCapabilities.estimatedMemoryGB,
          this.deviceCapabilities.gpuConfig
        );

        if (!validation.canRun) {
          console.error(`❌ Recommended model validation failed: ${validation.reason}`);
          throw new Error(
            `Dispositivo con memoria insuficiente para ejecutar modelos. ` +
            `Necesitas al menos 1GB RAM libre. ${validation.reason}`
          );
        }

        // Override config with recommended model
        config.modelName = this.deviceCapabilities.recommendedModel;
        this.config = config;
      }

      // Step 2: Decide which backend to use
      this.backend = this.selectBackend(config, this.deviceCapabilities);
      console.log('✅ Selected backend:', this.backend);
      progressCallback?.(20, `Backend seleccionado: ${this.getBackendDisplayName()}`);

      // Step 3: Initialize the appropriate backend
      await this.initializeBackend(config, progressCallback);

      this.isInitialized = true;
      console.log('✅ Hybrid RAG System initialized successfully');
      memoryMonitor.logMemoryStats();
      progressCallback?.(100, `Sistema listo (${this.getBackendDisplayName()})`);
    } catch (error) {
      console.error('❌ Failed to initialize Hybrid RAG:', error);
      this.isInitialized = false;
      throw new Error(
        `Failed to initialize RAG system: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Validate if a model can run on the device based on memory constraints
   */
  private async validateModelMemory(
    modelName: string,
    memoryGB: number,
    gpuConfig: any
  ): Promise<{ canRun: boolean; reason?: string }> {
    // Import validation function from model-selector
    const { validateModelForDevice } = await import('./model-selector');
    return validateModelForDevice(modelName, memoryGB, gpuConfig);
  }

  /**
   * Convert MLC model name to GGUF model URL for Wllama
   * Maps WebLLM model names to their GGUF equivalents
   */
  private convertToGGUFModel(mlcModelName: string): string {
    // Map of MLC models to GGUF URLs
    const modelMap: Record<string, string> = {
      // SmolLM2 models
      'SmolLM2-135M-Instruct-q0f16-MLC':
        'https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct-GGUF/resolve/main/smollm2-135m-instruct-q4_k_m.gguf',
      'SmolLM2-360M-Instruct-q4f16_1-MLC':
        'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q4_k_m.gguf',

      // Qwen models
      'Qwen2.5-0.5B-Instruct-q4f16_1-MLC':
        'https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf',
      'Qwen2.5-1.5B-Instruct-q4f16_1-MLC':
        'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',

      // TinyLlama
      'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC':
        'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',

      // Llama models
      'Llama-3.2-1B-Instruct-q4f16_1-MLC':
        'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
      'Llama-3.2-3B-Instruct-q4f16_1-MLC':
        'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',

      // Phi models
      'Phi-3.5-mini-instruct-q4f16_1-MLC':
        'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
    };

    // If we have a direct mapping, use it
    if (modelMap[mlcModelName]) {
      return modelMap[mlcModelName];
    }

    // Default fallback: Qwen2-0.5B (smallest, fastest)
    console.warn(`⚠️ No GGUF mapping for ${mlcModelName}, using default Qwen2-0.5B`);
    return 'https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf';
  }

  /**
   * Select the best backend based on configuration and device capabilities
   */
  private selectBackend(
    config: RAGConfig,
    capabilities: DeviceCapabilities
  ): RAGBackend {
    // Priority 1: User explicitly wants HuggingFace API and has provided VALID key
    if (
      config.useHuggingfaceApi &&
      config.huggingfaceApiKey &&
      config.huggingfaceApiKey.trim() !== '' &&
      config.huggingfaceApiKey.startsWith('hf_') // Basic validation
    ) {
      console.log('✅ Using HuggingFace API (user preference with valid key)');
      return 'huggingface';
    }

    // If user wanted HF API but key is invalid/missing, warn and fallback
    if (config.useHuggingfaceApi && !config.huggingfaceApiKey) {
      console.warn('⚠️ HuggingFace API requested but no API key provided. Falling back to WebLLM.');
    } else if (config.useHuggingfaceApi && config.huggingfaceApiKey && !config.huggingfaceApiKey.startsWith('hf_')) {
      console.warn('⚠️ HuggingFace API key appears invalid (should start with hf_). Falling back to WebLLM.');
    }

    // Priority 2: User has specified a preferred backend
    if (config.preferredBackend) {
      // Validate if the preferred backend is available
      if (config.preferredBackend === 'webllm-gpu' && !capabilities.hasWebGPU) {
        console.warn('⚠️ Parece que este dispositivo no soporta WebGPU. Usando Wllama con CPU.');
        return 'wllama-cpu';
      }
      return config.preferredBackend;
    }

    // Priority 3: Auto-detect based on device capabilities
    console.log('🔍 Detectando como vamos a montar el RAG y sistema de modelos en base a cuanto aguanta este dispositivo...');

    // WebLLM 0.2.80 requires WebGPU
    if (!capabilities.hasWebGPU) {
      console.warn('⚠️ Vaya, pues no tenemos WebGPU. Bueno, usaremos su CPU.');

      // Try Wllama as fallback
      console.log('🔄 Vamos a intentar usar Wllama con Web Assembly y CPU...');
      return 'wllama-cpu';
    }

    return 'webllm-gpu';
  }

  /**
   * Initialize the selected backend
   */
  private async initializeBackend(
    config: RAGConfig,
    progressCallback?: ProgressCallback
  ): Promise<void> {
    if (this.backend === 'huggingface') {
      // Initialize HuggingFace client
      console.log('🤗 Initializing HuggingFace client...');
      progressCallback?.(30, 'Inicializando cliente de HuggingFace...');

      if (!config.huggingfaceApiKey || config.huggingfaceApiKey.trim() === '') {
        // This should never happen due to selectBackend() validation, but just in case
        console.error('❌ Has seleccionado usar el backend de HuggingFace pero no has proporcionado un API Key o esta no funciona. Esto es un bug como la copa de un pino.');
        throw new Error('HuggingFace API key is required but not provided. Please configure your API key or use WebLLM instead.');
      }

      this.hfClient = new HuggingFaceClient(config.huggingfaceApiKey);

      // Test the API key
      try {
        const isValid = await this.hfClient.testAPIKey();
        if (!isValid) {
          console.warn('⚠️ HuggingFace API key validation failed, falling back to local inference');
          // Fallback to local inference (WebLLM GPU or Wllama CPU)
          this.backend = this.deviceCapabilities?.hasWebGPU ? 'webllm-gpu' : 'wllama-cpu';
          console.log(`🔄 Vaya, parece que vamos a tener que usar ${this.backend}`);
          // Recursively initialize with the new backend
          return this.initializeBackend(config, progressCallback);
        }
      } catch (error) {
        console.warn('⚠️ Error testing HuggingFace API key, falling back to local inference:', error);
        // Fallback to local inference (WebLLM GPU or Wllama CPU)
        this.backend = this.deviceCapabilities?.hasWebGPU ? 'webllm-gpu' : 'wllama-cpu';
        console.log(`🔄 Vaya, parece que vamos usar ${this.backend}`);
        // Recursively initialize with the new backend
        return this.initializeBackend(config, progressCallback);
      }

      progressCallback?.(100, 'Cliente de HuggingFace listo');
    } else if (this.backend === 'webllm-gpu') {
      // Initialize WebLLM engine (requires WebGPU)
      console.log('🤖 Inicializando WebLLM...');
      progressCallback?.(30, 'Estamos arrancando WebLLM, espere, por favor. Gracias. :)...');

      // Get available models from WebLLM
      const availableModels = getAvailableModelIds();
      console.log(`📋 ${availableModels.length} models available in WebLLM 0.2.80`);

      // Validate model name - if it's not available, select the first small model
      let modelName = config.modelName;
      if (!availableModels.includes(modelName)) {
        console.warn(`⚠️ Has seleccionado el modelo ${modelName},  pero no está disponible en esta versión de WebLLM. Si, estamos usando una un poco antigua pero es lo que hay, si no tendríamos que pasar por el aro del ONXRuntime que falla como una escopeta de feria.`);

        // Try to find a small model (prefer models with these keywords)
        const preferredKeywords = ['SmolLM', 'TinyLlama', 'Qwen', 'Phi', 'Llama-3.2-1B'];
        let foundModel = null;

        for (const keyword of preferredKeywords) {
          foundModel = availableModels.find(m => m.includes(keyword));
          if (foundModel) break;
        }

        // If no preferred model found, use the first available
        modelName = foundModel || availableModels[0];
        console.log(`✅ ¡He seleccionado el modelo que me ha dado la gana: ${modelName}!`);
      } else {
        console.log(`✅ ¡He seleccionado el modelo que me has pedido: ${modelName}!`);
      }

      try {
        this.webllmEngine = new WebLLMEngine();

        await this.webllmEngine.initialize(modelName, (progress, status) => {
          // Map WebLLM progress (0-100) to our progress (30-60)
          const mappedProgress = 30 + (progress * 0.3);
          console.log(`[HybridRAG] WebLLM Progress: ${Math.round(mappedProgress)}% - ${status}`);
          progressCallback?.(mappedProgress, status);
        });

        console.log('✅ Ya etsá, WebLLM inicializado con WebGPU y toda la pesca.');

        // Initialize Wllama engine ONLY for embeddings (WebLLM can't do embeddings)
        console.log('🔧 Inicializando Wllama para embeddings...');
        progressCallback?.(60, 'Cargando motor de embeddings (Wllama)...');

        this.wllamaEmbeddingsEngine = new WllamaEngine();
        const wasmModelUrl = 'https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf';

        await this.wllamaEmbeddingsEngine.initialize(wasmModelUrl, (progress, status) => {
          // Map Wllama progress (0-100) to our progress (60-100)
          const mappedProgress = 60 + (progress * 0.4);
          console.log(`[HybridRAG] Wllama Embeddings Progress: ${Math.round(mappedProgress)}% - ${status}`);
          progressCallback?.(mappedProgress, status);
        });

        console.log('✅ Wllama embeddings engine ready');
      } catch (error) {
        console.warn('⚠️ WebLLM failed to initialize (WebGPU issue), falling back to Wllama:', error);
        // Fallback to Wllama
        this.backend = 'wllama-cpu';
        return this.initializeBackend(config, progressCallback);
      }
    } else if (this.backend === 'wllama-cpu') {
      // Initialize Wllama engine (pure WASM/CPU fallback - no ONNX Runtime)
      console.log('🤖 Iniciando con Wllama (que usa WASM y CPU a tope)');
      progressCallback?.(30, 'Por favor, espera. Estamos iniciando Wllama en WASM. ...');

      try {
        this.wllamaEngine = new WllamaEngine();

        // Convert MLC model name to GGUF model URL for Wllama
        const wasmModelUrl = this.convertToGGUFModel(config.modelName);
        console.log(`📦 Using GGUF model: ${wasmModelUrl}`);

        await this.wllamaEngine.initialize(wasmModelUrl, (progress, status) => {
          // Map progress (0-100) to our progress (30-100)
          const mappedProgress = 30 + (progress * 0.7);
          console.log(`[HybridRAG] Wllama Progress: ${Math.round(mappedProgress)}% - ${status}`);
          progressCallback?.(mappedProgress, status);
        });

        console.log('✅ Listo, Wllama inicializado con WASM y CPU.');
      } catch (error) {
        console.error('❌ Wllama initialization failed:', error);

        // If Wllama fails, we're out of options
        throw new Error(
          'A ver, alma de cántaro. Estás intentando usar AiCloud en un navegador de la era de los dinosaurios. ' +
          'Este navegador no soporta las tecnologías básicas para correr los modelos de IA en tu navegador. Osea: WebGPU o WebAssembly'+
          'Por favor, intenta usar un navegador normal, por Dios. Esto debe ser tan viejo como Internet Explorer. ' +
          'Anda, descarga un Chrome, Edge o cualquier navegador basado en Chromium. (Excepto Brave, que no funciona con WebGPU)'+
          'Más información: https://webgpureport.org/'
        );
      }
    }
  }

  /**
   * Add documents with pre-computed embeddings (instant loading)
   * Used when loading from database or cache
   */
  loadPrecomputedDocuments(
    documents: Array<{ content: string; embedding: number[]; metadata: any }>,
    progressCallback?: ProgressCallback
  ): void {
    console.log(`📚 Cargando una cantidad de ${documents.length} documentos pre-computados...`);

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];

      this.documents.push({
        id: doc.metadata?.id || generateUUID(),
        content: doc.content,
        embedding: doc.embedding,
        metadata: doc.metadata,
      });

      // Report progress
      const progress = ((i + 1) / documents.length) * 100;
      progressCallback?.(progress, `Cargando ${i + 1}/${documents.length}`);
    }

    console.log(`✅ Loaded ${this.documents.length} documents instantly`);

    // Cache the documents for next time (non-blocking)
    if (this.config?.chatbotId && this.config.enableCache !== false) {
      multiLevelCache.setDocumentEmbeddings(this.config.chatbotId, this.documents).catch((error) => {
        console.warn('⚠️ Failed to cache embeddings:', error);
      });
    }
  }

  /**
   * Add documents to the knowledge base
   * Generates embeddings using the active backend with optimization
   */
  async addDocuments(
    documents: Array<{ content: string; metadata: any }>,
    progressCallback?: ProgressCallback
  ): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('RAG system not initialized');
    }

    console.log(`📚 Adding ${documents.length} documents to knowledge base...`);

    // Check if we have cached embeddings
    if (this.config?.chatbotId && this.config.enableCache !== false) {
      const cached = await multiLevelCache.getDocumentEmbeddings(this.config.chatbotId);
      if (cached && cached.length > 0) {
        console.log(`🎯 Found ${cached.length} cached embeddings, using them instead`);
        this.documents = cached;
        progressCallback?.(100, 'Embeddings cargados desde caché');
        return;
      }
    }

    const totalDocs = documents.length;

    // OPTIMIZATION: Use batch processing for Wllama
    if (this.backend === 'wllama-cpu' && this.wllamaEngine) {
      console.log('🚀 Using batch processing for embeddings...');

      const texts = documents.map((d) => d.content);

      const embeddings = await this.wllamaEngine.generateEmbeddingsBatch(
        texts,
        4, // 4 concurrent embeddings
        (progress, status) => {
          progressCallback?.(progress, status);
        }
      );

      // Add all documents with embeddings
      documents.forEach((doc, i) => {
        this.documents.push({
          id: generateUUID(),
          content: doc.content,
          embedding: embeddings[i],
          metadata: doc.metadata,
        });
      });

      console.log(`✅ Added ${this.documents.length} documents with batch embeddings`);
    } else if (this.backend === 'webllm-gpu' && this.wllamaEmbeddingsEngine) {
      // WebLLM GPU: Use batch processing with Wllama for embeddings
      console.log('🚀 Using batch processing for embeddings (WebLLM mode)...');

      const texts = documents.map((d) => d.content);

      const embeddings = await this.wllamaEmbeddingsEngine.generateEmbeddingsBatch(
        texts,
        4,
        (progress, status) => {
          progressCallback?.(progress, status);
        }
      );

      documents.forEach((doc, i) => {
        this.documents.push({
          id: generateUUID(),
          content: doc.content,
          embedding: embeddings[i],
          metadata: doc.metadata,
        });
      });

      console.log(`✅ Added ${this.documents.length} documents with batch embeddings`);
    } else {
      // Fallback: Sequential processing (HuggingFace or other)
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];

        // Skip empty documents
        if (!doc.content || doc.content.trim().length === 0) {
          console.warn('⚠️ Skipping empty document');
          continue;
        }

        // Check memory pressure every 10 documents
        if (i % 10 === 0) {
          const pressure = memoryMonitor.checkMemoryPressure();
          if (pressure === 'critical') {
            throw new Error(
              `Memoria crítica alcanzada después de ${i} documentos. Reduce el tamaño de la base de conocimiento.`
            );
          }
          if (pressure === 'warning') {
            console.warn('⚠️ Memory warning, triggering GC...');
            await memoryMonitor.triggerGC();
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }

        try {
          const progress = (i / totalDocs) * 100;
          progressCallback?.(progress, `Procesando ${i + 1}/${totalDocs}...`);

          const embedding = await this.generateEmbedding(doc.content);

          this.documents.push({
            id: generateUUID(),
            content: doc.content,
            embedding: embedding,
            metadata: doc.metadata,
          });

          const progressAfter = ((i + 1) / totalDocs) * 100;
          progressCallback?.(progressAfter, `Completado ${i + 1}/${totalDocs}`);
        } catch (error) {
          console.error(`❌ Failed to add document ${i + 1}:`, error);
          continue;
        }
      }

      console.log(`✅ Added ${this.documents.length} documents`);
    }

    // Cache the embeddings for next time (non-blocking)
    if (this.config?.chatbotId && this.config.enableCache !== false) {
      multiLevelCache.setDocumentEmbeddings(this.config.chatbotId, this.documents).catch((error) => {
        console.warn('⚠️ Failed to cache embeddings:', error);
      });
    }

    memoryMonitor.logMemoryStats();
  }

  /**
   * Get all documents with their embeddings (for saving to database)
   */
  getDocumentsWithEmbeddings(): Array<{ content: string; embedding: number[]; metadata: any }> {
    return this.documents.map(doc => ({
      content: doc.content,
      embedding: doc.embedding,
      metadata: doc.metadata,
    }));
  }

  /**
   * Generate embedding for a text using the active backend with scheduler
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Use scheduler to prevent CPU/GPU contention
    if (this.backend === 'huggingface' && this.hfClient) {
      return await this.hfClient.generateEmbedding(text);
    } else if (this.backend === 'webllm-gpu' && this.wllamaEmbeddingsEngine) {
      // Use CPU lock for Wllama embeddings
      return await executionScheduler.withCPULock(async () => {
        return await this.wllamaEmbeddingsEngine!.generateEmbedding(text);
      });
    } else if (this.backend === 'wllama-cpu' && this.wllamaEngine) {
      return await executionScheduler.withCPULock(async () => {
        return await this.wllamaEngine!.generateEmbedding(text);
      });
    } else {
      throw new Error('¡Puta mierda! Si has llegado a este punto, por favor, escribe a contacto@inled.es');
    }
  }

  /**
   * Search for relevant documents using semantic similarity
   */
  async search(query: string, topK: number = 3): Promise<RAGSearchResult[]> {
    if (!this.isInitialized) {
      throw new Error('RAG system not initialized');
    }

    if (this.documents.length === 0) {
      console.warn('⚠️ No hay ni un triste documento en la base de conocimiento');
      return [];
    }

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);

      // Calculate cosine similarity with all documents
      const results = this.documents
        .map((doc) => ({
          document: doc,
          score: this.cosineSimilarity(queryEmbedding, doc.embedding),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      console.log(`🔍 Encontrados ${results.length} documentos relevantes que satisfacen la consulta`);
      return results;
    } catch (error) {
      console.error('❌ Search failed:', error);
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (normA * normB);
  }

  /**
   * Generate response with RAG using the active backend with scheduler
   */
  async generateResponse(
    query: string,
    options: GenerationOptions = {}
  ): Promise<string> {
    if (!this.isInitialized || !this.config) {
      throw new Error('RAG system not initialized');
    }

    console.log('💬 Generando respuesta del RAG...');

    // Step 1: Search for relevant context (uses CPU for embeddings)
    const relevantDocs = await this.search(query, 5); // Aumentado de 3 a 5 para mejor recall

    // Step 2: Build context from relevant documents with scores
    let context = '';
    if (relevantDocs.length > 0) {
      // Filter docs by minimum relevance score (cosine similarity > 0.3)
      const filteredDocs = relevantDocs.filter((r) => r.score > 0.3);

      if (filteredDocs.length > 0) {
        context = filteredDocs
          .map((r, i) => {
            // Include metadata if available
            const metadata = r.document.metadata || {};
            let docText = `[Documento ${i + 1}`;

            if (metadata.type) docText += ` - ${metadata.type}`;
            if (metadata.chunk_index !== undefined) docText += ` - parte ${metadata.chunk_index + 1}`;

            docText += `]:\n${r.document.content}`;
            return docText;
          })
          .join('\n\n---\n\n');

        console.log(`✅ Found ${filteredDocs.length} relevant documents (scores: ${filteredDocs.map(r => r.score.toFixed(2)).join(', ')})`);
      } else {
        console.warn('⚠️ No documents met minimum relevance threshold (0.3)');
      }
    }

    // Step 3: Build prompt with strict instructions
    const personality = this.config.personality || 'Eres un asistente útil.';
    let prompt = '';

    if (context) {
      prompt = `${personality}

INSTRUCCIONES CRÍTICAS:
1. Responde SOLO basándote en la información del contexto proporcionado
2. Si el contexto NO contiene la respuesta, di explícitamente: "No tengo información sobre eso en mi base de conocimiento"
3. NO inventes información ni hagas suposiciones
4. Si solo tienes información parcial, indícalo claramente
5. Cita específicamente qué documento(s) usaste en tu respuesta

CONTEXTO:
${context}

PREGUNTA: ${query}

RESPUESTA (basada ÚNICAMENTE en el contexto):`;
    } else {
      prompt = `${personality}

No tengo información en mi base de conocimiento para responder a: "${query}"

Si tienes preguntas sobre temas que están en mi base de conocimiento, estaré encantado de ayudarte.`;
    }

    // Step 4: Generate response using active backend with scheduler
    const temperature = options.temperature ?? this.config.temperature ?? 0.7;
    const maxTokens = options.maxTokens ?? this.config.maxTokens ?? 512;

    if (this.backend === 'huggingface' && this.hfClient && this.config.modelName) {
      return await this.hfClient.generateText(prompt, this.config.modelName, {
        ...options,
        temperature,
        maxTokens,
      });
    } else if (this.backend === 'webllm-gpu' && this.webllmEngine) {
      // Use GPU lock for WebLLM text generation
      return await executionScheduler.withGPULock(async () => {
        return await this.webllmEngine!.generateText(prompt, {
          ...options,
          temperature,
          maxTokens,
        });
      });
    } else if (this.backend === 'wllama-cpu' && this.wllamaEngine) {
      // Use CPU lock for Wllama text generation
      return await executionScheduler.withCPULock(async () => {
        return await this.wllamaEngine!.generateText(prompt, {
          ...options,
          temperature,
          maxTokens,
        });
      });
    } else {
      throw new Error('No AI backend available for text generation');
    }
  }

  /**
   * Get the currently active backend
   */
  getActiveBackend(): RAGBackend {
    return this.backend;
  }

  /**
   * Get a display name for the active backend
   */
  getBackendDisplayName(): string {
    switch (this.backend) {
      case 'huggingface':
        return 'HuggingFace API';
      case 'webllm-gpu':
        return 'WebLLM (GPU)';
      case 'wllama-cpu':
        return 'Wllama (CPU)';
      default:
        return 'Unknown';
    }
  }

  /**
   * Get device capabilities
   */
  getDeviceCapabilities(): DeviceCapabilities | null {
    return this.deviceCapabilities;
  }

  /**
   * Get document count
   */
  getDocumentCount(): number {
    return this.documents.length;
  }

  /**
   * Clear all documents
   */
  clearDocuments(): void {
    this.documents = [];
    console.log('🗑️ Cleared all documents');
  }

  /**
   * Check if system is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Reset the entire system
   */
  async reset(): Promise<void> {
    console.log('🔄 Resetting Hybrid RAG System...');

    this.documents = [];
    this.isInitialized = false;
    this.config = null;

    if (this.webllmEngine) {
      await this.webllmEngine.reset();
      this.webllmEngine = null;
    }

    if (this.wllamaEngine) {
      await this.wllamaEngine.reset();
      this.wllamaEngine = null;
    }

    if (this.wllamaEmbeddingsEngine) {
      await this.wllamaEmbeddingsEngine.reset();
      this.wllamaEmbeddingsEngine = null;
    }

    this.hfClient = null;
    this.deviceCapabilities = null;

    console.log('✅ Hybrid RAG System reset');
  }
}

// Re-export utilities from old rag.ts for compatibility
export { chunkText, processPdfFromUrl };

// Export new semantic chunking
export { semanticChunkText, formatChunkWithContext } from './semantic-chunking';
