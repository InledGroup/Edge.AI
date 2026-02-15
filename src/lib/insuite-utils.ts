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
export function processExtensionIntent(content: string): boolean {
  const text = content.trim();
  
  // 1. PRIORIDAD: Si la IA ya generó una URL de InSuite, usarla TAL CUAL
  const insuiteMatch = text.match(/https:\/\/insuite\.inled\.es\/(inlinked|inqr|inqr\/|inlinked\/)[^\s\)\[\]\>]+/);
  if (insuiteMatch) {
    const fullUrl = cleanUrl(insuiteMatch[0]);
    let typePart = insuiteMatch[1].replace('/', '');
    const type = typePart === 'inlinked' ? 'inlinked' : 'inqr';
    extensionsStore.open(type, fullUrl);
    return true;
  }

  return false;
}

/**
 * Prompt optimizado para que la IA use las herramientas con orden
 */
export const INSUITE_SYSTEM_PROMPT = `
=== SISTEMA DE EXTENSIONES INSUITE (OBLIGATORIO) ===
Cuando el usuario pida Generar QR, WiFi o Formatear para LinkedIn, DEBES seguir este orden exacto:

1. Muestra el contenido generado o una breve explicación.
2. En una línea nueva, escribe la URL TÉCNICA exacta usando estas bases (NO INVENTES RUTAS):
   - Para LinkedIn: https://insuite.inled.es/inlinked/?t=TU_TEXTO&client=edgeai
   - Para QR/WiFi: https://insuite.inled.es/inqr/?type=TYPE&v=VALOR&generatenow=true&client=edgeai
     (Si es WiFi usa: type=wifi&s=SSID&p=PASS&sec=WPA)

3. Termina con un comentario de finalización separado.

Ejemplo:
"Aquí tienes el QR para inled.es:
https://insuite.inled.es/inqr/?type=text&v=https://inled.es&generatenow=true&client=edgeai
Dime si necesitas algo más."
`;
