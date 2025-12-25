# Arquitectura Simplificada de Comunicación Extensión-WebApp

## 🎯 Objetivo

Simplificar la comunicación entre la página web de Edge.AI y la extensión del navegador, haciendo que sea:
- **Automática**: La extensión detecta la página y se conecta automáticamente
- **Segura**: Con sistema de permisos configurable
- **Simple**: Usando `window.postMessage` en lugar de chrome.runtime
- **Clara**: Para el usuario, con notificaciones visuales

## 🏗️ Arquitectura

### Flujo de Conexión

```
1. Usuario abre edge.inled.es o localhost:4321
   ↓
2. Content Script detecta la página automáticamente
   ↓
3. Content Script envía CONNECTION_READY a la página
   ↓
4. Página muestra notificación de conexión exitosa
   ↓
5. Usuario puede buscar, la extensión pide permiso (o no, según configuración)
```

### Comunicación por window.postMessage

#### Mensajes de la Página → Extensión:

```javascript
// Ping para check de disponibilidad
{
  source: 'edgeai-webapp',
  type: 'PING'
}

// Solicitud de búsqueda
{
  source: 'edgeai-webapp',
  type: 'SEARCH_REQUEST',
  data: {
    requestId: 'search_...',
    query: 'inled group',
    maxResults: 10
  }
}
```

#### Mensajes de la Extensión → Página:

```javascript
// Respuesta al ping
{
  source: 'edgeai-extension',
  type: 'PONG',
  data: { version: '1.0.0' }
}

// Conexión establecida
{
  source: 'edgeai-extension',
  type: 'CONNECTION_READY',
  data: {
    permissionMode: 'ask' | 'permissive',
    version: '1.0.0'
  }
}

// Resultados de búsqueda
{
  source: 'edgeai-extension',
  type: 'SEARCH_RESPONSE',
  data: {
    requestId: 'search_...',
    results: [
      {
        title: '...',
        url: '...',
        content: '...',
        wordCount: 123,
        extractedAt: 1234567890
      }
    ]
  }
}

// Búsqueda denegada por el usuario
{
  source: 'edgeai-extension',
  type: 'SEARCH_DENIED',
  data: {
    requestId: 'search_...',
    reason: 'User denied permission'
  }
}

// Error en la búsqueda
{
  source: 'edgeai-extension',
  type: 'SEARCH_ERROR',
  data: {
    requestId: 'search_...',
    error: 'Error message'
  }
}
```

## 📁 Archivos Principales

### Lado de la Página Web

#### `/src/lib/extension-bridge.ts`
- **ExtensionBridge**: Clase principal de comunicación
- Maneja mensajes via `window.postMessage`
- Gestiona estado de conexión y requests pendientes
- Singleton `extensionBridge` exportado

Ejemplo de uso:
```typescript
import { extensionBridge } from '@/lib/extension-bridge';

// Verificar conexión
if (extensionBridge.isConnected()) {
  // Realizar búsqueda
  const response = await extensionBridge.search('query', 10);
  console.log(response.results);
}

// Suscribirse a cambios de estado
const unsubscribe = extensionBridge.onStatusChange((status) => {
  console.log('Status:', status);
});
```

#### `/src/lib/web-search/extension-search-provider.ts`
- Implementa `SearchProvider` interface
- Usa `extensionBridge` internamente
- Simplificado a ~70 líneas

#### `/src/components/ExtensionStatus.tsx`
- Componente de React/Preact
- Muestra notificación cuando extensión se conecta
- Auto-oculta después de 5 segundos

### Lado de la Extensión

#### `/browser-extension/content.js`
- Detecta si está en edge.inled.es o localhost:4321
- Auto-conecta con la página
- Intercepta `SEARCH_REQUEST` y pide permiso al usuario
- Forward a background.js para ejecutar la búsqueda

#### `/browser-extension/popup.html` + `popup.js`
- UI de configuración de la extensión
- Permite cambiar entre modo "ask" y "permissive"
- Guarda en `chrome.storage.local`

#### `/browser-extension/background.js`
- Ejecuta las búsquedas en Google
- Extrae contenido de las páginas
- Devuelve resultados al content script

#### `/browser-extension/manifest.json`
- Configurado con `action.default_popup` para el popup
- Permisos: tabs, storage, scripting
- Content script inyectado en `<all_urls>`

## 🔐 Sistema de Permisos

### Modo "Preguntar" (ask) - Por defecto
Cuando la página solicita una búsqueda, se muestra un `confirm()` al usuario:

```
Edge.AI wants to perform a web search:

"inled group"

This will:
• Search Google for relevant pages
• Extract content from those pages
• Send content to the AI for analysis

Allow this search?
```

### Modo "Permisivo" (permissive)
Las búsquedas se ejecutan automáticamente sin pedir confirmación.

El usuario puede cambiar el modo desde el popup de la extensión.

## 🚀 Flujo Completo de Búsqueda

1. Usuario escribe pregunta en Edge.AI webapp
2. WebRAGOrchestrator detecta que necesita búsqueda web
3. Llama a `ExtensionSearchProvider.search(query)`
4. Internamente llama `extensionBridge.search(query)`
5. Se envía `SEARCH_REQUEST` via `window.postMessage`
6. Content script lo intercepta
7. Content script verifica permiso (ask/permissive)
8. Si permitido, forward a background script
9. Background script busca en Google
10. Background script abre tabs, extrae contenido
11. Background script devuelve resultados
12. Content script envía `SEARCH_RESPONSE` a la página
13. ExtensionBridge resuelve la Promise
14. ExtensionSearchProvider formatea resultados
15. WebRAGOrchestrator procesa con RAG
16. Usuario recibe respuesta con información web

## ✨ Ventajas de la Nueva Arquitectura

### Antes (chrome.runtime.sendMessage)
- ❌ Requería extensionId hardcodeado
- ❌ No funcionaba sin configurar el ID
- ❌ Errores confusos de "Extension not found"
- ❌ Necesitaba `externally_connectable` en manifest

### Ahora (window.postMessage)
- ✅ Detección automática de la página
- ✅ Conexión automática sin configuración
- ✅ No necesita extensionId
- ✅ Funciona en localhost y producción
- ✅ Notificación visual de conexión
- ✅ Popup de configuración intuitivo
- ✅ Sistema de permisos claro

## 📝 Notas de Implementación

- El `extensionBridge` se inicializa como singleton al importarse
- El bridge envía PING al cargar para detectar la extensión
- Los requests tienen timeout de 60 segundos
- Se usa `requestId` único para matching request/response
- El permissionMode se guarda en `chrome.storage.local`
- El cambio de permissionMode notifica a todos los tabs abiertos

## 🧪 Testing

Para probar:

1. Cargar la extensión en Chrome:
   - `chrome://extensions/`
   - Developer mode ON
   - Load unpacked → carpeta `browser-extension`

2. Abrir `http://localhost:4321`

3. Deberías ver la notificación de conexión en la esquina superior derecha

4. Hacer una pregunta que active búsqueda web

5. Ver el prompt de confirmación (si estás en modo "ask")

6. Abrir el popup de la extensión para cambiar el modo

## 🐛 Debugging

Logs útiles:

```javascript
// En la consola de la página:
[ExtensionBridge] 🔍 Checking for extension...
[ExtensionBridge] 🏓 Extension responded to ping
[ExtensionBridge] ✅ Extension connected!
[ExtensionBridge] 🔍 Requesting search: inled group
[ExtensionBridge] ✅ Search completed: 5 results

// En la consola del content script (F12 en la página):
[EdgeAI Content] ✅ Running on Edge.AI webapp
[EdgeAI Content] 🔗 Connection established with webapp
[EdgeAI Content] 📨 Received from webapp: SEARCH_REQUEST
[EdgeAI Content] 🔍 Search request: inled group
[EdgeAI Content] ✅ Permissive mode enabled, auto-allowing
[EdgeAI Content] ✅ Search completed: 5 results

// En la consola del background (click en "service worker" en chrome://extensions):
[Background] Performing search for: inled group
[Background] Search completed with 5 results
```
