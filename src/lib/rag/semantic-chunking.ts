// Semantic Chunking for Better RAG Performance
// Chunks text by semantic structure (paragraphs, sections) instead of fixed character count

export interface ChunkMetadata {
  type: 'paragraph' | 'list' | 'heading' | 'mixed' | 'code';
  index: number;
  totalChunks: number;
  prevContext?: string; // Last sentence of previous chunk
  nextContext?: string; // First sentence of next chunk
}

/**
 * Document type for adaptive chunking
 */
export type DocumentType =
  | 'code'           // Source code, needs larger chunks
  | 'technical'      // Technical documentation
  | 'article'        // Articles, blog posts
  | 'general'        // General text
  | 'web'            // Web content
  | 'auto';          // Auto-detect

/**
 * Chunk size configuration based on document type
 */
export interface ChunkSizeConfig {
  targetSize: number;
  minSize: number;
  overlapRatio: number; // 0-1
}

export interface SemanticChunk {
  content: string;
  metadata: ChunkMetadata;
}

/**
 * Get optimal chunk size configuration based on document type
 */
export function getOptimalChunkSize(
  documentType: DocumentType,
  text: string
): ChunkSizeConfig {
  // Auto-detect document type if needed
  if (documentType === 'auto') {
    documentType = detectDocumentType(text);
    console.log(`📋 [Chunking] Auto-detected document type: ${documentType}`);
  }

  switch (documentType) {
    case 'code':
      // Code needs larger chunks to preserve context (functions, classes)
      return { targetSize: 1200, minSize: 600, overlapRatio: 0.20 };

    case 'technical':
      // Technical docs need substantial context
      return { targetSize: 1000, minSize: 500, overlapRatio: 0.15 };

    case 'article':
      // Articles: balanced approach
      return { targetSize: 800, minSize: 400, overlapRatio: 0.10 };

    case 'web':
      // Web content: smaller chunks (denser info)
      return { targetSize: 600, minSize: 300, overlapRatio: 0.10 };

    case 'general':
    default:
      // Default: moderate size
      return { targetSize: 800, minSize: 400, overlapRatio: 0.10 };
  }
}

/**
 * Auto-detect document type from content
 */
export function detectDocumentType(text: string): DocumentType {
  const sample = text.substring(0, 2000).toLowerCase();

  // Check for code patterns
  const codePatterns = [
    /function\s+\w+\s*\(/,
    /class\s+\w+/,
    /import\s+.*from/,
    /const\s+\w+\s*=/,
    /def\s+\w+\s*\(/,
    /public\s+(class|interface|enum)/,
    /<\?php/,
    /```[\w]*\n/
  ];

  const codeMatches = codePatterns.filter(pattern => pattern.test(sample)).length;
  if (codeMatches >= 2) {
    return 'code';
  }

  // Check for technical documentation
  const technicalKeywords = ['api', 'algorithm', 'implementation', 'parameter', 'configuration', 'dependency'];
  const technicalCount = technicalKeywords.filter(kw => sample.includes(kw)).length;
  if (technicalCount >= 3) {
    return 'technical';
  }

  // Check for article/blog patterns
  const articlePatterns = [
    /^\s*#\s+/m,  // Markdown headers
    /\n\n.*\n\n/, // Multiple paragraphs
    /published|author|posted/i
  ];

  const articleMatches = articlePatterns.filter(pattern => pattern.test(sample)).length;
  if (articleMatches >= 2) {
    return 'article';
  }

  // Default to general
  return 'general';
}

/**
 * Split text into semantic chunks with intelligent overlap
 * Better than fixed-size chunking because it preserves meaning
 * Now supports adaptive chunking based on document type
 */
export function semanticChunkText(
  text: string,
  targetSize = 800, // Target size (will vary based on structure)
  minSize = 400, // Minimum chunk size
  documentType: DocumentType = 'auto'
): SemanticChunk[] {
  // Get optimal chunk size for this document type
  const config = getOptimalChunkSize(documentType, text);

  // Override with provided values if specified
  const actualTargetSize = targetSize !== 800 ? targetSize : config.targetSize;
  const actualMinSize = minSize !== 400 ? minSize : config.minSize;

  console.log(`✂️ [Chunking] Using targetSize=${actualTargetSize}, minSize=${actualMinSize}, type=${documentType}`);

  targetSize = actualTargetSize;
  minSize = actualMinSize;
  // Normalize line breaks
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split by double newlines (paragraphs)
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: SemanticChunk[] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const paragraphSize = paragraph.length;

    // Detect type
    const type = detectParagraphType(paragraph);

    // If paragraph alone is too big, split it by sentences
    if (paragraphSize > targetSize * 1.5) {
      // Flush current chunk if not empty
      if (currentChunk.length > 0) {
        chunks.push(createChunk(currentChunk, chunks.length));
        currentChunk = [];
        currentSize = 0;
      }

      // Split large paragraph by sentences
      const sentences = splitIntoSentences(paragraph);
      let sentenceChunk: string[] = [];
      let sentenceSize = 0;

      for (const sentence of sentences) {
        if (sentenceSize + sentence.length > targetSize && sentenceChunk.length > 0) {
          chunks.push(createChunk(sentenceChunk, chunks.length));
          // Keep last sentence for context
          sentenceChunk = [sentenceChunk[sentenceChunk.length - 1], sentence];
          sentenceSize = sentenceChunk[0].length + sentence.length;
        } else {
          sentenceChunk.push(sentence);
          sentenceSize += sentence.length;
        }
      }

      if (sentenceChunk.length > 0) {
        chunks.push(createChunk(sentenceChunk, chunks.length));
      }

      continue;
    }

    // If adding this paragraph exceeds target size, create chunk
    if (currentSize + paragraphSize > targetSize && currentChunk.length > 0) {
      chunks.push(createChunk(currentChunk, chunks.length));

      // Start new chunk with overlap (last paragraph)
      if (currentChunk.length > 0) {
        currentChunk = [currentChunk[currentChunk.length - 1], paragraph];
        currentSize = currentChunk[0].length + paragraphSize;
      } else {
        currentChunk = [paragraph];
        currentSize = paragraphSize;
      }
    } else {
      currentChunk.push(paragraph);
      currentSize += paragraphSize;
    }
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push(createChunk(currentChunk, chunks.length));
  }

  // Add total chunks metadata and context
  return chunks.map((chunk, i) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      totalChunks: chunks.length,
      prevContext: i > 0 ? getLastSentence(chunks[i - 1].content) : undefined,
      nextContext: i < chunks.length - 1 ? getFirstSentence(chunks[i + 1].content) : undefined,
    },
  }));
}

/**
 * Create chunk from paragraphs
 */
function createChunk(paragraphs: string[], index: number): SemanticChunk {
  const content = paragraphs.join('\n\n');
  const type = detectParagraphType(content);

  return {
    content,
    metadata: {
      type,
      index,
      totalChunks: 0, // Will be set later
    },
  };
}

/**
 * Detect paragraph type
 */
function detectParagraphType(text: string): 'paragraph' | 'list' | 'heading' | 'mixed' | 'code' {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);

  // Code block: contains code markers or patterns
  const codeMarkers = [
    /^```/,
    /^\s*(function|class|const|let|var|def|public|private)\s/,
    /^\s*[{}\[\];]/,
    /^\s*(if|for|while|switch)\s*\(/
  ];

  const codeLineCount = lines.filter(line =>
    codeMarkers.some(marker => marker.test(line))
  ).length;

  if (codeLineCount > lines.length * 0.3) { // 30% of lines look like code
    return 'code';
  }

  // Heading: short line (< 100 chars) ending without period
  if (lines.length === 1 && lines[0].length < 100 && !lines[0].endsWith('.')) {
    return 'heading';
  }

  // List: multiple lines starting with -, *, numbers, or bullets
  const listLines = lines.filter((l) => /^[\-\*\•\d]+[\.\)]\s/.test(l.trim()));
  if (listLines.length > 0) {
    return listLines.length === lines.length ? 'list' : 'mixed';
  }

  return 'paragraph';
}

/**
 * Split text into sentences
 */
function splitIntoSentences(text: string): string[] {
  // Split by period, question mark, exclamation mark followed by space or newline
  return text
    .split(/([.!?]+[\s\n]+)/)
    .reduce((acc: string[], part, i, arr) => {
      if (i % 2 === 0 && part.trim()) {
        const sentence = part + (arr[i + 1] || '');
        acc.push(sentence.trim());
      }
      return acc;
    }, [])
    .filter((s) => s.length > 0);
}

/**
 * Get first sentence from text
 */
function getFirstSentence(text: string): string {
  const sentences = splitIntoSentences(text);
  return sentences[0] || text.substring(0, 150);
}

/**
 * Get last sentence from text
 */
function getLastSentence(text: string): string {
  const sentences = splitIntoSentences(text);
  return sentences[sentences.length - 1] || text.substring(Math.max(0, text.length - 150));
}

/**
 * Format chunk with context for better RAG retrieval
 */
export function formatChunkWithContext(chunk: SemanticChunk): string {
  let formatted = chunk.content;

  // Add previous context if available
  if (chunk.metadata.prevContext) {
    formatted = `[Contexto anterior]: ${chunk.metadata.prevContext}\n\n${formatted}`;
  }

  // Add next context if available
  if (chunk.metadata.nextContext) {
    formatted = `${formatted}\n\n[Continúa]: ${chunk.metadata.nextContext}`;
  }

  return formatted;
}
