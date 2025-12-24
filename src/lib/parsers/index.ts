// Unified Document Parser
// Single entry point for parsing all supported document types

import { parseTxtFile, isTxtFile } from './txt';
import { parseMarkdownFile, isMarkdownFile, extractFrontmatter } from './markdown';
import { parsePdfFile, isPdfFile, type PDFParseResult } from './pdf';

export type SupportedDocumentType = 'pdf' | 'txt' | 'md';

export interface ParseResult {
  text: string;
  type: SupportedDocumentType;
  metadata?: {
    title?: string;
    author?: string;
    pageCount?: number;
    frontmatter?: Record<string, any>;
    [key: string]: any;
  };
}

export interface ParseOptions {
  onProgress?: (progress: number, message: string) => void;
  preserveMarkdownFormatting?: boolean;
}

/**
 * Parse any supported document type
 * Automatically detects type and uses appropriate parser
 */
export async function parseDocument(
  file: File,
  options: ParseOptions = {}
): Promise<ParseResult> {
  const { onProgress, preserveMarkdownFormatting = true } = options;

  console.log(`📄 Parsing document: ${file.name} (${file.type})`);

  // Detect document type
  const type = detectDocumentType(file);

  if (!type) {
    throw new Error(
      `Unsupported file type: ${file.name}. Supported types: PDF, TXT, MD`
    );
  }

  try {
    switch (type) {
      case 'pdf': {
        onProgress?.(0, 'Procesando PDF...');
        const pdfResult = await parsePdfFile(file, onProgress);
        return {
          text: pdfResult.text,
          type: 'pdf',
          metadata: pdfResult.metadata
        };
      }

      case 'md': {
        onProgress?.(0, 'Procesando Markdown...');
        const text = await parseMarkdownFile(file, preserveMarkdownFormatting);

        // Extract frontmatter if present
        const { metadata: frontmatter } = extractFrontmatter(text);

        onProgress?.(100, 'Markdown procesado');

        return {
          text,
          type: 'md',
          metadata: {
            frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : undefined
          }
        };
      }

      case 'txt': {
        onProgress?.(0, 'Procesando texto...');
        const text = await parseTxtFile(file);
        onProgress?.(100, 'Texto procesado');

        return {
          text,
          type: 'txt'
        };
      }

      default:
        throw new Error(`Unsupported document type: ${type}`);
    }
  } catch (error) {
    console.error(`❌ Failed to parse ${type.toUpperCase()} file:`, error);
    throw error;
  }
}

/**
 * Detect document type from file
 */
export function detectDocumentType(file: File): SupportedDocumentType | null {
  if (isPdfFile(file)) return 'pdf';
  if (isMarkdownFile(file)) return 'md';
  if (isTxtFile(file)) return 'txt';

  return null;
}

/**
 * Check if a file is supported
 */
export function isSupportedDocument(file: File): boolean {
  return detectDocumentType(file) !== null;
}

/**
 * Get list of supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return ['.pdf', '.txt', '.md', '.markdown'];
}

/**
 * Get accept attribute value for file input
 */
export function getFileInputAccept(): string {
  return '.pdf,.txt,.md,.markdown,text/plain,application/pdf,text/markdown';
}

/**
 * Validate file before parsing
 */
export function validateFile(file: File): {
  valid: boolean;
  error?: string;
} {
  // Check if type is supported
  if (!isSupportedDocument(file)) {
    return {
      valid: false,
      error: `Tipo de archivo no soportado. Soportados: ${getSupportedExtensions().join(', ')}`
    };
  }

  // Check file size (max 50MB)
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `Archivo demasiado grande. Máximo: 50MB, actual: ${(file.size / 1024 / 1024).toFixed(1)}MB`
    };
  }

  // Check if file is empty
  if (file.size === 0) {
    return {
      valid: false,
      error: 'El archivo está vacío'
    };
  }

  return { valid: true };
}

/**
 * Parse multiple files in batch
 */
export async function parseDocumentsBatch(
  files: File[],
  onProgress?: (fileIndex: number, progress: number, message: string) => void
): Promise<ParseResult[]> {
  const results: ParseResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    console.log(`📦 Processing file ${i + 1}/${files.length}: ${file.name}`);

    const result = await parseDocument(file, {
      onProgress: (progress, message) => {
        onProgress?.(i, progress, message);
      }
    });

    results.push(result);
  }

  return results;
}

// Re-export individual parsers for advanced usage
export { parseTxtFile, isTxtFile } from './txt';
export { parseMarkdownFile, isMarkdownFile, extractFrontmatter } from './markdown';
export { parsePdfFile, isPdfFile, getPdfInfo } from './pdf';
export type { PDFParseResult } from './pdf';
