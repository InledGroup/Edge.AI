import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  server: { 
    host: true, 
    port: 4321,
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin"
    }
  },
  integrations: [
    preact({
      compat: true, // Enable React compatibility layer
    }),
    tailwind({
      applyBaseStyles: true,
    })
  ],
  vite: {
    optimizeDeps: {
      exclude: ['@mlc-ai/web-llm', '@wllama/wllama']
    },
    worker: {
      format: 'es'
    },
    build: {
      target: 'esnext'
    }
  },
  output: 'static',
  build: {
    inlineStylesheets: 'auto'
  }
});
