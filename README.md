# <img src="https://hosted.inled.es/inledai.png" width="auto" height="48" align="center" /> Edge.AI

**Edge.AI** is a **100% local-first** conversational AI platform. It runs advanced language models directly in your browser, ensuring absolute privacy without the need for external servers or user accounts. It processes documents, performs searches, and connects locally to MCPs. It persistently and locally saves information to get to know you better and remembers what you need. It can talk to you in real-time without delay, with a natural voice like the one on your system.

![Edge.AI Architecture](https://img.shields.io/badge/Privacy-100%25-green?style=for-the-badge)
![Astro](https://img.shields.io/badge/Astro-4.0-ff5d01?style=for-the-badge&logo=astro)
![Preact](https://img.shields.io/badge/Preact-10.19-673ab8?style=for-the-badge&logo=preact)
![WebLLM](https://img.shields.io/badge/WebLLM-Driven-blue?style=for-the-badge)

---

## ✨ Key Features

### 🧠 100% Local Intelligence
Harness the power of **WebLLM** and **Wllama** to run models like Llama 3, Phi-3, or Gemma directly on your graphics card (WebGPU) or CPU (WASM) without your data ever leaving your device.

### 📂 Local RAG (Chat with Documents)
Upload your **PDF, TXT, or Markdown** files and chat with them. All text processing (chunking), embedding generation, and vector search happen locally in the browser.
- **Semantic Chunking**: Intelligent document splitting for better context.
- **Vector Search**: Accurate retrieval of relevant information.

### 🌐 Smart Web Search
Integration with search engines to enrich AI responses with up-to-date information, while keeping data orchestration and filtering within your local environment.

### 🛡️ Privacy by Design
- **No Servers**: No backend saves your conversations.
- **No Accounts**: No need to register or log in.
- **Airplane Mode Ready**: If the model is already downloaded locally, you can use Edge AI without an internet connection (web search and MCPs won't work. TTS and STT may not work offline depending on your operating system).
- **Local Persistence**: Your conversations and documents are saved in **IndexedDB**, encrypted by the browser itself.

---

## 🚀 Technologies

| Tool | Usage |
| :--- | :--- |
| **Astro** | Main framework and static optimization. |
| **Preact** | Ultra-lightweight reactive interface. |
| **WebLLM** | AI engine for hardware acceleration (WebGPU). |
| **Wllama** | WASM-based AI engine for universal compatibility. |
| **TailwindCSS** | Modern, responsive, and dark design. |
| **Lucide Icons** | Minimalist and elegant iconography. |
| **IndexedDB** | High-performance local database. |

---

## The Story of Edge AI
We live in a world where AI is synonymous with massive data collection. If we have an idea we can't tell an AI but want to explore... what do we do?  
Edge AI doesn't intend to just be a private AI platform; Edge AI does much more than what you can ask of applications like Ollama, and it doesn't even install on your system.  
From the initial idea, more needs emerged, and it has been a tough journey of continuous testing.

---

## 🛠️ Installation and Deployment

### Local Development
1. **Clone the repository**
   ```bash
   git clone https://github.com/your-user/edge.ai.git
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

### Production Deployment
For detailed instructions on how to deploy to **Cloudflare Pages**, **Vercel**, or static servers, check our:

👉 **[Deployment Guide (DEPLOYMENT.md)](./DEPLOYMENT.md)**

---

## Privacy

At Edge.AI, we believe privacy is not an option, but a right.
- **Zero Telemetry**: We don't track your usage.
- **Zero Retention**: Your data is yours and stays in your browser.
- **Open Source**: Total transparency in data processing.

---

## Applications
Edge AI, being a platform that incorporates unique and flagship technology—the result of months of research, work, and continuous iteration—is usable in multiple areas requiring privacy, local execution, handling of confidential data, document-based responses without cloud uploads, untraceable web searches, etc.

The core logic resides in the `/lib` folder, which contains the RAG, chunking, vector search, semantic, and BM25 logic... as well as the inference engines, WebLLM and Wllama.

---

## ✒️ Author

Project developed with passion by **Jaime González Herráiz**, focused on creating "edge" and privacy-centric AI solutions.

- **Inled Group**: [inled.es](https://inled.es)

---

## License

This project is open-source and available under the GNU GPLv3.0 license. Keep it open, we all win!

---

<p align="center">
  Made by <a href="https://inled.es">Inled Group</a> with ❤️ Jaime González Herráiz
</p>
