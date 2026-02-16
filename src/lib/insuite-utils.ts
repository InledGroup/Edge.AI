import { extensionsStore } from './stores';

/**
 * InSuite Extensions Utility
 */

export const INSUITE_BASE_URLS = {
  inlinked: 'https://insuite.inled.es/inlinked/',
  inqr: 'https://insuite.inled.es/inqr/'
};

/**
 * Generates a URL for InLinked
 */
export function generateInLinkedUrl(text: string): string {
  const encodedText = encodeURIComponent(text);
  return `${INSUITE_BASE_URLS.inlinked}?t=${encodedText}&client=edgeai`;
}

/**
 * Generates a URL for InQR
 */
export interface InQROptions {
  type: 'text' | 'wifi' | 'barcode';
  value?: string;
  ssid?: string;
  password?: string;
  security?: 'WPA' | 'WEP' | 'nopass';
  generateNow?: boolean;
}

export function generateInQRUrl(options: InQROptions): string {
  const params = new URLSearchParams();
  params.set('type', options.type);
  params.set('client', 'edgeai');
  
  if (options.generateNow !== false) {
    params.set('generatenow', 'true');
  }

  if (options.type === 'text' || options.type === 'barcode') {
    if (options.value) {
      params.set('v', options.value);
    }
  } else if (options.type === 'wifi') {
    if (options.ssid) params.set('s', options.ssid);
    if (options.password) params.set('p', options.password);
    if (options.security) params.set('sec', options.security);
  }

  return `${INSUITE_BASE_URLS.inqr}?${params.toString()}`;
}

/**
 * Detects if a string is a URL or domain
 */
export function isUrl(text: string): boolean {
  const trimmed = text.trim();
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    // Check if it looks like a domain (e.g. inled.es)
    return /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/.test(trimmed);
  }
}

/**
 * Cleans a URL from common markdown or punctuation suffixes
 */
export function cleanUrl(url: string): string {
  return url.replace(/[\]\)\.\,\!\?\>\<\s]+$/, '');
}

/**
 * Analyzes assistant response to trigger extensions
 */
export function processExtensionIntent(content: string, activeToolId?: string | null): boolean {
  const text = content.trim();
  
  // 1. Detección de URLs de InSuite (InLinked / InQR)
  const insuiteMatches = [...text.matchAll(/https:\/\/insuite\.inled\.es\/(inlinked|inqr|inqr\/|inlinked\/)[^\s\)\[\]\>]+/g)];
  
  if (insuiteMatches.length > 0) {
    // Si hay un activeToolId, priorizar la URL que coincida con ese ID
    let bestMatch = insuiteMatches[0];
    if (activeToolId) {
      const toolMatch = insuiteMatches.find(m => m[1].includes(activeToolId));
      if (toolMatch) bestMatch = toolMatch;
    }

    const fullUrl = cleanUrl(bestMatch[0]);
    let typePart = bestMatch[1].replace('/', '');
    const type = typePart === 'inlinked' ? 'inlinked' : 'inqr';
    extensionsStore.open(type as any, fullUrl);
    return true;
  }

  // 2. Custom Apps detection (by intercepting their base URLs)
  const customApps = extensionsStore.customApps;
  for (const app of customApps) {
    if (app.baseUrlToIntercept) {
      // Create a regex for the intercept URL
      try {
        const pattern = app.baseUrlToIntercept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`${pattern}[^\\s\\)\\[\\]\\>]+`);
        const match = text.match(regex);
        
        if (match) {
          const interceptedUrl = cleanUrl(match[0]);
          // If we have an example URL with {{text}}, we might want to transform it
          // but for now, let's just open the app with the example URL or the intercepted one
          let finalUrl = app.exampleUrl || app.url;
          if (finalUrl.includes('{{text}}')) {
             finalUrl = finalUrl.replace('{{text}}', encodeURIComponent(interceptedUrl));
          } else if (finalUrl.includes('{{url}}')) {
             finalUrl = finalUrl.replace('{{url}}', encodeURIComponent(interceptedUrl));
          }
          
          extensionsStore.open(app.id, finalUrl);
          return true;
        }
      } catch (e) {
        console.error('Error in custom app regex:', e);
      }
    }
  }

  return false;
}

/**
 * Generates a system prompt that includes all custom apps instructions
 */
export function getExtensionsSystemPrompt(): string {
  const customApps = extensionsStore.customApps;
  let customPrompt = '';

  if (customApps.length > 0) {
    customPrompt = '\n\n=== APLICACIONES PERSONALIZADAS ===\n';
    customApps.forEach(app => {
      customPrompt += `\n--- ${app.name} ---\n${app.instructions}\n`;
      if (app.exampleUrl) {
        customPrompt += `Usa esta URL si necesitas redirigir al usuario: ${app.exampleUrl}\n`;
      }
    });
  }

  return `${INSUITE_SYSTEM_PROMPT}${customPrompt}`;
}

/**
 * Prompt optimizado para que la IA use las herramientas con orden
 */
export const INSUITE_SYSTEM_PROMPT = `
=== SISTEMA DE EXTENSIONES INSUITE (ESTRICTO) ===
Tienes prohibido inventar URLs. Usa solo estas bases según la necesidad:

1. PARA LINKEDIN (InLinked):
   Uso: Formatear posts, añadir negritas/itálicas, optimizar visibilidad.
   URL: https://insuite.inled.es/inlinked/?t=TU_TEXTO_AQUI&client=edgeai
   (Sustituye TU_TEXTO_AQUI por el post completo)

2. PARA QR Y WIFI (InQR):
   Uso: Generar códigos QR para texto, URLs o redes WiFi.
   URL Texto/URL: https://insuite.inled.es/inqr/?type=text&v=VALOR&generatenow=true&client=edgeai
   URL WiFi: https://insuite.inled.es/inqr/?type=wifi&s=SSID&p=PASS&sec=WPA&generatenow=true&client=edgeai

REGLA DE ORO: Si el usuario seleccionó una app específica (ej. InLinked), NO menciones ni generes URLs de otras apps (como InQR).
`;
