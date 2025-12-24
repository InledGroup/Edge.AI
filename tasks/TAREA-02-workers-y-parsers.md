# Tarea 2: Workers y Document Parsers

## Objetivo
Implementar Web Workers para procesamiento pesado (embeddings, chunking, search) y parsers para documentos (PDF, TXT, MD). Esto asegura que la UI nunca se bloquee durante operaciones intensivas.

## Arquitectura de Workers

```
Main Thread (UI)
    ↓ postMessage
Worker Thread (Heavy Processing)
    ↓ Result
Main Thread (Update UI)
```

## Archivos a Crear

### Workers
- `src/lib/workers/embedding.worker.ts` - Generar embeddings
- `src/lib/workers/chunking.worker.ts` - Procesar chunks
- `src/lib/workers/search.worker.ts` - Búsqueda vectorial

### Parsers
- `src/lib/parsers/pdf.ts` - Extraer texto de PDF
- `src/lib/parsers/txt.ts` - Procesar archivos TXT
- `src/lib/parsers/markdown.ts` - Procesar Markdown

### Manager
- `src/lib/workers/worker-manager.ts` - Gestionar workers

## Checklist de Progreso

### Fase 2.1: Document Parsers
- [ ] Implementar parser de TXT (simple)
- [ ] Implementar parser de Markdown (usando marked)
- [ ] Implementar parser de PDF (usando pdfjs-dist)
- [ ] Crear función unificada `parseDocument(file, type)`
- [ ] Testear con documentos reales

### Fase 2.2: Web Workers Base
- [ ] Crear estructura base de workers
- [ ] Implementar sistema de mensajería (Request/Response)
- [ ] Crear WorkerManager para gestión del ciclo de vida
- [ ] Implementar embedding.worker.ts
- [ ] Implementar chunking.worker.ts
- [ ] Implementar search.worker.ts

### Fase 2.3: Integración
- [ ] Adaptar rag-pipeline.ts para usar workers
- [ ] Crear hooks de progreso
- [ ] Implementar cancelación de tareas
- [ ] Testear procesamiento completo

## Especificaciones Técnicas

### Embedding Worker
```typescript
// Input
{
  type: 'generate-embeddings',
  texts: string[],
  modelUrl: string
}

// Output
{
  type: 'embeddings-complete',
  embeddings: Float32Array[],
  progress: number
}
```

### Chunking Worker
```typescript
// Input
{
  type: 'chunk-document',
  documentId: string,
  text: string,
  chunkSize: number
}

// Output
{
  type: 'chunks-complete',
  chunks: Chunk[]
}
```

### Search Worker
```typescript
// Input
{
  type: 'search-similar',
  queryEmbedding: Float32Array,
  topK: number
}

// Output
{
  type: 'search-complete',
  results: RetrievedChunk[]
}
```

## Consideraciones

### PDF Parser
- Usar `pdfjs-dist` con worker de PDF.js
- Extraer texto página por página
- Mantener metadatos de página

### Workers
- Transferable objects para Float32Array (evitar copias)
- Progress reporting cada 10%
- Timeout de 5min para operaciones largas
- Manejo de errores robusto

### Astro + Workers
- Workers deben estar en `/public` o usar Vite worker import
- Usar `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`

## Criterios de Finalización

✅ Parsers implementados y testeados para PDF, TXT, MD
✅ Workers funcionando correctamente
✅ WorkerManager gestiona lifecycle
✅ Progreso reportado correctamente
✅ UI nunca se bloquea durante procesamiento
✅ Proyecto compila sin errores

---

**Estado:** ✅ Completada
**Tarea Anterior:** TAREA-01-arquitectura-base.md
**Siguiente Tarea:** TAREA-03-ui-components.md

## Resultados

✅ **Parsers Implementados:**
- txt.ts - Parser de texto plano con limpieza
- markdown.ts - Parser MD con preservación de formato + frontmatter extraction
- pdf.ts - Parser PDF con pdf.js, soporte multi-página con metadata
- index.ts - API unificada con validación y detección automática de tipo

✅ **Web Workers Implementados:**
- worker-types.ts - Tipos compartidos para mensajería
- worker-manager.ts - Gestor genérico con timeout, progress, error handling
- embedding.worker.ts - Generación de embeddings en background
- chunking.worker.ts - Procesamiento de chunks no-bloqueante
- search.worker.ts - Búsqueda vectorial en background
- index.ts - WorkerPool singleton para reutilización

✅ **Características:**
- Sistema de mensajería tipado Request/Response
- Progress reporting en tiempo real
- Timeout de 10min para operaciones largas
- Transferable objects para optimización
- Manejo robusto de errores
- Build exitoso sin errores TypeScript
