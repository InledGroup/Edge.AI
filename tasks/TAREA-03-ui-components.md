# Tarea 3: UI Components con Preact Islands

## Objetivo
Crear la interfaz de usuario usando Astro + Preact Islands. Implementar componentes interactivos para carga de documentos, gestión de modelos, chat conversacional y visualización de estado.

## Arquitectura UI

```
┌─────────────────────────────────────┐
│   Astro Page (Static Shell)        │
├─────────────────────────────────────┤
│  ┌────────────┐  ┌────────────────┐ │
│  │ ModelPanel │  │ DocumentPanel  │ │  <- Islands
│  │ (Preact)   │  │ (Preact)       │ │
│  └────────────┘  └────────────────┘ │
│                                     │
│  ┌──────────────────────────────┐  │
│  │      ChatInterface           │  │  <- Main Island
│  │      (Preact)                │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Componentes a Crear

### Core Islands
1. **ModelSelector** - Selección y carga de modelos IA
2. **DocumentUpload** - Carga y gestión de documentos
3. **ChatInterface** - Interfaz principal de chat con RAG
4. **Sidebar** - Navegación y lista de conversaciones
5. **Settings** - Configuración de la aplicación

### UI Primitives
6. **Button** - Botones con estados (loading, disabled)
7. **FileInput** - Input de archivos con drag & drop
8. **ProgressBar** - Barra de progreso
9. **Message** - Componente de mensaje de chat
10. **DocumentCard** - Card para documentos cargados

## Checklist de Progreso

### Fase 3.1: Setup & Design System
- [ ] Crear sistema de diseño base (colores, tipografía)
- [ ] Configurar CSS global o Tailwind
- [ ] Crear componentes primitivos (Button, Input, Card)
- [ ] Implementar theme system (light/dark)

### Fase 3.2: Componentes de UI
- [ ] DocumentUpload island
- [ ] DocumentCard component
- [ ] ModelSelector island
- [ ] ProgressBar component
- [ ] Message component

### Fase 3.3: Chat Interface
- [ ] ChatInterface island
- [ ] MessageList component
- [ ] ChatInput component
- [ ] Typing indicator
- [ ] Sources display (RAG chunks)

### Fase 3.4: Estado Global
- [ ] Implementar estado global con Preact signals
- [ ] Store para documentos
- [ ] Store para modelos
- [ ] Store para conversaciones
- [ ] Store para UI state

### Fase 3.5: Integración
- [ ] Conectar UI con workers
- [ ] Conectar UI con IndexedDB
- [ ] Implementar flujo completo de carga de documento
- [ ] Implementar flujo completo de chat

## Especificaciones de Componentes

### ModelSelector
```typescript
interface ModelSelectorProps {
  onModelSelected: (modelId: string) => void;
  onModelLoaded: () => void;
}
```

Features:
- Detección automática de capacidades (WebGPU/WASM)
- Recomendación de modelo basada en hardware
- Progress bar durante carga
- Estado: idle | loading | ready | error

### DocumentUpload
```typescript
interface DocumentUploadProps {
  onDocumentUploaded: (doc: Document) => void;
  maxFiles?: number;
}
```

Features:
- Drag & drop zone
- File validation (tipo, tamaño)
- Preview de documentos
- Progress durante procesamiento
- Lista de documentos cargados

### ChatInterface
```typescript
interface ChatInterfaceProps {
  conversationId?: string;
}
```

Features:
- Lista de mensajes scrolleable
- Input con auto-resize
- Streaming de respuestas
- Display de fuentes RAG
- Auto-scroll en nuevos mensajes

## Estado Global (Preact Signals)

```typescript
// Global stores
const documentsStore = signal<Document[]>([]);
const modelsStore = signal<{
  chat?: ModelConfig;
  embedding?: ModelConfig;
}>({});
const conversationsStore = signal<Conversation[]>([]);
const uiStore = signal<{
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  processing: boolean;
}>({
  sidebarOpen: true,
  theme: 'auto',
  processing: false
});
```

## Flujos de Usuario

### Flujo 1: Cargar Primer Documento
1. Usuario arrastra PDF a DocumentUpload
2. Validación de archivo
3. Parser extrae texto
4. Worker chunking procesa chunks
5. Worker embedding genera vectores
6. Almacenamiento en IndexedDB
7. UI muestra documento "Ready"

### Flujo 2: Hacer Pregunta
1. Usuario escribe en ChatInput
2. Sistema verifica modelo cargado
3. Worker embedding genera embedding de query
4. Worker search busca chunks similares
5. Sistema genera prompt con contexto
6. Modelo genera respuesta (streaming)
7. UI muestra respuesta con fuentes

## Criterios de Finalización

✅ Todos los componentes implementados
✅ Estado global funcionando
✅ Flujo completo de documento funciona
✅ Flujo completo de chat funciona
✅ UI responsive y accesible
✅ Sin bloqueos en UI (todo async)
✅ Proyecto compila y build exitoso

---

**Estado:** 🟢 Pendiente
**Tarea Anterior:** TAREA-02-workers-y-parsers.md
**Siguiente Tarea:** TAREA-04-integracion-final.md
