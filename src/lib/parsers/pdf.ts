// PDF Parser - Extract text from PDF files using pdf.js
// Handles multi-page PDFs with page metadata

// Load pdfjs from CDN dynamically
let pdfjsLib: any = null;

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;

  // Load from CDN
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  document.head.appendChild(script);

  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });

  pdfjsLib = (window as any).pdfjsLib;

  // Configure worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  return pdfjsLib;
}

export interface PDFPageContent {
  pageNumber: number;
  text: string;
  metadata?: {
    width: number;
    height: number;
  };
}

export interface PDFParseResult {
  text: string;
  pages: PDFPageContent[];
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    pageCount: number;
  };
}

/**
 * Parse a PDF file and extract all text
 * @param file - The PDF file to parse
 * @param onProgress - Optional callback for progress updates
 */
export async function parsePdfFile(
  file: File,
  onProgress?: (progress: number, message: string) => void
): Promise<PDFParseResult> {
  try {
    console.log(`📕 Parsing PDF file: ${file.name} (${file.size} bytes)`);
    onProgress?.(0, 'Cargando PDF.js...');

    // Load PDF.js library
    const pdfjs = await loadPdfJs();

    onProgress?.(10, 'Cargando PDF...');

    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Load PDF document
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true
    });

    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;

    console.log(`📄 PDF has ${pageCount} pages`);
    onProgress?.(10, `PDF cargado: ${pageCount} páginas`);

    // Get metadata
    const metadata = await pdf.getMetadata();
    const pdfMetadata = {
      title: metadata.info?.Title || file.name,
      author: metadata.info?.Author,
      subject: metadata.info?.Subject,
      pageCount
    };

    // Extract text from all pages
    const pages: PDFPageContent[] = [];
    const textParts: string[] = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const progress = 10 + Math.round((pageNum / pageCount) * 80);
      onProgress?.(progress, `Procesando página ${pageNum}/${pageCount}...`);

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });

      // Extract text content
      const textContent = await page.getTextContent();

      // Combine text items into a single string
      const pageText = textContent.items
        .map((item: any) => {
          // Handle both TextItem and TextMarkedContent
          if ('str' in item) {
            return item.str;
          }
          return '';
        })
        .join(' ');

      // Clean and normalize the text
      const cleanedText = cleanPdfText(pageText);

      if (cleanedText.trim()) {
        pages.push({
          pageNumber: pageNum,
          text: cleanedText,
          metadata: {
            width: viewport.width,
            height: viewport.height
          }
        });

        textParts.push(`[Página ${pageNum}]\n${cleanedText}`);
      }

      // Cleanup
      page.cleanup();
    }

    onProgress?.(95, 'Finalizando...');

    // Combine all pages
    const fullText = textParts.join('\n\n');

    onProgress?.(100, 'PDF procesado');

    console.log(`✅ Extracted ${fullText.length} characters from ${pageCount} pages`);

    return {
      text: fullText,
      pages,
      metadata: pdfMetadata
    };
  } catch (error) {
    console.error('❌ Failed to parse PDF file:', error);
    throw new Error(
      `Failed to parse PDF file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Clean and normalize PDF text
 * PDFs often have weird spacing and line breaks
 */
function cleanPdfText(text: string): string {
  // Remove null characters
  let cleaned = text.replace(/\0/g, '');

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');

  // Fix common PDF artifacts
  cleaned = cleaned
    .replace(/(\w)-\s+(\w)/g, '$1$2') // Fix hyphenated words split across lines
    .replace(/([a-z])\s+([A-Z])/g, '$1. $2') // Add periods where likely missing
    .trim();

  // Try to restore paragraph breaks (look for sentence endings followed by caps)
  cleaned = cleaned.replace(/([.!?])\s+([A-Z])/g, '$1\n\n$2');

  return cleaned;
}

/**
 * Extract text from specific pages only
 */
export async function parsePdfPages(
  file: File,
  pageNumbers: number[]
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const textParts: string[] = [];

  for (const pageNum of pageNumbers) {
    if (pageNum < 1 || pageNum > pdf.numPages) {
      console.warn(`⚠️ Page ${pageNum} out of range, skipping`);
      continue;
    }

    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item: any) => item.str || '')
      .join(' ');

    const cleaned = cleanPdfText(pageText);
    if (cleaned.trim()) {
      textParts.push(cleaned);
    }

    page.cleanup();
  }

  return textParts.join('\n\n');
}

/**
 * Validate if file is a PDF
 */
export function isPdfFile(file: File): boolean {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith('.pdf') || file.type === 'application/pdf';
}

/**
 * Get PDF info without extracting full text (fast)
 */
export async function getPdfInfo(file: File): Promise<{
  pageCount: number;
  title?: string;
  author?: string;
  fileSize: number;
}> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const metadata = await pdf.getMetadata();

  return {
    pageCount: pdf.numPages,
    title: metadata.info?.Title,
    author: metadata.info?.Author,
    fileSize: file.size
  };
}
