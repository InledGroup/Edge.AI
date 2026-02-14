# <img src="https://hosted.inled.es/inledai.png" width="48" height="48" align="center" /> Edge.AI

**Edge.AI** es una plataforma de inteligencia artificial conversacional **100% local-first**. Ejecuta modelos de lenguaje avanzados directamente en tu navegador, garantizando privacidad absoluta, sin necesidad de servidores externos ni cuentas de usuario. Procesa documentos, realiza búsquedas y se conecta de manera local a MCPs. Guarda de manera persistente y local información para conocerte mejor y recuerda lo que necesites. Puede hablar contigo en tiempo real sin delay, con voz natural como la que tienes en tu sistema.

![Edge.AI Architecture](https://img.shields.io/badge/Privacy-100%25-green?style=for-the-badge)
![Astro](https://img.shields.io/badge/Astro-4.0-ff5d01?style=for-the-badge&logo=astro)
![Preact](https://img.shields.io/badge/Preact-10.19-673ab8?style=for-the-badge&logo=preact)
![WebLLM](https://img.shields.io/badge/WebLLM-Driven-blue?style=for-the-badge)

---

## ✨ Características Principales

### 🧠 Inteligencia 100% Local
Aprovecha el poder de **WebLLM** y **Wllama** para ejecutar modelos como Llama 3, Phi-3 o Gemma directamente en tu tarjeta gráfica (WebGPU) o CPU (WASM) sin que tus datos salgan nunca de tu dispositivo.

### 📂 RAG Local (Chat con Documentos)
Sube tus archivos **PDF, TXT o Markdown** y chatea con ellos. Todo el procesamiento de texto (chunking), generación de embeddings y búsqueda vectorial ocurre localmente en el navegador.
- **Chunking Semántico**: División inteligente de documentos para mejor contexto.
- **Búsqueda Vectorial**: Recuperación precisa de información relevante.


### 🌐 Búsqueda Web Inteligente
Integración con motores de búsqueda para enriquecer las respuestas de la IA con información actualizada, manteniendo la orquestación y el filtrado de datos dentro de tu entorno local.

### 🛡️ Privacidad por Diseño
- **Sin Servidores**: No hay backend que guarde tus conversaciones.
- **Sin Cuentas**: No necesitas registrarte ni iniciar sesión.
- **Utilizable en modo avión**: Si el modelo ya está descargado en local, puedes usar Edge AI sin conexión a internet(la búsqueda web y los mcp no funcionarán. El TTS y STT puede no funcionar sin conexión dependiendo del sistema operativo en el que ejecutes Edge AI)
- **Persistencia Local**: Tus conversaciones y documentos se guardan en **IndexedDB**, cifrados por el propio navegador.

---

## 🚀 Tecnologías

| Herramienta | Uso |
| :--- | :--- |
| **Astro** | Framework principal y optimización de estáticos. |
| **Preact** | Interfaz reactiva ultraligera. |
| **WebLLM** | Motor de IA para aceleración por hardware (WebGPU). |
| **Wllama** | Motor de IA basado en WASM para compatibilidad universal. |
| **TailwindCSS** | Diseño moderno, adaptable y oscuro. |
| **Lucide Icons** | Iconografía minimalista y elegante. |
| **IndexedDB** | Base de datos local de alto rendimiento. |

---

## Historia de Edge AI. 
Estamos en un mundo en el que IA es igual a recopilación masiva de datos. Si tenemos una idea que no podemos contarle a una IA pero que queremos explorar... ¿qué hacemos?  
Edge AI no pretende quedarse en ser una plataforma de IA privada, Edge AI hace mucho más de lo que le puedes pedir a aplicaciones como Ollama y ni siquiera se instala en tu sistema.  
De la idea principal fueron surgiendo más necesidades y ha sido un trabajo duro de prueba contínua.  


---

## 🛠️ Instalación y Despliegue

### Desarrollo Local
1. **Clona el repositorio**
   ```bash
   git clone https://github.com/tu-usuario/edge.ai.git
   ```

2. **Instala las dependencias**
   ```bash
   npm install
   ```

3. **Inicia el servidor de desarrollo**
   ```bash
   npm run dev
   ```

### Despliegue en Producción
Para instrucciones detalladas sobre cómo desplegar en **Cloudflare Pages**, **Vercel** o servidores estáticos, consulta nuestra:

👉 **[Guía de Despliegue (DEPLOYMENT.md)](./DEPLOYMENT.md)**

---

##  Privacidad

En Edge.AI, creemos que la privacidad no es una opción, sino un derecho.
- **Cero Telemetría**: No rastreamos tu uso.
- **Cero Retención**: Tus datos son tuyos y residen en tu navegador.
- **Código Abierto**: Transparencia total en el procesamiento de datos.

---

## Aplicaciones. 
Edge AI, al ser una plataforma que incorpora tecnología única y flagship, fruto de meses de investigación y trabajo e iteración contínua, es utilizable en múltiples ámbitos que requieran privacidad, ejecución en local, manejo de datos confidenciales, respuesta en base a documentos sin subida a la nube, búsquedas web que no son rastreables, etc.  

El núcleo clave está en la carpeta /lib, que contiene la lógica de RAG, chunking, búsqueda vectorial, semántica, bm25... así como la de los motores de inferencia, WebLLM y Wllama.

---


## ✒️ Autor

Proyecto desarrollado con pasión por **Jaime González Herráiz**, enfocado en la creación de soluciones de IA "edge" y centradas en la privacidad.

- **Inled Group**: [inled.es](https://inled.es)

---

## Licencia. 

Este proyecto es de código abierto y está disponible bajo la licencia GNU GPLv3.0. Mantenlo abierto, todos salimos ganando!

---

<p align="center">
  Hecho por <a href="https://inled.es">Inled Group</a> con ❤️ Jaime González Herráiz
</p>
