/**
 * Hierarchical Document Index
 *
 * For long documents, creates a hierarchical structure:
 * - Document summary (level 0)
 * - Section summaries (level 1)
 * - Chunk content (level 2)
 *
 * Benefits:
 * - 2-stage retrieval: find relevant sections first, then chunks within
 * - Better context preservation
 * - More efficient for very long documents
 */

import type { Chunk } from '@/types';
import type { WllamaEngine } from '@/lib/ai/wllama-engine';
import type { WebLLMEngine } from '@/lib/ai/webllm-engine';

type LLMEngine = WebLLMEngine | WllamaEngine;

/**
 * Hierarchical node in document index
 */
export interface HierarchicalNode {
  id: string;
  type: 'document' | 'section' | 'chunk';
  level: number;              // 0=document, 1=section, 2=chunk
  title: string;
  summary?: string;           // For document and section nodes
  content?: string;           // For chunk nodes
  embedding?: Float32Array;
  children?: string[];        // IDs of child nodes
  parent?: string;            // ID of parent node
  metadata: {
    startChar?: number;
    endChar?: number;
    heading?: string;
  };
}

/**
 * Hierarchical index for a document
 */
export interface HierarchicalDocumentIndex {
  documentId: string;
  nodes: Map<string, HierarchicalNode>;
  rootNode: string;           // ID of document-level node
}

/**
 * Detect sections in text based on headings
 */
function detectSections(text: string): Array<{
  title: string;
  startChar: number;
  endChar: number;
  level: number;
}> {
  const sections: Array<{
    title: string;
    startChar: number;
    endChar: number;
    level: number;
  }> = [];

  // Detect markdown-style headings
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  let match;
  const matches: Array<{ index: number; level: number; title: string }> = [];

  while ((match = headingRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      level: match[1].length, // Number of # symbols
      title: match[2].trim()
    });
  }

  // Create sections from headings
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const next = matches[i + 1];

    sections.push({
      title: current.title,
      startChar: current.index,
      endChar: next ? next.index : text.length,
      level: current.level
    });
  }

  // If no headings found, treat entire document as one section
  if (sections.length === 0) {
    sections.push({
      title: 'Main Content',
      startChar: 0,
      endChar: text.length,
      level: 1
    });
  }

  return sections;
}

/**
 * Generate summary for a text section using LLM
 */
async function generateSummary(
  text: string,
  llmEngine: LLMEngine,
  type: 'document' | 'section'
): Promise<string> {
  const maxLength = type === 'document' ? 200 : 150;

  const prompt = `Resume el siguiente ${type === 'document' ? 'documento' : 'sección'} en máximo ${maxLength} palabras, capturando los puntos clave:

${text.substring(0, 2000)}${text.length > 2000 ? '...' : ''}

Resumen (máximo ${maxLength} palabras):`;

  try {
    let summary: string;

    if ('generateText' in llmEngine) {
      summary = await llmEngine.generateText(prompt, {
        temperature: 0.3,
        maxTokens: Math.ceil(maxLength * 1.5),
        stop: ['Resume el siguiente'],
        stream: false
      });
    } else if ('createChatCompletion' in llmEngine) {
      summary = await llmEngine.createChatCompletion(
        [{ role: 'user', content: prompt }],
        {
          temperature: 0.3,
          max_tokens: Math.ceil(maxLength * 1.5)
        }
      );
    } else {
      throw new Error('LLM engine does not support text generation');
    }

    return summary.trim();
  } catch (error) {
    console.warn(`Failed to generate ${type} summary:`, error);
    // Fallback: use first N words
    const words = text.split(/\s+/).slice(0, maxLength);
    return words.join(' ') + (text.split(/\s+/).length > maxLength ? '...' : '');
  }
}

/**
 * Build hierarchical index for a document
 */
export async function buildHierarchicalIndex(
  documentId: string,
  documentTitle: string,
  documentText: string,
  chunks: Chunk[],
  embeddingEngine: WllamaEngine,
  llmEngine: LLMEngine
): Promise<HierarchicalDocumentIndex> {
  console.log(`🏗️ [Hierarchical Index] Building for document: ${documentTitle}`);

  const nodes = new Map<string, HierarchicalNode>();

  // === LEVEL 0: Document summary ===
  const rootId = `${documentId}-root`;
  console.log(`📄 [Hierarchical] Generating document summary...`);

  const docSummary = await generateSummary(documentText, llmEngine, 'document');
  const docEmbedding = await embeddingEngine.generateEmbedding(docSummary);

  const rootNode: HierarchicalNode = {
    id: rootId,
    type: 'document',
    level: 0,
    title: documentTitle,
    summary: docSummary,
    embedding: docEmbedding,
    children: [],
    metadata: {}
  };

  nodes.set(rootId, rootNode);

  // === LEVEL 1: Section summaries ===
  const sections = detectSections(documentText);
  console.log(`📑 [Hierarchical] Detected ${sections.length} sections`);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sectionId = `${documentId}-section-${i}`;

    const sectionText = documentText.substring(section.startChar, section.endChar);

    console.log(`📝 [Hierarchical] Processing section ${i + 1}/${sections.length}: ${section.title}`);

    const sectionSummary = await generateSummary(sectionText, llmEngine, 'section');
    const sectionEmbedding = await embeddingEngine.generateEmbedding(sectionSummary);

    const sectionNode: HierarchicalNode = {
      id: sectionId,
      type: 'section',
      level: 1,
      title: section.title,
      summary: sectionSummary,
      embedding: sectionEmbedding,
      children: [],
      parent: rootId,
      metadata: {
        startChar: section.startChar,
        endChar: section.endChar,
        heading: section.title
      }
    };

    nodes.set(sectionId, sectionNode);
    rootNode.children!.push(sectionId);

    // === LEVEL 2: Assign chunks to sections ===
    const sectionChunks = chunks.filter(chunk =>
      chunk.metadata.startChar !== undefined &&
      chunk.metadata.endChar !== undefined &&
      chunk.metadata.startChar >= section.startChar &&
      chunk.metadata.endChar <= section.endChar
    );

    for (const chunk of sectionChunks) {
      const chunkNode: HierarchicalNode = {
        id: chunk.id,
        type: 'chunk',
        level: 2,
        title: `Chunk ${chunk.index}`,
        content: chunk.content,
        parent: sectionId,
        metadata: {
          startChar: chunk.metadata.startChar,
          endChar: chunk.metadata.endChar
        }
      };

      nodes.set(chunk.id, chunkNode);
      sectionNode.children!.push(chunk.id);
    }

    console.log(`  ✓ Section "${section.title}": ${sectionChunks.length} chunks`);
  }

  console.log(`✅ [Hierarchical] Built index with ${nodes.size} nodes`);

  return {
    documentId,
    nodes,
    rootNode: rootId
  };
}

/**
 * 2-stage hierarchical search
 * Stage 1: Find relevant sections
 * Stage 2: Find relevant chunks within those sections
 */
export async function hierarchicalSearch(
  queryEmbedding: Float32Array,
  index: HierarchicalDocumentIndex,
  topSections: number = 2,
  topChunksPerSection: number = 3
): Promise<HierarchicalNode[]> {
  console.log(`🔍 [Hierarchical Search] 2-stage retrieval...`);

  const allNodes = Array.from(index.nodes.values());

  // === STAGE 1: Find top sections ===
  const sections = allNodes.filter(n => n.type === 'section' && n.embedding);

  const sectionScores = sections.map(section => ({
    node: section,
    score: cosineSimilarity(queryEmbedding, section.embedding!)
  }));

  sectionScores.sort((a, b) => b.score - a.score);
  const topSectionNodes = sectionScores.slice(0, topSections);

  console.log(`📑 [Stage 1] Found ${topSectionNodes.length} relevant sections:`);
  topSectionNodes.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.node.title} (${(s.score * 100).toFixed(1)}%)`);
  });

  // === STAGE 2: Find top chunks within selected sections ===
  const selectedChunks: HierarchicalNode[] = [];

  for (const sectionScore of topSectionNodes) {
    const section = sectionScore.node;

    // Get all chunks in this section
    const chunks = (section.children || [])
      .map(chunkId => index.nodes.get(chunkId))
      .filter((n): n is HierarchicalNode => n !== undefined && n.type === 'chunk');

    // Note: Chunks don't have embeddings in this simplified version
    // In production, you'd embed chunks and score them here
    // For now, just take first N chunks from relevant sections

    selectedChunks.push(...chunks.slice(0, topChunksPerSection));
  }

  console.log(`📄 [Stage 2] Selected ${selectedChunks.length} chunks from sections`);

  return selectedChunks;
}

/**
 * Calculate cosine similarity
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
