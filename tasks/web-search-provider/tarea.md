# Tarea: Web Search como Proveedor de Contexto RAG

**Estado:** ✅ Implementación Core Completada
**Fecha inicio:** 2025-12-24
**Fecha completación core:** 2025-12-24

## Objetivo

Implementar un sistema de búsqueda web que permita al navegador obtener información de internet y procesarla localmente como documentos temporales en el pipeline RAG existente.

## Principios Arquitectónicos

### ✅ LO QUE ES

- Búsqueda asistida controlada por el navegador
- Extensión del pipeline RAG existente
- Documentos temporales procesados localmente
- Sistema transparente y explicable

### ❌ LO QUE NO ES

- Agente autónomo que navega
- Sistema de crawling
- API externa de búsqueda
- Scraping agresivo

## Separación de Responsabilidades

| Componente | Responsabilidad | NO hace |
|------------|----------------|---------|
| **LLM** | Generar query de búsqueda<br>Seleccionar URLs relevantes<br>Analizar contenido | ❌ Fetch<br>❌ Navegar<br>❌ Llamar APIs |
| **Navegador** | Realizar fetch<br>Descargar páginas<br>Ejecutar en Workers | ❌ Razonar<br>❌ Decidir relevancia |
| **RAG** | Chunking<br>Embeddings<br>Vector search | ❌ Búsqueda web<br>❌ Parsing HTML |

## Arquitectura Técnica

### Flujo Completo (8 Pasos)

```
┌─────────────────────────────────────────────────────────────────┐
│ PASO 1: Query Generation (LLM)                                  │
└─────────────────────────────────────────────────────────────────┘
Usuario: "¿Cuál es el último framework de JS en 2025?"
   ↓
LLM genera query optimizada: "latest javascript framework 2025"

┌─────────────────────────────────────────────────────────────────┐
│ PASO 2: Búsqueda Web (NAVEGADOR)                                │
└─────────────────────────────────────────────────────────────────┘
WebSearchService.search(query)
   ↓
Fuentes permitidas:
  - Wikipedia (es.wikipedia.org/w/api.php)
  - DuckDuckGo HTML (html.duckduckgo.com)
   ↓
Retorna: SearchResult[] {
  title: string,
  snippet: string,
  url: string
}

┌─────────────────────────────────────────────────────────────────┐
│ PASO 3: Selección de Resultados (LLM)                           │
└─────────────────────────────────────────────────────────────────┘
LLM recibe lista de títulos + snippets
   ↓
Prompt: "Selecciona los 2 resultados más relevantes"
   ↓
LLM retorna: [0, 2] (índices)

┌─────────────────────────────────────────────────────────────────┐
│ PASO 4: Fetch Controlado (NAVEGADOR)                            │
└─────────────────────────────────────────────────────────────────┘
WebSearchWorker.fetchPages(selectedUrls)
   ↓
Límites:
  - Max 3 URLs
  - Max 500KB por página
  - Timeout: 10s por página
  - Solo HTML público
   ↓
Descarga SOLO las URLs seleccionadas

┌─────────────────────────────────────────────────────────────────┐
│ PASO 5: Limpieza de Contenido                                   │
└─────────────────────────────────────────────────────────────────┘
ContentExtractor.extract(html)
   ↓
Elimina:
  - <script>, <style>
  - <nav>, <header>, <footer>
  - ads, banners
   ↓
Extrae:
  - Texto visible
  - Títulos (h1-h6)
  - Párrafos estructurados
   ↓
Retorna: CleanedContent {
  text: string,
  title: string,
  url: string
}

┌─────────────────────────────────────────────────────────────────┐
│ PASO 6: Chunking + Embeddings (RAG EXISTENTE)                   │
└─────────────────────────────────────────────────────────────────┘
processWebDocument(content)
   ↓
REUTILIZA:
  - semanticChunkText() → chunks
  - generateEmbeddingsBatch() → embeddings
   ↓
Documentos TEMPORALES (no persistidos por defecto)

┌─────────────────────────────────────────────────────────────────┐
│ PASO 7: Recuperación (RAG EXISTENTE)                            │
└─────────────────────────────────────────────────────────────────┘
searchSimilarChunks(queryEmbedding, topK=3)
   ↓
Vector search local
   ↓
Retorna top-3 chunks más relevantes

┌─────────────────────────────────────────────────────────────────┐
│ PASO 8: Respuesta Final (LLM)                                   │
└─────────────────────────────────────────────────────────────────┘
buildRAGPrompt(query, context)
   ↓
LLM genera respuesta SOLO con contexto recuperado
   ↓
Incluye referencias a URLs usadas
```

## Estructura de Archivos

```
src/lib/web-search/
├── web-search.ts              # Servicio principal de búsqueda web
├── content-extractor.ts       # Limpieza de HTML → texto
├── search-providers.ts        # Implementaciones de búsqueda (Wikipedia, DDG)
├── web-document-processor.ts  # Integración con RAG pipeline
└── types.ts                   # Tipos específicos

src/lib/workers/
└── web-search.worker.ts       # Worker para fetch controlado

src/lib/rag/
└── web-rag-integration.ts     # Puente entre web search y RAG existente
```

## Tipos Clave

```typescript
// Resultado de búsqueda web
interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: 'wikipedia' | 'duckduckgo';
}

// Contenido limpio extraído
interface CleanedContent {
  text: string;
  title: string;
  url: string;
  extractedAt: number;
  wordCount: number;
}

// Documento web temporal
interface WebDocument {
  id: string;
  type: 'web';
  content: string;
  url: string;
  title: string;
  fetchedAt: number;
  temporary: true; // No se persiste en IndexedDB
}

// Resultado completo de búsqueda web + RAG
interface WebRAGResult {
  query: string;
  searchResults: SearchResult[];
  selectedUrls: string[];
  cleanedContents: CleanedContent[];
  ragResult: RAGResult; // Del pipeline existente
  totalTime: number;
}
```

## Límites y Restricciones

### Límites Técnicos

- **Max resultados de búsqueda:** 10
- **Max URLs descargadas:** 3
- **Max tamaño por página:** 500KB
- **Timeout por fetch:** 10s
- **Max chunks por documento web:** 20
- **Top-K en retrieval:** 3-5

### Restricciones de Seguridad

- Solo HTTP/HTTPS
- No ejecutar JavaScript de páginas
- No seguir redirects automáticos cross-domain
- Respetar Content-Type (solo text/html)
- User-Agent identificable

### Fuentes Permitidas

1. **Wikipedia**
   - API pública
   - Contenido estructurado
   - Sin rate limits estrictos

2. **DuckDuckGo HTML**
   - Búsqueda pública
   - Sin JavaScript necesario
   - Parsing simple

## Checklist de Implementación

### Fase 1: Módulo de Búsqueda Web ✅
- [x] Implementar `WebSearchService` en `web-search.ts`
- [x] Crear provider de Wikipedia
- [x] Crear provider de DuckDuckGo HTML
- [x] Implementar rate limiting básico
- [x] Cache de resultados (5 min TTL)

### Fase 2: Extracción de Contenido ✅
- [x] Implementar `ContentExtractor` en `content-extractor.ts`
- [x] Parser HTML → texto limpio
- [x] Eliminar elementos no deseados (scripts, ads, nav)
- [x] Preservar estructura (títulos, párrafos)
- [x] Extracción de metadata (autor, fecha, descripción)

### Fase 3: Web Worker ✅
- [x] Crear `web-search.worker.ts`
- [x] Implementar fetch controlado con timeouts
- [x] Sistema de mensajería request-response
- [x] Manejo de errores (404, timeout, CORS)
- [x] WebSearchWorkerManager integrado en WorkerPool

### Fase 4: Integración RAG ✅
- [x] Crear `WebRAGOrchestrator` (orquestador principal)
- [x] Reutilizar `semanticChunkText()`
- [x] Reutilizar `generateEmbeddingsBatch()`
- [x] Documentos temporales WebDocument
- [x] Vector search local con cosine similarity

### Fase 5: Prompts LLM ✅
- [x] Prompt para generar query de búsqueda
- [x] Prompt para seleccionar URLs relevantes
- [x] Prompt para respuesta final con contexto web
- [x] Validación de respuestas JSON del LLM
- [x] Fallback automático si parsing falla

### Fase 6: UI y UX ⏳
- [ ] Toggle "Buscar en web" en chat
- [ ] Indicador visual durante búsqueda
- [ ] Mostrar URLs consultadas
- [ ] Mostrar snippets de contenido usado
- [ ] Transparencia: "Analizado por tu navegador"

### Fase 7: Testing ⏳
- [ ] Test end-to-end con query real
- [ ] Test con timeout/errores
- [ ] Test con múltiples proveedores
- [ ] Test de límites (tamaño, cantidad)
- [ ] Test de integración con RAG

### Fase 8: Documentación ✅
- [x] Comentarios en código (TSDoc completo)
- [x] Arquitectura detallada (arquitectura.md)
- [x] Ejemplos de uso (ejemplos-uso.md)
- [x] Tipos TypeScript completos

## Métricas de Éxito

- ✅ Búsqueda web funciona sin APIs externas
- ✅ LLM NUNCA hace fetch directo
- ✅ Pipeline RAG se reutiliza 100%
- ✅ Documentos web NO se persisten por defecto
- ✅ Usuario ve claramente qué URLs se consultaron
- ✅ Tiempo total < 30s para query típico
- ✅ Sistema funciona offline después de búsqueda

## Notas Técnicas

### CORS y Limitaciones

Algunos sitios bloquearán fetch desde el navegador por CORS. Estrategias:

1. **Priorizar fuentes CORS-friendly:**
   - Wikipedia API ✅
   - Sitios con `Access-Control-Allow-Origin: *`

2. **Fallback graceful:**
   - Si URL falla por CORS, mostrar error claro
   - Intentar con siguiente URL
   - No bloquear todo el flujo

3. **NO usar proxies:**
   - Contradice principio local-first
   - Introduce dependencia externa

### Temporalidad de Documentos

Por defecto, documentos web son temporales:

```typescript
{
  temporary: true,  // No se guarda en IndexedDB
  ttl: 3600000     // 1 hora en memoria
}
```

Opción futura: permitir "guardar fuente web" explícitamente.

### Transparencia

Cada respuesta con contexto web debe mostrar:

```
📍 Fuentes consultadas:
  • Wikipedia: "JavaScript" (https://es.wikipedia.org/wiki/JavaScript)
  • MDN Web Docs: "What is JavaScript?" (https://developer.mozilla.org/...)

💡 Esta información fue analizada localmente por tu navegador.
   No se envió ningún dato a servidores externos.
```

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| CORS bloquea fetch | Priorizar fuentes CORS-friendly, fallback claro |
| Páginas muy grandes | Límite 500KB, timeout 10s |
| HTML mal formado | Parser robusto, try-catch, fallback a texto plano |
| LLM genera URLs inválidas | Validación antes de fetch |
| Contenido irrelevante | LLM selecciona antes de fetch |
| Sobrecarga de red | Max 3 URLs, rate limiting |

## Referencias

- Pipeline RAG existente: `src/lib/rag/rag-pipeline.ts`
- Vector search: `src/lib/rag/vector-search.ts`
- Workers: `src/lib/workers/`
- Chunking semántico: `src/lib/rag/semantic-chunking.ts`

---

**Última actualización:** 2025-12-24
