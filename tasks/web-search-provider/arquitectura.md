# Arquitectura Detallada: Web Search Provider

## Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI LAYER                                 │
│  (Chat Interface con toggle "Buscar en web")                    │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ORCHESTRATOR LAYER                             │
│                                                                  │
│  WebRAGOrchestrator                                              │
│  ├─ Coordina flujo completo (8 pasos)                           │
│  ├─ Maneja estado de búsqueda                                   │
│  └─ Reporta progreso a UI                                       │
└────┬──────────┬──────────┬──────────┬──────────┬────────────────┘
     │          │          │          │          │
     ▼          ▼          ▼          ▼          ▼
┌─────────┐ ┌────────┐ ┌────────┐ ┌──────┐ ┌─────────────┐
│   LLM   │ │  Web   │ │Content │ │ RAG  │ │   Worker    │
│ Engine  │ │ Search │ │Extract │ │Engine│ │   Manager   │
│         │ │Service │ │        │ │      │ │             │
└─────────┘ └────────┘ └────────┘ └──────┘ └─────────────┘
     │          │          │          │          │
     │          │          │          │          ▼
     │          │          │          │    ┌──────────────┐
     │          │          │          │    │ Web Search   │
     │          │          │          │    │   Worker     │
     │          │          │          │    └──────────────┘
     │          │          │          │
     │          ▼          │          │
     │    ┌──────────────┐ │          │
     │    │Search Provider│ │          │
     │    │  Wikipedia   │ │          │
     │    │  DuckDuckGo  │ │          │
     │    └──────────────┘ │          │
     │                     │          │
     ▼                     ▼          ▼
┌──────────────────────────────────────────┐
│         EXISTING RAG PIPELINE            │
│  ├─ Semantic Chunking                   │
│  ├─ Embedding Generation (WllamaEngine) │
│  ├─ Vector Search (Cosine Similarity)   │
│  └─ Context Building                    │
└──────────────────────────────────────────┘
```

## Interfaces Principales

### 1. WebRAGOrchestrator

**Responsabilidad:** Coordinar el flujo completo de búsqueda web + RAG

```typescript
class WebRAGOrchestrator {
  constructor(
    private llmEngine: LLMEngine,
    private embeddingEngine: WllamaEngine,
    private webSearchService: WebSearchService,
    private contentExtractor: ContentExtractor
  ) {}

  /**
   * Ejecuta búsqueda web + RAG completo
   */
  async search(
    userQuery: string,
    options: WebSearchOptions = {}
  ): Promise<WebRAGResult> {
    // PASO 1: LLM genera query de búsqueda
    const searchQuery = await this.generateSearchQuery(userQuery);

    // PASO 2: Búsqueda web (navegador)
    const searchResults = await this.webSearchService.search(searchQuery, {
      maxResults: 10,
      sources: options.sources || ['wikipedia', 'duckduckgo']
    });

    // PASO 3: LLM selecciona URLs relevantes
    const selectedIndices = await this.selectRelevantResults(
      userQuery,
      searchResults
    );

    // PASO 4: Fetch controlado (worker)
    const selectedUrls = selectedIndices.map(i => searchResults[i].url);
    const fetchedPages = await this.fetchPages(selectedUrls);

    // PASO 5: Limpieza de contenido
    const cleanedContents = await Promise.all(
      fetchedPages.map(page => this.contentExtractor.extract(page.html))
    );

    // PASO 6: Chunking + embeddings (RAG pipeline)
    const webDocuments = await this.processWebDocuments(cleanedContents);

    // PASO 7: Vector search
    const queryEmbedding = await this.embeddingEngine.generateEmbedding(userQuery);
    const ragResult = await searchSimilarChunks(queryEmbedding, 5);

    // PASO 8: Generación de respuesta
    const answer = await this.generateAnswer(userQuery, ragResult);

    return {
      query: userQuery,
      searchQuery,
      searchResults,
      selectedUrls,
      cleanedContents,
      ragResult,
      answer,
      metadata: {
        totalTime,
        sourcesUsed: selectedUrls.length
      }
    };
  }

  private async generateSearchQuery(userQuery: string): Promise<string> {
    const prompt = `Eres un asistente experto en crear consultas de búsqueda web.

Convierte la siguiente pregunta del usuario en una consulta de búsqueda corta y efectiva (máximo 5-7 palabras).

Reglas:
- Usa palabras clave relevantes
- Elimina palabras de relleno
- Incluye el año si es relevante
- En inglés si es contenido técnico

Pregunta: ${userQuery}

Consulta de búsqueda:`;

    const response = await this.llmEngine.generateText(prompt, {
      temperature: 0.3,
      max_tokens: 50,
      stream: false
    });

    return response.trim().replace(/["']/g, '');
  }

  private async selectRelevantResults(
    userQuery: string,
    results: SearchResult[]
  ): Promise<number[]> {
    const resultsText = results
      .map((r, i) => `[${i}] ${r.title}\n${r.snippet}`)
      .join('\n\n');

    const prompt = `Eres un asistente que selecciona fuentes relevantes.

Pregunta del usuario: ${userQuery}

Resultados de búsqueda disponibles:
${resultsText}

Selecciona los 2-3 resultados MÁS relevantes que ayudarían a responder la pregunta.

Responde SOLO con los índices en formato JSON:
{"indices": [0, 2]}`;

    const response = await this.llmEngine.generateText(prompt, {
      temperature: 0.1,
      max_tokens: 50,
      stream: false
    });

    // Parse JSON y extrae índices
    const parsed = JSON.parse(response.match(/\{.*\}/)?.[0] || '{"indices":[]}');
    return parsed.indices.slice(0, 3); // Max 3 URLs
  }

  private async fetchPages(urls: string[]): Promise<FetchedPage[]> {
    const worker = WorkerPool.getWebSearchWorker();
    return await worker.fetchPages(urls, {
      maxSize: 500 * 1024, // 500KB
      timeout: 10000 // 10s
    });
  }

  private async processWebDocuments(
    contents: CleanedContent[]
  ): Promise<WebDocument[]> {
    const documents: WebDocument[] = [];

    for (const content of contents) {
      // Chunking semántico (reutiliza pipeline existente)
      const chunks = await semanticChunkText(content.text, {
        maxChunkSize: 800,
        overlapSize: 100
      });

      // Generar embeddings
      const texts = chunks.map(c => c.content);
      const embeddings = await this.embeddingEngine.generateEmbeddingsBatch(
        texts,
        4 // maxConcurrent
      );

      // Crear documento web temporal
      const webDoc: WebDocument = {
        id: `web-${Date.now()}-${Math.random()}`,
        type: 'web',
        url: content.url,
        title: content.title,
        content: content.text,
        chunks: chunks.map((chunk, i) => ({
          ...chunk,
          embedding: embeddings[i]
        })),
        temporary: true,
        fetchedAt: Date.now()
      };

      documents.push(webDoc);
    }

    return documents;
  }

  private async generateAnswer(
    query: string,
    ragResult: RAGResult
  ): Promise<string> {
    const context = createRAGContext(ragResult.chunks);
    const prompt = buildRAGPrompt(query, context);

    return await this.llmEngine.generateText(prompt, {
      temperature: 0.7,
      max_tokens: 512,
      stream: false
    });
  }
}
```

### 2. WebSearchService

**Responsabilidad:** Coordinar búsquedas entre múltiples proveedores

```typescript
interface SearchProvider {
  name: 'wikipedia' | 'duckduckgo';
  search(query: string, maxResults: number): Promise<SearchResult[]>;
  isAvailable(): Promise<boolean>;
}

class WebSearchService {
  private providers: Map<string, SearchProvider> = new Map();

  constructor() {
    this.providers.set('wikipedia', new WikipediaSearchProvider());
    this.providers.set('duckduckgo', new DuckDuckGoSearchProvider());
  }

  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      maxResults = 10,
      sources = ['wikipedia', 'duckduckgo']
    } = options;

    const results: SearchResult[] = [];

    // Intentar con cada proveedor
    for (const sourceName of sources) {
      const provider = this.providers.get(sourceName);
      if (!provider) continue;

      try {
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) continue;

        const sourceResults = await provider.search(query, maxResults);
        results.push(...sourceResults);

        // Detener si ya tenemos suficientes
        if (results.length >= maxResults) break;
      } catch (error) {
        console.warn(`Provider ${sourceName} failed:`, error);
        // Continuar con siguiente proveedor
      }
    }

    // Deduplicar por URL
    const unique = Array.from(
      new Map(results.map(r => [r.url, r])).values()
    );

    return unique.slice(0, maxResults);
  }
}
```

### 3. WikipediaSearchProvider

**Responsabilidad:** Búsqueda en Wikipedia API

```typescript
class WikipediaSearchProvider implements SearchProvider {
  name = 'wikipedia' as const;
  private baseUrl = 'https://es.wikipedia.org/w/api.php';

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      action: 'opensearch',
      search: query,
      limit: String(maxResults),
      format: 'json',
      origin: '*' // CORS
    });

    const response = await fetch(`${this.baseUrl}?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Wikipedia API error: ${response.status}`);
    }

    // Formato: [query, [titles], [descriptions], [urls]]
    const [, titles, snippets, urls] = await response.json();

    return titles.map((title: string, i: number) => ({
      title,
      snippet: snippets[i] || '',
      url: urls[i],
      source: 'wikipedia' as const
    }));
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

### 4. ContentExtractor

**Responsabilidad:** Limpiar HTML → texto estructurado

```typescript
class ContentExtractor {
  /**
   * Extrae contenido limpio de HTML
   */
  extract(html: string, url: string): CleanedContent {
    // Crear DOM temporal
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Eliminar elementos no deseados
    this.removeUnwantedElements(doc);

    // Extraer título
    const title = this.extractTitle(doc);

    // Extraer contenido principal
    const text = this.extractMainContent(doc);

    return {
      text,
      title,
      url,
      extractedAt: Date.now(),
      wordCount: text.split(/\s+/).length
    };
  }

  private removeUnwantedElements(doc: Document): void {
    const selectors = [
      'script',
      'style',
      'nav',
      'header',
      'footer',
      'aside',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="complementary"]',
      '.ad',
      '.advertisement',
      '.sidebar',
      '.cookie-notice'
    ];

    selectors.forEach(selector => {
      doc.querySelectorAll(selector).forEach(el => el.remove());
    });
  }

  private extractTitle(doc: Document): string {
    // Prioridad: h1 > title > og:title
    const h1 = doc.querySelector('h1')?.textContent?.trim();
    if (h1) return h1;

    const title = doc.querySelector('title')?.textContent?.trim();
    if (title) return title;

    const ogTitle = doc.querySelector('meta[property="og:title"]')
      ?.getAttribute('content')?.trim();
    if (ogTitle) return ogTitle;

    return 'Sin título';
  }

  private extractMainContent(doc: Document): string {
    // Intentar encontrar contenido principal
    const mainSelectors = [
      'main',
      'article',
      '[role="main"]',
      '#content',
      '.content',
      '#main',
      '.main'
    ];

    for (const selector of mainSelectors) {
      const main = doc.querySelector(selector);
      if (main) {
        return this.nodeToText(main);
      }
    }

    // Fallback: todo el body
    return this.nodeToText(doc.body);
  }

  private nodeToText(node: Node): string {
    const walker = document.createTreeWalker(
      node,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            return NodeFilter.FILTER_ACCEPT;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = (node as Element).tagName.toLowerCase();
            // Agregar saltos de línea en ciertos elementos
            if (['p', 'br', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(tag)) {
              return NodeFilter.FILTER_ACCEPT;
            }
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    const parts: string[] = [];
    let currentNode: Node | null;

    while (currentNode = walker.nextNode()) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        const text = currentNode.textContent?.trim();
        if (text) parts.push(text);
      } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
        const tag = (currentNode as Element).tagName.toLowerCase();
        if (['p', 'br', 'div', 'li'].includes(tag)) {
          parts.push('\n');
        } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
          parts.push('\n\n');
        }
      }
    }

    // Limpiar múltiples espacios/saltos
    return parts
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\n\s+\n/g, '\n\n')
      .trim();
  }
}
```

### 5. WebSearchWorker

**Responsabilidad:** Fetch controlado en background thread

```typescript
// web-search.worker.ts
import { WorkerMessageHandler } from './worker-manager';

interface FetchPageRequest {
  url: string;
  maxSize: number;
  timeout: number;
}

interface FetchPageResponse {
  url: string;
  html: string;
  size: number;
  fetchTime: number;
  status: number;
}

const handler: WorkerMessageHandler = {
  async fetchPages(payload: {
    urls: string[];
    maxSize: number;
    timeout: number;
  }): Promise<FetchPageResponse[]> {
    const results = await Promise.allSettled(
      payload.urls.map(url =>
        this.fetchPage({
          url,
          maxSize: payload.maxSize,
          timeout: payload.timeout
        })
      )
    );

    return results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<FetchPageResponse>).value);
  },

  async fetchPage(request: FetchPageRequest): Promise<FetchPageResponse> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeout);

    try {
      const response = await fetch(request.url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'EdgeAI/1.0 (Local Browser Agent)'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Verificar Content-Type
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      // Leer con límite de tamaño
      const reader = response.body!.getReader();
      const chunks: Uint8Array[] = [];
      let totalSize = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalSize += value.length;
        if (totalSize > request.maxSize) {
          reader.cancel();
          throw new Error(`Response too large: ${totalSize} bytes`);
        }

        chunks.push(value);
      }

      // Combinar chunks
      const allChunks = new Uint8Array(totalSize);
      let position = 0;
      for (const chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
      }

      // Decodificar
      const decoder = new TextDecoder();
      const html = decoder.decode(allChunks);

      return {
        url: request.url,
        html,
        size: totalSize,
        fetchTime: Date.now() - startTime,
        status: response.status
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
};

// Registrar handler
self.onmessage = async (event) => {
  const { id, type, payload } = event.data;

  try {
    const result = await handler[type](payload);
    self.postMessage({
      id,
      type: 'success',
      payload: result
    });
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
```

## Flujo de Datos

### Request Flow (Usuario → Respuesta)

```
1. Usuario escribe: "¿Qué es WebGPU?"
   ↓
2. UI marca "buscar en web" = true
   ↓
3. WebRAGOrchestrator.search("¿Qué es WebGPU?")
   ↓
4. LLM genera query: "WebGPU API specification 2025"
   ↓
5. WebSearchService.search("WebGPU API specification 2025")
   ├─→ WikipediaSearchProvider → 5 resultados
   └─→ DuckDuckGoSearchProvider → 5 resultados
   ↓
6. LLM selecciona índices: [0, 3] (2 URLs)
   ↓
7. WebSearchWorker.fetchPages([url0, url3])
   ├─→ Fetch url0 → 250KB HTML (OK)
   └─→ Fetch url3 → Timeout (skip)
   ↓
8. ContentExtractor.extract(html) → texto limpio
   ↓
9. semanticChunkText(texto) → 15 chunks
   ↓
10. generateEmbeddingsBatch([...chunks]) → 15 embeddings
   ↓
11. Crear WebDocument temporal (no persistir)
   ↓
12. searchSimilarChunks(query embedding, topK=5)
   ↓
13. createRAGContext(top 5 chunks)
   ↓
14. LLM genera respuesta con contexto
   ↓
15. Respuesta + metadata de fuentes → UI
```

## Consideraciones de Performance

### Tiempos Estimados

| Paso | Operación | Tiempo Típico |
|------|-----------|---------------|
| 1 | Generar query (LLM) | ~1s |
| 2 | Búsqueda web (API) | ~2s |
| 3 | Selección URLs (LLM) | ~1s |
| 4 | Fetch páginas (2-3) | ~3-5s |
| 5 | Extracción contenido | ~500ms |
| 6 | Chunking | ~200ms |
| 7 | Embeddings (15 chunks) | ~3s |
| 8 | Vector search | ~100ms |
| 9 | Generación respuesta | ~2-3s |
| **TOTAL** | | **~13-16s** |

### Optimizaciones

1. **Paralelización:**
   - Fetch múltiples URLs en paralelo
   - Chunking y embeddings en worker

2. **Caching:**
   - Cache de búsquedas recientes (5 min)
   - Cache de contenido limpio (1 hora)

3. **Early stopping:**
   - Si Wikipedia da 3 buenos resultados, skip DuckDuckGo
   - Si 2 URLs se descargan bien, skip 3ra

4. **Feedback progresivo:**
   - Reportar cada paso a UI
   - Mostrar snippets mientras se procesa

## Seguridad y Privacidad

### Validaciones

```typescript
// Antes de fetch
function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Solo HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Blacklist de dominios peligrosos
    const blacklist = ['localhost', '127.0.0.1', '0.0.0.0'];
    if (blacklist.some(b => parsed.hostname.includes(b))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
```

### Content Security Policy

```typescript
// No ejecutar JavaScript de páginas descargadas
// DOMParser crea documento inerte (sin scripts)
const parser = new DOMParser();
const doc = parser.parseFromString(html, 'text/html');
// → Scripts NO se ejecutan
```

### Rate Limiting

```typescript
class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  canRequest(domain: string, maxPerMinute: number = 10): boolean {
    const now = Date.now();
    const domainRequests = this.requests.get(domain) || [];

    // Limpiar requests > 1 minuto
    const recent = domainRequests.filter(t => now - t < 60000);

    if (recent.length >= maxPerMinute) {
      return false;
    }

    recent.push(now);
    this.requests.set(domain, recent);
    return true;
  }
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('ContentExtractor', () => {
  it('should extract clean text from Wikipedia HTML', async () => {
    const html = await readFile('fixtures/wikipedia-webgpu.html');
    const result = contentExtractor.extract(html, 'https://...');

    expect(result.text).not.toContain('<script');
    expect(result.text).not.toContain('Cookie');
    expect(result.wordCount).toBeGreaterThan(100);
  });
});

describe('WikipediaSearchProvider', () => {
  it('should return search results', async () => {
    const provider = new WikipediaSearchProvider();
    const results = await provider.search('WebGPU', 5);

    expect(results).toHaveLength(5);
    expect(results[0]).toHaveProperty('title');
    expect(results[0]).toHaveProperty('url');
  });
});
```

### Integration Tests

```typescript
describe('WebRAGOrchestrator', () => {
  it('should complete full web search + RAG flow', async () => {
    const orchestrator = new WebRAGOrchestrator(/* ... */);

    const result = await orchestrator.search('What is WebGPU?', {
      sources: ['wikipedia']
    });

    expect(result.answer).toBeTruthy();
    expect(result.selectedUrls.length).toBeGreaterThan(0);
    expect(result.ragResult.chunks.length).toBeGreaterThan(0);
  }, 30000); // 30s timeout
});
```

## Próximos Pasos

1. ✅ Diseño arquitectónico completo
2. ⏭️ Implementar tipos en `src/lib/web-search/types.ts`
3. ⏭️ Implementar `WebSearchService`
4. ⏭️ Implementar `ContentExtractor`
5. ⏭️ Implementar `WebSearchWorker`
6. ⏭️ Implementar `WebRAGOrchestrator`
7. ⏭️ Integración con UI
8. ⏭️ Testing end-to-end
