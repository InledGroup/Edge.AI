/**
 * Content Extractor
 *
 * Extrae texto limpio y estructurado de HTML para procesamiento RAG.
 * Elimina elementos no deseados y preserva la estructura semántica.
 */

import type {
  CleanedContent,
  ContentExtractionOptions,
} from './types';

/**
 * Selectores CSS de elementos a eliminar
 */
const DEFAULT_SELECTORS_TO_REMOVE = [
  // Scripts y estilos
  'script',
  'style',
  'noscript',

  // Navegación y estructura
  'nav',
  'header',
  'footer',
  'aside',
  'menu',

  // Roles ARIA
  '[role="navigation"]',
  '[role="banner"]',
  '[role="complementary"]',
  '[role="contentinfo"]',

  // Publicidad y tracking
  '.ad',
  '.ads',
  '.advertisement',
  '[class*="advert"]',
  '[id*="advert"]',
  '.sponsored',
  '.social-share',
  '.share-buttons',

  // UI elements
  '.sidebar',
  '.cookie-notice',
  '.cookie-banner',
  '.newsletter',
  '.popup',
  '.modal',
  '.breadcrumb',

  // Comments
  '.comments',
  '#comments',
  '.comment-section',

  // SVG y canvas (no son texto)
  'svg',
  'canvas',

  // Forms (generalmente no relevantes para contenido)
  'form',
  'button',
];

/**
 * Tags que deben generar saltos de línea
 */
const BLOCK_LEVEL_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'li',
  'blockquote',
  'pre',
  'hr',
  'br',
]);

/**
 * Tags de encabezado (generan doble salto)
 */
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * Extractor de contenido limpio desde HTML
 */
export class ContentExtractor {
  /**
   * Extrae contenido limpio de HTML
   */
  extract(
    html: string,
    url: string,
    options: ContentExtractionOptions = {}
  ): CleanedContent {
    console.log(`🌐 [ContentExtractor] Extracting content from: ${url}`);
    console.log(`📄 [ContentExtractor] HTML size: ${html.length} characters`);

    // Crear DOM temporal (scripts NO se ejecutan)
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    if (!doc.body) {
      throw new Error('Invalid HTML: no body element');
    }

    // Eliminar elementos no deseados
    this.removeUnwantedElements(doc, options);

    // Extraer título
    const title = this.extractTitle(doc);
    console.log(`📌 [ContentExtractor] Title: ${title}`);

    // Extraer metadata
    const metadata = this.extractMetadata(doc);

    // Extraer contenido principal
    const text = this.extractMainContent(doc, options);

    // Contar palabras
    const wordCount = this.countWords(text);
    console.log(`📊 [ContentExtractor] Extracted ${wordCount} words (${text.length} chars)`);
    console.log(`✂️ [ContentExtractor] First 200 chars: ${text.substring(0, 200)}...`);

    return {
      text,
      title,
      url,
      extractedAt: Date.now(),
      wordCount,
      metadata,
    };
  }

  /**
   * Elimina elementos no deseados del documento
   */
  private removeUnwantedElements(
    doc: Document,
    options: ContentExtractionOptions
  ): void {
    const selectorsToRemove = [
      ...DEFAULT_SELECTORS_TO_REMOVE,
      ...(options.customSelectorsToRemove || []),
    ];

    selectorsToRemove.forEach((selector) => {
      try {
        doc.querySelectorAll(selector).forEach((el) => el.remove());
      } catch (error) {
        // Selector inválido, ignorar
        console.warn(`Invalid selector: ${selector}`, error);
      }
    });

    // Eliminar elementos ocultos
    doc.querySelectorAll('[hidden], [style*="display:none"], [style*="display: none"]')
      .forEach((el) => el.remove());

    // Eliminar atributos peligrosos
    doc.querySelectorAll('[onclick], [onload], [onerror]').forEach((el) => {
      el.removeAttribute('onclick');
      el.removeAttribute('onload');
      el.removeAttribute('onerror');
    });
  }

  /**
   * Extrae el título de la página
   */
  private extractTitle(doc: Document): string {
    // Prioridad 1: h1 visible
    const h1 = doc.querySelector('h1');
    if (h1) {
      const text = h1.textContent?.trim();
      if (text && text.length > 0 && text.length < 200) {
        return text;
      }
    }

    // Prioridad 2: og:title
    const ogTitle = doc
      .querySelector('meta[property="og:title"]')
      ?.getAttribute('content')
      ?.trim();
    if (ogTitle && ogTitle.length > 0) {
      return ogTitle;
    }

    // Prioridad 3: twitter:title
    const twitterTitle = doc
      .querySelector('meta[name="twitter:title"]')
      ?.getAttribute('content')
      ?.trim();
    if (twitterTitle && twitterTitle.length > 0) {
      return twitterTitle;
    }

    // Prioridad 4: <title>
    const title = doc.querySelector('title')?.textContent?.trim();
    if (title && title.length > 0) {
      // Limpiar sufijos comunes (e.g., " - Wikipedia")
      return title.split(/[|•·]|( - )|( – )/)[0].trim();
    }

    return 'Sin título';
  }

  /**
   * Extrae metadata de la página
   */
  private extractMetadata(doc: Document): CleanedContent['metadata'] {
    const metadata: CleanedContent['metadata'] = {};

    // Autor
    const author =
      doc.querySelector('meta[name="author"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="article:author"]')?.getAttribute('content') ||
      doc.querySelector('[rel="author"]')?.textContent;

    if (author?.trim()) {
      metadata.author = author.trim();
    }

    // Fecha de publicación
    const publishedTime =
      doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
      doc.querySelector('meta[name="publish-date"]')?.getAttribute('content') ||
      doc.querySelector('time[datetime]')?.getAttribute('datetime');

    if (publishedTime?.trim()) {
      metadata.publishedAt = publishedTime.trim();
    }

    // Descripción
    const description =
      doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      doc.querySelector('meta[name="twitter:description"]')?.getAttribute('content');

    if (description?.trim()) {
      metadata.description = description.trim();
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  /**
   * Extrae el contenido principal de la página
   */
  private extractMainContent(
    doc: Document,
    options: ContentExtractionOptions
  ): string {
    // Intentar encontrar el contenido principal
    const main = this.findMainContent(doc);

    if (!main) {
      throw new Error('Could not find main content in page');
    }

    // Convertir DOM a texto estructurado
    let text = this.nodeToText(main);

    // Aplicar límite de palabras si está configurado
    if (options.maxWords && options.maxWords > 0) {
      text = this.truncateToWords(text, options.maxWords);
    }

    return text;
  }

  /**
   * Encuentra el elemento que contiene el contenido principal
   */
  private findMainContent(doc: Document): Element | null {
    // Selectores de contenido principal (en orden de prioridad)
    const mainSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.main-content',
      '#main-content',
      '.content',
      '#content',
      '.post-content',
      '.article-content',
      '.entry-content',
    ];

    for (const selector of mainSelectors) {
      const element = doc.querySelector(selector);
      if (element && this.hasSignificantContent(element)) {
        return element;
      }
    }

    // Fallback: buscar el elemento con más texto
    return this.findElementWithMostText(doc.body);
  }

  /**
   * Verifica si un elemento tiene contenido significativo
   */
  private hasSignificantContent(element: Element): boolean {
    const text = element.textContent?.trim() || '';
    const wordCount = this.countWords(text);

    // Al menos 100 palabras para considerar significativo
    // (aumentado de 50 para filtrar mejor sidebars y headers)
    return wordCount >= 100;
  }

  /**
   * Encuentra el elemento con más contenido de texto
   * MEJORADO: Más factores de scoring para mejor precisión
   */
  private findElementWithMostText(root: Element): Element | null {
    let maxScore = 0;
    let bestElement: Element | null = null;

    // Buscar en elementos potencialmente relevantes
    const candidates = root.querySelectorAll('div, section, article, main');

    candidates.forEach((element) => {
      // Calcular score basado en múltiples factores
      const text = this.getDirectText(element);
      const wordCount = this.countWords(text);

      if (wordCount < 50) {
        return; // Skip elements with very little content
      }

      // === BASE SCORE ===
      let score = wordCount;

      // === SEMANTIC TAGS BONUS ===
      const tagName = element.tagName.toLowerCase();
      if (tagName === 'article') score *= 1.5;
      if (tagName === 'main') score *= 1.4;
      if (tagName === 'section') score *= 1.1;

      // === CLASS/ID BONUS ===
      const className = element.className.toLowerCase();
      const id = element.id.toLowerCase();

      const contentIndicators = ['content', 'article', 'post', 'entry', 'body', 'text'];
      const hasContentClass = contentIndicators.some(ind =>
        className.includes(ind) || id.includes(ind)
      );
      if (hasContentClass) {
        score *= 1.3;
      }

      // === SIDEBAR/NAV PENALTY ===
      const noiseIndicators = ['sidebar', 'aside', 'widget', 'navigation', 'menu', 'footer', 'header'];
      const isNoise = noiseIndicators.some(ind =>
        className.includes(ind) || id.includes(ind)
      );
      if (isNoise) {
        score *= 0.2;
      }

      // === LINK DENSITY PENALTY ===
      // Real content has low link density
      const links = element.querySelectorAll('a');
      const linkText = Array.from(links).reduce((sum, link) =>
        sum + (link.textContent?.length || 0), 0
      );
      const textLength = text.length;
      const linkDensity = textLength > 0 ? linkText / textLength : 0;

      if (linkDensity > 0.5) {
        score *= 0.3; // Heavy penalty for link-heavy content
      } else if (linkDensity > 0.3) {
        score *= 0.7;
      }

      // === TEXT/HTML RATIO BONUS ===
      // Real content has high text-to-HTML ratio
      const htmlLength = element.innerHTML.length;
      const textRatio = htmlLength > 0 ? textLength / htmlLength : 0;

      if (textRatio > 0.3) {
        score *= 1.2; // Bonus for text-heavy content
      }

      // === PARAGRAPH DENSITY BONUS ===
      // Real content has many paragraphs
      const paragraphs = element.querySelectorAll('p');
      const paragraphCount = paragraphs.length;

      if (paragraphCount > 3) {
        score *= 1.1;
      }

      // === TABLE BONUS ===
      // Tables often contain important structured data
      const tables = element.querySelectorAll('table');
      if (tables.length > 0 && tables.length < 5) {
        score *= 1.15; // Moderate bonus for tables
      }

      // === WIDTH PENALTY ===
      // Penalize very narrow elements (sidebars)
      if (element instanceof HTMLElement) {
        const width = element.offsetWidth;
        if (width > 0 && width < 300) {
          score *= 0.4;
        } else if (width > 0 && width < 500) {
          score *= 0.8;
        }
      }

      if (score > maxScore) {
        maxScore = score;
        bestElement = element;
      }
    });

    console.log(`📊 [ContentExtractor] Best element score: ${maxScore.toFixed(0)}`);

    // Si no encontramos nada bueno, usar body
    return bestElement || root;
  }

  /**
   * Obtiene el texto directo de un elemento (incluyendo hijos inmediatos de párrafos)
   */
  private getDirectText(element: Element): string {
    const parts: string[] = [];

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          const el = node as Element;
          const tag = el.tagName.toLowerCase();

          // Aceptar párrafos, listas, headings
          if (['p', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre'].includes(tag)) {
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_SKIP;
        },
      }
    );

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent?.trim();
      if (text) {
        parts.push(text);
      }
    }

    return parts.join(' ');
  }

  /**
   * Convierte un nodo DOM a texto plano estructurado
   * MEJORADO: Soporte para tablas y mejor preservación de estructura
   */
  private nodeToText(node: Node): string {
    const parts: string[] = [];
    let lastWasBlock = false;

    // First, extract tables separately for better formatting
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tables = element.querySelectorAll('table');

      tables.forEach(table => {
        const tableText = this.extractTableContent(table);
        if (tableText) {
          parts.push('\n\n[TABLA]\n' + tableText + '\n[FIN TABLA]\n\n');
          // Remove table from DOM to avoid double-processing
          table.replaceWith(document.createTextNode('[tabla procesada]'));
        }
      });
    }

    const walker = document.createTreeWalker(
      node,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            return NodeFilter.FILTER_ACCEPT;
          }

          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            const tag = el.tagName.toLowerCase();

            // Skip elementos específicos
            if (tag === 'script' || tag === 'style' || tag === 'table') {
              return NodeFilter.FILTER_REJECT;
            }

            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_SKIP;
        },
      }
    );

    let currentNode: Node | null;

    while ((currentNode = walker.nextNode())) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        const text = currentNode.textContent?.trim();
        if (text && text.length > 0) {
          parts.push(text);
          lastWasBlock = false;
        }
      } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
        const el = currentNode as Element;
        const tag = el.tagName.toLowerCase();

        // Agregar saltos de línea según tipo de elemento
        if (HEADING_TAGS.has(tag)) {
          if (!lastWasBlock) {
            parts.push('\n');
          }
          parts.push('\n'); // Doble salto para headings
          lastWasBlock = true;
        } else if (BLOCK_LEVEL_TAGS.has(tag)) {
          if (!lastWasBlock) {
            parts.push('\n');
            lastWasBlock = true;
          }
        }
      }
    }

    // Unir y limpiar
    let result = parts.join(' ');

    // Normalizar espacios
    result = result.replace(/[ \t]+/g, ' '); // Múltiples espacios → uno
    result = result.replace(/\n +/g, '\n'); // Espacios después de newline
    result = result.replace(/ +\n/g, '\n'); // Espacios antes de newline
    result = result.replace(/\n{3,}/g, '\n\n'); // Múltiples newlines → dos

    return result.trim();
  }

  /**
   * Extrae contenido de tabla en formato legible
   */
  private extractTableContent(table: Element): string {
    const rows: string[] = [];

    const tableRows = table.querySelectorAll('tr');

    tableRows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('td, th');
      const cellTexts = Array.from(cells).map(cell =>
        cell.textContent?.trim() || ''
      ).filter(text => text.length > 0);

      if (cellTexts.length > 0) {
        // Format: Column1 | Column2 | Column3
        rows.push(cellTexts.join(' | '));

        // Add separator after header row
        if (rowIndex === 0 && row.querySelector('th')) {
          rows.push('-'.repeat(50));
        }
      }
    });

    return rows.join('\n');
  }

  /**
   * Cuenta palabras en un texto
   */
  private countWords(text: string): number {
    const words = text.match(/\b\w+\b/g);
    return words ? words.length : 0;
  }

  /**
   * Trunca texto a un número máximo de palabras
   */
  private truncateToWords(text: string, maxWords: number): string {
    const words = text.split(/\s+/);
    if (words.length <= maxWords) {
      return text;
    }

    return words.slice(0, maxWords).join(' ') + '...';
  }
}

/**
 * Instancia singleton del extractor
 */
export const contentExtractor = new ContentExtractor();
