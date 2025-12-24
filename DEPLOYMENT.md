# 🚀 Guía de Despliegue - Edge.AI

Edge.AI es una aplicación **local-first**, lo que significa que el 100% de la lógica de IA y el almacenamiento ocurre en el navegador del usuario. Gracias a esto, el despliegue es extremadamente sencillo y eficiente.

---

## 🛠️ ¿Estático o SSR?

**Recomendación: Estático (`output: 'static'`)**

Actualmente, el proyecto está configurado en modo **estático**. No necesitas un servidor (SSR) porque:
1. No hay base de datos centralizada (usamos IndexedDB).
2. Los modelos de IA se ejecutan en el cliente (WebGPU/WASM).
3. No hay APIs privadas que ocultar en el backend.

El despliegue estático permite que tu app sea servida desde un CDN (como Cloudflare o Vercel) con latencia mínima y coste cero.

---

## 🌩️ Opciones de Despliegue

### 1. Cloudflare Pages (Recomendado)
Es la opción ideal por su velocidad y soporte nativo de encabezados de seguridad necesarios para WASM.

**Pasos:**
- Conecta tu repositorio de GitHub a Cloudflare Pages.
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Node.js Version**: 18 o superior.

> **Importante**: Crea un archivo `_headers` en tu carpeta `public/` para habilitar el aislamiento multihilo de WASM (necesario para Wllama):
> ```text
> /*
>   Cross-Origin-Embedder-Policy: require-corp
>   Cross-Origin-Opener-Policy: same-origin
> ```

### 2. Vercel
Excelente integración con Astro.

**Pasos:**
- Importa el repositorio en Vercel.
- Vercel detectará automáticamente que es un proyecto de **Astro**.
- Haz clic en **Deploy**.

Para los encabezados en Vercel, añade esto a tu `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
      ]
    }
  ]
}
```

---

## ⚠️ Consideraciones Críticas

### 1. Soporte de WebGPU
Para que los modelos funcionen con velocidad máxima (WebLLM), el sitio **debe servirse sobre HTTPS** (excepto en localhost). Todos los proveedores mencionados (Cloudflare, Vercel) proporcionan HTTPS automáticamente.

### 2. Archivos Grandes y WASM
Asegúrate de que tu proveedor de hosting no limite el tamaño de los archivos `.wasm` o `.js` que se encuentran en la carpeta `public/wllama`. Estos son esenciales para el motor de IA.

### 3. Memoria del Navegador
Como la IA se descarga en el navegador, los usuarios verán una descarga inicial (de 100MB a varios GB según el modelo). Es normal y solo ocurre la primera vez o cuando cambia el modelo.

---

## 📦 Empaquetado para Producción

Antes de desplegar, siempre prueba el build localmente:

```bash
# 1. Limpiar versiones anteriores
rm -rf dist

# 2. Generar el build
npm run build

# 3. Previsualizar el build final
npm run preview
```

Si todo funciona en el `preview`, el despliegue será exitoso.

---

<p align="center">
  ¿Dudas? Contacta con el equipo de desarrollo de <b>Inled Group</b>.
</p>
