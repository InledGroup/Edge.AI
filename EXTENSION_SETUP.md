# Configuración de la Extensión de Búsqueda Web

## Resumen

La búsqueda web en Edge.AI requiere una extensión de navegador que realiza las búsquedas y extrae contenido automáticamente.

## Instalación Rápida

### 1. Instalar la Extensión

#### Chrome / Edge
1. Abre `chrome://extensions/` o `edge://extensions/`
2. Activa **"Modo de desarrollador"** (esquina superior derecha)
3. Click en **"Cargar extensión sin empaquetar"**
4. Selecciona la carpeta: `/browser-extension`
5. **Copia el Extension ID** que aparece (ej: `abcdefgh...`)

#### Firefox
1. Abre `about:debugging#/runtime/this-firefox`
2. Click en **"Cargar complemento temporal"**
3. Selecciona `manifest.json` en `/browser-extension`

### 2. Configurar en Edge.AI

La primera vez que abras Edge.AI:

1. Completa la configuración de modelos
2. Se te pedirá el **Extension ID**
3. Pega el ID que copiaste
4. Click en **"Conectar"**
5. ¡Listo!

### 3. Usar Búsqueda Web

En el chat:

1. Haz click en el botón **🌐 (Globe)** en el input
2. El indicador cambiará a azul: "Búsqueda web activa"
3. Escribe tu pregunta
4. La IA buscará automáticamente en Wikipedia y DuckDuckGo

## Cómo Funciona

```
Usuario escribe pregunta
        ↓
IA genera query de búsqueda
        ↓
Extensión busca en Wikipedia y DuckDuckGo
        ↓
Extensión abre páginas en segundo plano
        ↓
Extensión extrae contenido limpio
        ↓
IA procesa y genera respuesta con fuentes
```

## Verificar que Funciona

1. Abre la consola del navegador (F12)
2. Busca: `[EdgeAI Content] Content script loaded`
3. Si ves esto, la extensión está activa ✅

## Troubleshooting

### "Extension not available"

- Verifica que la extensión esté instalada y activada
- Recarga la página de Edge.AI
- Revisa que el Extension ID sea correcto

### No encuentra resultados

- Verifica que tienes conexión a internet
- La extensión necesita acceso a Wikipedia y DuckDuckGo
- Revisa la consola del Service Worker:
  - Ve a `chrome://extensions/`
  - Click en "Service Worker" en la tarjeta de la extensión

### Contenido incompleto

- La extensión espera 30 segundos por página
- Páginas muy lentas pueden timeout
- Puedes ajustar el timeout en `browser-extension/background.js`

## Características

✅ **100% Local**: Todo el procesamiento es en tu navegador
✅ **Privado**: No envía datos a servidores externos
✅ **Automático**: Búsqueda y extracción sin intervención
✅ **Inteligente**: Selecciona las mejores fuentes
✅ **Rápido**: Caché de páginas y embeddings

## Límites

- **3 páginas** por búsqueda (configurable)
- **30 segundos** timeout por página
- **1 hora** de caché de resultados

## Configuración Avanzada

### Cambiar número de páginas

En `browser-extension/background.js`:

```javascript
const MAX_PAGES_PER_SEARCH = 5; // Cambiar de 3 a 5
```

### Cambiar timeout

En `browser-extension/background.js`, función `openAndExtractContent`:

```javascript
const timeout = setTimeout(() => {
  // ...
}, 60000); // 60 segundos en lugar de 30
```

## Desinstalar

1. En Edge.AI: Click en el icono de configuración → Buscar "Extensión" → Deshabilitar
2. En el navegador: Ve a extensiones y elimina "Edge.AI Web Research Assistant"

## Soporte

Si tienes problemas, revisa:

1. Consola del navegador (F12)
2. Service Worker de la extensión
3. README.md del proyecto
4. Issues en GitHub
