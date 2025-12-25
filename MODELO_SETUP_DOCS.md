# Sistema de Configuración de Modelos de IA

Sistema completo de configuración, selección y persistencia de modelos de IA para Edge.AI, una plataforma 100% en navegador con ejecución local de modelos.

## 📋 Índice

1. [Arquitectura General](#arquitectura-general)
2. [Módulos del Sistema](#módulos-del-sistema)
3. [Flujo de Usuario](#flujo-de-usuario)
4. [Catálogo de Modelos](#catálogo-de-modelos)
5. [Sistema de Scoring](#sistema-de-scoring)
6. [Componentes UI](#componentes-ui)
7. [Uso y Extensión](#uso-y-extensión)

---

## 🏗️ Arquitectura General

El sistema está diseñado con separación de responsabilidades:

```
┌─────────────────────────────────────────────────────────────┐
│                     FLUJO COMPLETO                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Primera ejecución                Ejecuciones posteriores  │
│  ─────────────────                ────────────────────────  │
│                                                             │
│  1. Detectar capabilities         1. Cargar settings       │
│  2. Mostrar FirstRunWizard         2. Cargar modelo default│
│  3. Scoring de modelos             3. Continuar normal     │
│  4. Usuario selecciona                                     │
│  5. Cargar modelos                Reconfiguración manual:  │
│  6. Guardar en localStorage        → ModelConfigMenu       │
│  7. Marcar setup completo          → Abrir wizard          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Tecnologías Utilizadas

- **Detección de hardware**: WebGPU API, Navigator APIs
- **Ejecución de modelos**: WebLLM (GPU) + Wllama (CPU/WASM)
- **Persistencia**: localStorage
- **UI**: Preact + TypeScript
- **Estado**: Preact Signals

---

## 🧩 Módulos del Sistema

### 1. `device-profile.ts` - Detección de Capacidades

**Propósito**: Detectar automáticamente las capacidades del dispositivo del usuario.

**Funciones principales**:

```typescript
detectDeviceProfile(): Promise<DeviceProfile>
```

**Detecta**:
- Disponibilidad de WebGPU
- Tier de GPU (low/medium/high)
- Memoria RAM disponible
- Cores lógicos del CPU
- Soporte de SharedArrayBuffer
- Soporte de WASM threads

**Salida**: Objeto `DeviceProfile` con:
```typescript
{
  hasWebGPU: boolean;
  gpuTier?: 'low' | 'medium' | 'high';
  memoryGB: number;
  estimatedAvailableMemoryGB: number;
  logicalCores: number;
  hasSharedArrayBuffer: boolean;
  hasWASMThreads: boolean;
  recommendedBackend: 'webgpu' | 'wasm' | 'cpu';
  deviceClass: 'high-end' | 'mid-range' | 'low-end';
}
```

---

### 2. `model-registry.ts` - Catálogo de Modelos

**Propósito**: Registro centralizado de modelos disponibles con metadatos completos.

**Estructura de cada modelo**:

```typescript
{
  id: string;                    // Identificador único
  name: string;                  // Nombre técnico
  displayName: string;           // Nombre para UI
  description: string;           // Descripción clara
  type: 'chat' | 'embedding';
  engine: 'webllm' | 'wllama';
  webllmModelId?: string;        // Para WebLLM/MLC
  ggufUrl?: string;              // Para Wllama/GGUF
  sizeGB: number;
  speed: 'very-fast' | 'fast' | 'medium' | 'slow';
  quality: 'basic' | 'good' | 'excellent';
  quantization?: 'q4' | 'q5' | 'q8' | 'f16';
  minMemoryGB: number;
  preferredMemoryGB: number;
  requiresWebGPU: boolean;
  contextSize: number;
  tags: string[];
}
```

**Modelos incluidos**:

#### Chat - Pequeños (< 1GB)
- SmolLM2 135M - Ultra rápido, básico
- SmolLM2 360M - Rápido, equilibrado
- Qwen2.5 0.5B - Ligero de Alibaba

#### Chat - Medianos (1-2GB)
- TinyLlama 1.1B - Basado en Llama
- Llama 3.2 1B - Alta calidad de Meta
- Qwen2.5 1.5B - **Recomendado** equilibrio

#### Chat - Grandes (3GB+)
- Llama 3.2 3B - Máxima calidad
- Phi 3.5 Mini - Razonamiento avanzado

#### Embeddings
- Qwen2 0.5B - Para búsqueda semántica

---

### 3. `model-scoring.ts` - Sistema de Puntuación

**Propósito**: Calcular compatibilidad de modelos según el hardware del usuario.

**Función principal**:

```typescript
scoreModel(model: ModelMetadata, device: DeviceProfile): ModelScore
```

**Algoritmo de scoring** (0-100%):

1. **Memoria** (crítico):
   - -50 si no hay memoria mínima
   - -20 si memoria justa
   - +0 si suficiente

2. **WebGPU**:
   - -60 si modelo requiere GPU pero no hay
   - +10 si hay GPU y se aprovecha

3. **GPU Tier**:
   - +15 para GPU high-end
   - +5 para medium
   - -10 para low

4. **Ratio de uso de memoria**:
   - +5 si modelo es ligero (< 30% de RAM)
   - -15 si modelo es pesado (> 70% de RAM)

5. **CPU cores** (para modelos sin GPU):
   - +5 si multi-core
   - -10 si pocos cores

6. **WASM threads**:
   - +5 si disponible para Wllama
   - -10 si no disponible

7. **Bonificaciones por device class**:
   - +10 para combinaciones óptimas

**Salida**:

```typescript
{
  model: ModelMetadata;
  score: number;              // 0-100
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];          // Razones positivas
  warnings: string[];         // Advertencias
  recommendation: 'excellent' | 'good' | 'usable' | 'not-recommended';
}
```

---

### 4. `model-settings.ts` - Persistencia

**Propósito**: Guardar y cargar configuración del usuario en localStorage.

**Funciones**:

```typescript
// Obtener configuración actual
getModelSettings(): ModelSettings

// Guardar configuración
saveModelSettings(settings: Partial<ModelSettings>): void

// Verificar si completó setup
hasCompletedSetup(): boolean

// Marcar setup completo
markSetupCompleted(): void

// Guardar modelos predeterminados
saveDefaultChatModel(modelId: string): void
saveDefaultEmbeddingModel(modelId: string): void

// Obtener IDs de modelos predeterminados
getDefaultModelIds(): { chatModelId, embeddingModelId }

// Resetear todo
clearModelSettings(): void
```

**Estructura guardada**:

```typescript
{
  hasCompletedSetup: boolean;
  defaultChatModelId: string | null;
  defaultEmbeddingModelId: string | null;
  deviceProfile?: { hasWebGPU, memoryGB, deviceClass };
  setupCompletedAt?: number;
  lastUpdatedAt: number;
}
```

---

## 🎨 Componentes UI

### 1. `FirstRunWizard.tsx` - Asistente Inicial

**Propósito**: Guiar al usuario paso a paso en la primera ejecución.

**Pasos del wizard**:

#### Paso 1: Bienvenida
- Logo y título
- Explicación breve del sistema
- Ventajas de ejecución local
- Botón "Comenzar configuración"

#### Paso 2: Detección
- Spinner de carga
- "Analizando tu dispositivo..."
- Ejecuta `detectDeviceProfile()`
- Ejecuta scoring de todos los modelos

#### Paso 3: Selección de Modelos
- Muestra resumen del dispositivo detectado
- Lista de modelos de chat ordenados por score
  - Cada modelo muestra:
    - Nombre y descripción
    - Porcentaje de compatibilidad (color-coded)
    - Tamaño, velocidad, calidad
    - Warnings si aplica
    - Emoji de recomendación (✨ excellent, ✓ good, ⚠️ usable, ❌ no recomendado)
- Modelo de embeddings (auto-seleccionado)
- Botones: "Atrás" | "Cargar modelos seleccionados"

#### Paso 4: Carga
- Progress bars para chat y embedding
- Mensajes de progreso en tiempo real
- Usa callbacks de `WebLLMEngine` / `WllamaEngine`

#### Paso 5: Completado
- Checkmark verde
- "¡Todo listo!"
- Auto-cierra en 2 segundos

**Props**:

```typescript
interface FirstRunWizardProps {
  onComplete: () => void;
}
```

---

### 2. `ModelConfigMenu.tsx` - Menú de Configuración

**Propósito**: Permitir reconfiguración de modelos en cualquier momento.

**Funcionalidad**:

- Botón trigger: "Configurar modelos"
- Al hacer click, muestra modal con:
  - Estado actual de modelos cargados
  - Opciones:
    - "Cambiar modelos" → abre wizard
    - "Recargar modelos actuales" → refresh
    - "Resetear configuración" → limpia todo y reinicia wizard

**Estados**:

- Cerrado: Solo muestra botón
- Abierto: Muestra panel de opciones

**Props**:

```typescript
interface ModelConfigMenuProps {
  onOpenWizard: () => void;
}
```

---

## 🔄 Flujo de Usuario

### Primera Ejecución

```
Usuario abre app
    ↓
AppLayout detecta !hasCompletedSetup()
    ↓
Muestra FirstRunWizard
    ↓
1. Welcome screen
    ↓
2. Detectando capacidades...
    ↓
3. Lista de modelos scored
    ↓
Usuario selecciona modelo
    ↓
4. Cargando modelos (progress bars)
    ↓
5. ✅ Completado
    ↓
saveDefaultChatModel(id)
saveDefaultEmbeddingModel(id)
markSetupCompleted()
    ↓
onComplete() → cierra wizard
    ↓
App lista para usar
```

### Ejecuciones Posteriores

```
Usuario abre app
    ↓
AppLayout detecta hasCompletedSetup() == true
    ↓
NO muestra wizard
    ↓
Carga modelos predeterminados automáticamente
    ↓
App lista para usar
```

### Reconfiguración Manual

```
Usuario click en "Configurar modelos" (Sidebar)
    ↓
Muestra ModelConfigMenu
    ↓
Usuario elige opción:
    │
    ├─ "Cambiar modelos"
    │   ↓
    │   Abre FirstRunWizard
    │   ↓
    │   Flujo de selección completo
    │
    ├─ "Recargar actuales"
    │   ↓
    │   Reinicializa engines con mismos modelos
    │
    └─ "Resetear"
        ↓
        clearModelSettings()
        resetAll() engines
        ↓
        Abre FirstRunWizard
```

---

## 📊 Sistema de Scoring - Detalles

### Ejemplo de Cálculo

**Dispositivo**: 8GB RAM, WebGPU disponible (tier: medium), 4 cores

**Modelo**: Qwen2.5 1.5B
- sizeGB: 1.0
- requiresWebGPU: false
- minMemoryGB: 2
- preferredMemoryGB: 4

**Scoring**:

```
Base: 100

Memoria:
  - estimatedAvailable: 8 * 0.3 = 2.4GB
  - 2.4GB >= 2GB (min) ✓
  - 2.4GB < 4GB (preferred) → -20
  Score: 80

WebGPU:
  - Modelo no requiere GPU
  - Device tiene GPU → +0
  Score: 80

Memory usage ratio:
  - 1.0GB / 2.4GB = 0.42 (< 0.7) → +0
  Score: 80

Device class:
  - mid-range + modelo 1GB → +0
  Score: 80

FINAL: 80% → "excellent" ✨
```

---

## 🚀 Uso y Extensión

### Agregar Nuevo Modelo

1. Edita `src/lib/ai/model-registry.ts`:

```typescript
{
  id: 'nuevo-modelo-id',
  name: 'NuevoModelo-1B',
  displayName: 'Nuevo Modelo 1B (Descripción)',
  description: 'Descripción técnica del modelo',
  type: 'chat',
  engine: 'webllm',
  webllmModelId: 'NuevoModelo-1B-q4f16-MLC',
  ggufUrl: 'https://huggingface.co/...',
  sizeGB: 0.8,
  speed: 'fast',
  quality: 'good',
  quantization: 'q4',
  minMemoryGB: 2,
  preferredMemoryGB: 3,
  requiresWebGPU: false,
  contextSize: 2048,
  tags: ['nuevo', 'experimental']
}
```

2. El modelo aparecerá automáticamente en el wizard
3. Se scored automáticamente según el dispositivo

### Modificar Algoritmo de Scoring

Edita `src/lib/ai/model-scoring.ts`:

```typescript
export function scoreModel(model: ModelMetadata, device: DeviceProfile): ModelScore {
  let score = 100;

  // Agrega tu lógica personalizada aquí
  if (model.tags.includes('experimental')) {
    score -= 10; // Penaliza modelos experimentales
  }

  // ... resto del código
}
```

### Cambiar Criterios de Detección

Edita `src/lib/ai/device-profile.ts`:

```typescript
function classifyDevice(memoryGB, hasWebGPU, cores): DeviceClass {
  // Modifica los umbrales según tus necesidades
  if (hasWebGPU && memoryGB >= 16 && cores >= 8) {
    return 'high-end';
  }
  // ...
}
```

---

## 🧪 Testing

### Probar Primera Ejecución

```javascript
// En consola del navegador:
localStorage.removeItem('edge-ai-model-settings');
location.reload();
```

### Ver Configuración Actual

```javascript
import { exportSettings } from '@/lib/ai/model-settings';
console.log(exportSettings());
```

### Simular Dispositivo Diferente

Modifica temporalmente `device-profile.ts`:

```typescript
export async function detectDeviceProfile(): Promise<DeviceProfile> {
  // Hardcodea valores para testing
  return {
    hasWebGPU: false,
    memoryGB: 4,
    // ...
  };
}
```

---

## 📝 Notas Técnicas

### Persistencia

- Usa `localStorage` (clave: `'edge-ai-model-settings'`)
- Estructura JSON simple
- No hay backend, todo es cliente
- Compatible con modo incógnito (se pierde al cerrar)

### Carga de Modelos

- **Primera vez**: Descarga desde HuggingFace (~1-3 min)
- **Siguientes veces**: Cache del navegador (instantáneo)
- **Storage**: IndexedDB (WebLLM) o Cache API (Wllama)

### WebGPU vs WASM

| Feature | WebGPU | WASM |
|---------|--------|------|
| Velocidad | ⚡ Muy rápida | 🐢 Lenta |
| Compatibilidad | 🔴 Solo Chrome/Edge | 🟢 Todos los navegadores |
| Consumo RAM | 🟢 Bajo | 🔴 Alto |
| Modelos grandes | ✅ Sí | ❌ Difícil |

### Recomendaciones

- Dispositivos high-end: Modelos 3B+ con WebGPU
- Dispositivos mid-range: Modelos 1.5B con WebGPU o WASM
- Dispositivos low-end: Modelos 360M-0.5B con WASM

---

## 🐛 Troubleshooting

### "WebGPU no disponible"
- Actualiza Chrome/Edge a la última versión
- Verifica flags: `chrome://flags/#enable-unsafe-webgpu`

### "Modelo tarda mucho en cargar"
- Normal la primera vez (descarga)
- Verifica conexión a internet
- Comprueba espacio en disco

### "Out of memory"
- Selecciona modelo más pequeño
- Cierra pestañas del navegador
- Aumenta RAM del sistema

---

## 📚 Referencias

- [WebLLM Documentation](https://github.com/mlc-ai/web-llm)
- [Wllama Repository](https://github.com/ngxson/wllama)
- [WebGPU Spec](https://www.w3.org/TR/webgpu/)
- [HuggingFace GGUF Models](https://huggingface.co/models?library=gguf)

---

**Última actualización**: 2025-12-25
**Versión**: 1.0.0
