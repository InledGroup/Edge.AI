import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';
import AstroPWA from '@vite-pwa/astro';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import fs from 'node:fs';
import path from 'node:path';

// Resolve absolute paths
const certDir = path.resolve('./.cert');
const keyPath = path.join(certDir, 'key.pem');
const certPath = path.join(certDir, 'cert.pem');

const hasCerts = fs.existsSync(keyPath) && fs.existsSync(certPath);

console.log('🔒 HTTPS Configuration Check:');
console.log('   - Cert dir:', certDir);
console.log('   - Keys exist:', hasCerts);

const httpsConfig = hasCerts ? {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
} : undefined;

if (hasCerts) {
  console.log('   - Certificates loaded! Forced HTTPS.');
}

// https://astro.build/config
export default defineConfig({
  server: { 
    host: true, 
    port: 4321,
    https: httpsConfig,
    headers: {
      "Cross-Origin-Embedder-Policy": "unsafe-none",
      "Cross-Origin-Opener-Policy": "same-origin"
    }
  },
  integrations: [
    preact({
      compat: true, // Enable React compatibility layer
    }),
    tailwind({
      applyBaseStyles: true,
    }),
    AstroPWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],
      manifestFilename: 'manifest.json',
      manifest: {
        id: '/',
        name: 'Edge.AI',
        short_name: 'EdgeAI',
        description: '100% Local-first Local AI Platform',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'es',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
        suppressWarnings: true,
      }
    })
  ],
  vite: {
    plugins: [
      nodePolyfills({
        include: ['buffer', 'events', 'process', 'util', 'stream', 'crypto', 'path', 'fs', 'os'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
    ],
    server: {
      https: httpsConfig,
    },
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