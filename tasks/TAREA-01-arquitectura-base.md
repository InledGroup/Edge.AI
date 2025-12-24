# Tarea 1: Arquitectura Base y Estado Local

## Objetivo
Establecer la estructura del proyecto Astro, definir la arquitectura del sistema de persistencia local (IndexedDB) y crear el esquema de datos para embeddings, documentos y conversaciones.

## Decisiones Técnicas

### Framework Islands: **Preact**
**Justificación:**
- Bundle size: ~3KB vs ~40KB de React
- API idéntica a React (compatible con código existente)
- Mejor para aplicaciones local-first (menos overhead)
- Hidratación más rápida en islands
- El usuario ya carga modelos LLM pesados, cada KB cuenta

### Wrapper IndexedDB: **idb**
**Justificación:**
- Lightweight (~1KB)
- API moderna basada en Promises
- Mantenido por Google Chrome team
- Más simple que Dexie para nuestro caso de uso

## Archivos a Crear/Modificar

### Estructura del Proyecto
```
/
├── src/
│   ├── components/          # Preact islands
│   │   ├── Chat.tsx
│   │   ├── DocumentUpload.tsx
│   │   └── ModelSelector.tsx
│   ├── lib/
│   │   ├── db/             # IndexedDB layer
│   │   │   ├── schema.ts
│   │   │   ├── documents.ts
│   │   │   ├── embeddings.ts
│   │   │   └── conversations.ts
│   │   ├── rag/            # RAG pipeline (del código existente)
│   │   │   ├── chunking.ts
│   │   │   ├── embeddings.ts
│   │   │   └── search.ts
│   │   ├── ai/             # IA engines
│   │   │   ├── webllm-engine.ts     # reutilizar
│   │   │   ├── wllama-engine.ts     # reutilizar
│   │   │   └── model-selector.ts    # reutilizar
│   │   └── workers/        # Web Workers
│   │       ├── embedding.worker.ts
│   │       ├── chunking.worker.ts
│   │       └── search.worker.ts
│   ├── pages/
│   │   └── index.astro     # SPA principal
│   └── types/
│       └── index.ts        # TypeScript types
├── public/
└── package.json
```

### 1. Inicializar Proyecto Astro
- [x] Crear `package.json` con dependencias
- [ ] Configurar `astro.config.mjs`
- [ ] Configurar `tsconfig.json`

### 2. Schema de IndexedDB
- [ ] Definir estructura de stores
- [ ] Implementar inicialización de DB
- [ ] Crear índices para búsqueda eficiente

### 3. Tipos TypeScript
- [ ] Tipos para documentos
- [ ] Tipos para embeddings
- [ ] Tipos para chunks
- [ ] Tipos para conversaciones

### 4. Sistema de Persistencia
- [ ] CRUD para documentos
- [ ] CRUD para embeddings
- [ ] CRUD para conversaciones
- [ ] Utilidades de exportación/importación

## Checklist de Progreso

### Fase 1.1: Setup Inicial
- [x] Crear carpeta `/tasks`
- [ ] Inicializar proyecto Astro
- [ ] Instalar dependencias core
- [ ] Configurar TypeScript

### Fase 1.2: Schema de Datos
- [ ] Definir estructura de IndexedDB
- [ ] Implementar wrapper con idb
- [ ] Crear tipos TypeScript
- [ ] Testear creación de DB en navegador

### Fase 1.3: Capa de Persistencia
- [ ] Implementar DocumentStore
- [ ] Implementar EmbeddingStore
- [ ] Implementar ConversationStore
- [ ] Crear utilidades de migración

### Fase 1.4: Migración de Código Existente
- [ ] Copiar y adaptar `webllm-engine.ts`
- [ ] Copiar y adaptar `wllama-engine.ts`
- [ ] Copiar y adaptar `model-selector.ts`
- [ ] Copiar y adaptar `semantic-chunking.ts`
- [ ] Copiar y adaptar `hybrid-rag.ts`

## Dependencias Necesarias

```json
{
  "dependencies": {
    "astro": "^4.0.0",
    "preact": "^10.19.0",
    "@preact/signals": "^1.2.0",
    "@astrojs/preact": "^3.0.0",
    "idb": "^8.0.0",
    "@mlc-ai/web-llm": "latest",
    "pdf-parse": "^1.1.1",
    "marked": "^11.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

## Criterios de Finalización

✅ Proyecto Astro inicializado y funcionando
✅ IndexedDB schema definido y probado
✅ Tipos TypeScript completos
✅ Sistema CRUD para las 3 entidades principales
✅ Código existente migrado y adaptado
✅ Proyecto compila sin errores
✅ DB se crea correctamente en DevTools

## Notas Técnicas

### IndexedDB Schema

```typescript
// Stores principales
- documents: {id, name, type, content, uploadedAt, processedAt}
- chunks: {id, documentId, content, index, metadata}
- embeddings: {id, chunkId, vector, model}
- conversations: {id, messages, createdAt, updatedAt}
- settings: {key, value}
```

### Índices
- `chunks`: index on `documentId`
- `embeddings`: index on `chunkId`
- `conversations`: index on `updatedAt`

---

**Estado:** ✅ Completada
**Siguiente Tarea:** TAREA-02-workers-y-parsers.md

## Resultados

✅ Proyecto Astro inicializado y compilando correctamente
✅ IndexedDB completo con 5 stores (documents, chunks, embeddings, conversations, settings)
✅ Sistema CRUD completo para todas las entidades
✅ Pipeline RAG migrado y adaptado:
  - semantic-chunking.ts
  - chunking.ts (adaptado para IndexedDB)
  - vector-search.ts (búsqueda local con cosine similarity)
  - rag-pipeline.ts (orquestación completa)
✅ Engines de IA migrados:
  - wllama-engine.ts (CPU/WASM con embeddings)
  - webllm-engine.ts (GPU/WebGPU para chat)
  - Utilidades: gpu-limits.ts, wasm-features.ts, model-selector.ts
✅ Build exitoso sin errores TypeScript
