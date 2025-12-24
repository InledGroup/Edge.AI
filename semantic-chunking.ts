// Semantic Chunking for Better RAG Performance
// Chunks text by semantic structure (paragraphs, sections) instead of fixed character count

export interface ChunkMetadata {
  type: 'paragraph' | 'list' | 'heading' | 'mixed';
  index: number;
  totalChunks: number;
  prevContext?: string; // Last sentence of previous chunk
  nextContext?: string; // First sentence of next chunk
}

export interface SemanticChunk {
  content: string;
  metadata: ChunkMetadata;
}

/**
 * Split text into semantic chunks with intelligent overlap
 * Better than fixed-size chunking because it preserves meaning
 */
export function semanticChunkText(
  text: string,
  targetSize = 800, // Target size (will vary based on structure)
  minSize = 400 // Minimum chunk size
): SemanticChunk[] {
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
function detectParagraphType(text: string): 'paragraph' | 'list' | 'heading' | 'mixed' {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);

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
