import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';
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
      "Cross-Origin-Embedder-Policy": "credentialless",
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