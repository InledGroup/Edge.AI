# Ejemplos de Uso: Web Search Provider

## Configuración Inicial

```typescript
import { WebRAGOrchestrator } from '@/lib/web-search';
import { WllamaEngine } from '@/lib/ai/wllama-engine';
import { WebLLMEngine } from '@/lib/ai/webllm-engine';

// 1. Inicializar motores de IA
const embeddingEngine = new WllamaEngine();
await embeddingEngine.initialize('/models/qwen-embedding.gguf');

const chatEngine = new WebLLMEngine();
await chatEngine.initialize('Llama-3.2-3B-Instruct-q4f16_1-MLC');

// 2. Crear orquestador
const webRAG = new WebRAGOrchestrator(
  chatEngine,      // Motor de chat (generación)
  embeddingEngine  // Motor de embeddings
);
```

## Ejemplo 1: Búsqueda Simple

```typescript
// Realizar búsqueda web + RAG
const result = await webRAG.search(
  '¿Qué es WebGPU y cómo se usa?',
  {
    sources: ['wikipedia'],  // Solo Wikipedia
    maxSearchResults: 5,     // Max 5 resultados de búsqueda
    maxUrlsToFetch: 2,       // Descargar máximo 2 páginas
    topK: 3,                 // Top 3 chunks más relevantes
  }
);

console.log('Respuesta:', result.answer);
console.log('Fuentes usadas:', result.selectedUrls);
console.log('Tiempo total:', result.metadata.totalTime, 'ms');
```

**Resultado esperado:**

```
Respuesta: WebGPU es una API moderna de gráficos web que permite...
Fuentes usadas: [
  'https://es.wikipedia.org/wiki/WebGPU',
  'https://en.wikipedia.org/wiki/WebGPU_API'
]
Tiempo total: 14250 ms
```

## Ejemplo 2: Con Seguimiento de Progreso

```typescript
const result = await webRAG.search(
  '¿Cuáles son las últimas tendencias en IA en 2025?',
  {
    sources: ['wikipedia'],
    maxUrlsToFetch: 3,
    topK: 5,

    // Callback de progreso
    onProgress: (step, progress, message) => {
      console.log(`[${step}] ${progress}% - ${message}`);

      // Actualizar UI
      updateProgressBar(progress);
      updateStatusText(message);
    }
  }
);
```

**Salida de progreso:**

```
[query_generation] 10% - Generando consulta de búsqueda...
[web_search] 20% - Buscando en la web...
[url_selection] 30% - Seleccionando fuentes relevantes...
[page_fetch] 40% - Descargando 3 páginas...
[content_extraction] 50% - Extrayendo contenido limpio...
[chunking] 60% - Procesando documentos web...
[embedding] 70% - Generando embeddings...
[vector_search] 80% - Buscando fragmentos relevantes...
[answer_generation] 90% - Generando respuesta...
[completed] 100% - Búsqueda completada
```

## Ejemplo 3: Mostrar Fuentes al Usuario

```typescript
const result = await webRAG.search(
  '¿Qué es Astro framework?'
);

// Construir mensaje con fuentes
let mensaje = result.answer + '\n\n';
mensaje += '📍 **Fuentes consultadas:**\n\n';

result.cleanedContents.forEach((content, i) => {
  mensaje += `${i + 1}. [${content.title}](${content.url})\n`;
  mensaje += `   ${content.wordCount} palabras\n\n`;
});

mensaje += '💡 *Esta información fue analizada localmente por tu navegador.*\n';
mensaje += '*No se envió ningún dato a servidores externos.*';

console.log(mensaje);
```

**Output:**

```markdown
Astro es un framework web moderno diseñado para construir sitios...

📍 **Fuentes consultadas:**

1. [Astro - Wikipedia](https://es.wikipedia.org/wiki/Astro_(framework))
   1,234 palabras

2. [Astro Build - Official](https://en.wikipedia.org/wiki/Astro_build)
   892 palabras

💡 *Esta información fue analizada localmente por tu navegador.*
*No se envió ningún dato a servidores externos.*
```

## Ejemplo 4: Análisis de Resultados

```typescript
const result = await webRAG.search('Historia de JavaScript');

// Ver query generada por LLM
console.log('Query original:', result.query);
console.log('Query de búsqueda:', result.searchQuery);

// Ver todos los resultados de búsqueda
console.log('\nResultados encontrados:');
result.searchResults.forEach((r, i) => {
  console.log(`${i}. ${r.title}`);
  console.log(`   ${r.snippet}`);
  console.log(`   ${r.url}\n`);
});

// Ver cuáles fueron seleccionados
console.log('\nURLs seleccionadas por el LLM:');
result.selectedUrls.forEach((url, i) => {
  console.log(`${i + 1}. ${url}`);
});

// Ver chunks recuperados
console.log('\nChunks más relevantes:');
result.ragResult.chunks.forEach((chunk, i) => {
  console.log(`\n--- Chunk ${i + 1} (${(chunk.score * 100).toFixed(1)}% relevancia) ---`);
  console.log(`Fuente: ${chunk.document.title}`);
  console.log(`Contenido: ${chunk.content.slice(0, 100)}...`);
});

// Ver tiempos de ejecución
console.log('\nTimestamps:');
Object.entries(result.metadata.timestamps).forEach(([step, time]) => {
  console.log(`  ${step}: ${time}ms`);
});
```

## Ejemplo 5: Manejo de Errores

```typescript
try {
  const result = await webRAG.search(
    '¿Qué es XYZ123?',  // Query que probablemente no dará resultados
    {
      sources: ['wikipedia'],
      maxUrlsToFetch: 2,

      onProgress: (step, progress, message) => {
        if (step === 'error') {
          console.error('Error:', message);
        }
      }
    }
  );

  console.log('Respuesta:', result.answer);

} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('No se encontraron resultados')) {
      console.log('No hay información disponible sobre este tema.');
      console.log('Intenta reformular tu pregunta.');
    } else if (error.message.includes('No se pudo descargar')) {
      console.log('Hubo un problema descargando las páginas.');
      console.log('Verifica tu conexión a internet.');
    } else {
      console.error('Error inesperado:', error.message);
    }
  }
}
```

## Ejemplo 6: Uso Directo del WebSearchService

Si solo necesitas buscar sin RAG:

```typescript
import { webSearchService } from '@/lib/web-search';

// Búsqueda simple
const results = await webSearchService.search('TypeScript 2025', {
  maxResults: 5,
  sources: ['wikipedia']
});

results.forEach(result => {
  console.log(result.title);
  console.log(result.snippet);
  console.log(result.url);
  console.log('---');
});

// Ver estadísticas del servicio
const stats = webSearchService.getStats();
console.log('Cache size:', stats.cacheSize);
console.log('Providers:', stats.providers);

// Limpiar cache manualmente
webSearchService.clearCache();
```

## Ejemplo 7: Extracción de Contenido

Si solo necesitas extraer contenido limpio de HTML:

```typescript
import { contentExtractor } from '@/lib/web-search';

// Fetch página manualmente
const response = await fetch('https://es.wikipedia.org/wiki/TypeScript');
const html = await response.text();

// Extraer contenido limpio
const cleaned = contentExtractor.extract(html, response.url);

console.log('Título:', cleaned.title);
console.log('Palabras:', cleaned.wordCount);
console.log('Contenido:', cleaned.text.slice(0, 500));

// Metadata
if (cleaned.metadata) {
  console.log('Autor:', cleaned.metadata.author);
  console.log('Fecha:', cleaned.metadata.publishedAt);
  console.log('Descripción:', cleaned.metadata.description);
}
```

## Ejemplo 8: Integración con Conversación Existente

```typescript
import { addMessage, getConversationMessages } from '@/lib/db/conversations';

// Obtener historial de conversación
const conversationId = 'conv-123';
const history = await getConversationMessages(conversationId);

// Realizar búsqueda web
const result = await webRAG.search(
  '¿Cómo se relaciona esto con lo que mencionaste antes?',
  {
    sources: ['wikipedia'],
    maxUrlsToFetch: 2,
    topK: 3
  }
);

// Guardar mensaje del usuario
await addMessage(conversationId, {
  role: 'user',
  content: result.query,
  timestamp: Date.now()
});

// Guardar respuesta con fuentes
await addMessage(conversationId, {
  role: 'assistant',
  content: result.answer,
  timestamp: Date.now(),
  sources: result.ragResult.chunks.map(chunk => ({
    content: chunk.content,
    score: chunk.score,
    document: {
      id: chunk.document.id,
      title: chunk.document.title,
      url: chunk.document.url,
      type: 'web'  // Marca como fuente web
    }
  })),
  metadata: {
    searchQuery: result.searchQuery,
    webSources: result.selectedUrls,
    totalTime: result.metadata.totalTime
  }
});
```

## Ejemplo 9: Configuración Personalizada de Providers

```typescript
import { WebSearchService, WikipediaSearchProvider } from '@/lib/web-search';

// Crear servicio con provider personalizado
const customWikipedia = new WikipediaSearchProvider();

const customSearchService = new WebSearchService([
  customWikipedia
  // Agregar más providers aquí
]);

// Usar en orquestador
const webRAG = new WebRAGOrchestrator(
  chatEngine,
  embeddingEngine,
  customSearchService  // Servicio personalizado
);
```

## Ejemplo 10: Búsqueda con Cache

```typescript
// Primera búsqueda (va a la web)
const result1 = await webRAG.search('¿Qué es React?');
console.log('Tiempo:', result1.metadata.totalTime, 'ms');
// Output: Tiempo: 12000 ms

// Segunda búsqueda idéntica (usa cache)
const result2 = await webRAG.search('¿Qué es React?');
console.log('Tiempo:', result2.metadata.totalTime, 'ms');
// Output: Tiempo: 3000 ms (mucho más rápido!)

// El cache es válido por 5 minutos
// Después de eso, se realizará una nueva búsqueda
```

## Mejores Prácticas

### 1. Limitar Número de URLs

```typescript
// ✅ BIEN: Máximo 3 URLs para balance tiempo/calidad
const result = await webRAG.search(query, {
  maxUrlsToFetch: 3
});

// ❌ EVITAR: Demasiadas URLs = lento
const result = await webRAG.search(query, {
  maxUrlsToFetch: 10  // Puede tomar 30+ segundos
});
```

### 2. Usar Callbacks de Progreso

```typescript
// ✅ BIEN: Mostrar feedback al usuario
const result = await webRAG.search(query, {
  onProgress: (step, progress, message) => {
    updateUI({ step, progress, message });
  }
});

// ❌ EVITAR: Sin feedback (usuario piensa que está colgado)
const result = await webRAG.search(query);
```

### 3. Manejar Errores Gracefully

```typescript
// ✅ BIEN: Manejo robusto de errores
try {
  const result = await webRAG.search(query);
  showAnswer(result.answer);
} catch (error) {
  showError('No se pudo obtener información. Intenta de nuevo.');
  console.error(error);
}

// ❌ EVITAR: Sin manejo de errores
const result = await webRAG.search(query);
showAnswer(result.answer);  // ¡Puede fallar!
```

### 4. Mostrar Transparencia

```typescript
// ✅ BIEN: Usuario sabe de dónde viene la información
const message = `${result.answer}

📍 Fuentes: ${result.selectedUrls.join(', ')}
💡 Procesado localmente en ${result.metadata.totalTime}ms`;

// ❌ EVITAR: Respuesta sin contexto
const message = result.answer;
```

### 5. Ajustar topK según necesidad

```typescript
// Pregunta simple → menos chunks
const result = await webRAG.search('¿Qué es X?', {
  topK: 3
});

// Pregunta compleja → más chunks
const result = await webRAG.search('Explica las diferencias entre X, Y y Z', {
  topK: 7
});
```

## Limitaciones Conocidas

1. **CORS**: Algunos sitios bloquean fetch desde navegador
   - Solución: Usar Wikipedia que soporta CORS

2. **Rate Limiting**: Wikipedia limita requests
   - Solución: El sistema incluye rate limiting automático (10 req/min)

3. **Tiempo de Procesamiento**: 10-20 segundos típico
   - Solución: Mostrar progreso al usuario

4. **Calidad de Resultados**: Depende de la fuente
   - Solución: El LLM selecciona los mejores resultados

5. **Idioma**: Wikipedia español tiene menos contenido
   - Solución: El LLM usa inglés para contenido técnico

## Próximos Pasos

- Integrar en la UI de chat
- Agregar más providers (si están disponibles sin CORS)
- Persistir documentos web opcionalmente
- Agregar sistema de "favoritos" de fuentes web
