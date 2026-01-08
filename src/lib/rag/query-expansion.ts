/**
 * Query Expansion & Rewriting
 *
 * Improves retrieval by:
 * - Expanding short queries with related terms
 * - Generating query variations
 * - Adding synonyms and context
 */

import type { WllamaEngine } from '@/lib/ai/wllama-engine';
import type { WebLLMEngine } from '@/lib/ai/webllm-engine';

type LLMEngine = WebLLMEngine | WllamaEngine;

/**
 * Expanded query result
 */
export interface ExpandedQuery {
  original: string;
  expanded: string[];
  combined: string;
}

/**
 * Expand a query into multiple variations for better retrieval
 */
export async function expandQuery(
  query: string,
  llmEngine: LLMEngine,
  options: {
    maxVariations?: number;
    includeOriginal?: boolean;
  } = {}
): Promise<ExpandedQuery> {
  const { maxVariations = 3, includeOriginal = true } = options;

  console.log(`🔍 [Query Expansion] Expanding: "${query}"`);

  // Short queries need more expansion
  const wordCount = query.split(/\s+/).length;
  const needsExpansion = wordCount < 5;

  if (!needsExpansion) {
    console.log(`✅ [Query Expansion] Query is already detailed, skipping expansion`);
    return {
      original: query,
      expanded: [query],
      combined: query
    };
  }

  const prompt = `Eres un experto en búsqueda de información que ayuda a mejorar consultas.

CONSULTA ORIGINAL: "${query}"

Tu tarea es generar ${maxVariations} variaciones de esta consulta que ayuden a encontrar información relevante. Cada variación debe:
1. Mantener la intención original
2. Agregar sinónimos o términos relacionados
3. Ser específica y clara
4. Tener entre 5-10 palabras

Responde SOLO con un JSON en este formato:
{
  "variations": [
    "variación 1 aquí",
    "variación 2 aquí",
    "variación 3 aquí"
  ]
}

JSON:`;

  try {
    const response = await generateText(llmEngine, prompt, {
      temperature: 0.5,
      maxTokens: 200,
      stop: ['CONSULTA ORIGINAL:', 'JSON:']
    });

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const variations = (parsed.variations || []) as string[];

    // Validate and filter
    const validVariations = variations
      .filter(v => v && v.length > 0 && v.length < 200)
      .slice(0, maxVariations);

    if (validVariations.length === 0) {
      throw new Error('No valid variations generated');
    }

    // Combine all variations
    const allVariations = includeOriginal
      ? [query, ...validVariations]
      : validVariations;

    const combined = allVariations.join(' ');

    console.log(`✅ [Query Expansion] Generated ${validVariations.length} variations`);
    validVariations.forEach((v, i) => {
      console.log(`  ${i + 1}. ${v}`);
    });

    return {
      original: query,
      expanded: allVariations,
      combined
    };

  } catch (error) {
    console.warn('⚠️ [Query Expansion] Failed to expand query:', error);

    // Fallback: simple expansion
    return simplifyExpansion(query);
  }
}

/**
 * Simple rule-based query expansion (fallback)
 */
function simplifyExpansion(query: string): ExpandedQuery {
  const synonymMap: Record<string, string[]> = {
    'rag': ['retrieval augmented generation', 'vector search'],
    'ai': ['artificial intelligence', 'machine learning', 'ML'],
    'llm': ['large language model', 'language model'],
    'api': ['application programming interface', 'endpoint'],
    'db': ['database', 'data storage'],
    'ml': ['machine learning', 'AI']
  };

  const words = query.toLowerCase().split(/\s+/);
  const expanded: string[] = [query];

  // Add synonyms for known terms
  words.forEach(word => {
    if (synonymMap[word]) {
      synonymMap[word].forEach(synonym => {
        const variation = query.replace(new RegExp(word, 'gi'), synonym);
        if (!expanded.includes(variation)) {
          expanded.push(variation);
        }
      });
    }
  });

  return {
    original: query,
    expanded,
    combined: expanded.join(' ')
  };
}

/**
 * Rewrite query for better clarity and search performance
 */
export async function rewriteQuery(
  query: string,
  llmEngine: LLMEngine,
  context?: string
): Promise<string> {
  console.log(`✍️ [Query Rewriting] Rewriting: "${query}"`);

  const contextStr = context
    ? `\n\nCONTEXTO ADICIONAL: ${context}`
    : '';

  const prompt = `Eres un experto en reformular preguntas para mejorar resultados de búsqueda.

PREGUNTA ORIGINAL: "${query}"${contextStr}

Reformula esta pregunta en una versión más clara y específica que maximice la probabilidad de encontrar información relevante.

Reglas:
- Mantén la intención original
- Usa lenguaje preciso
- Elimina ambigüedades
- Máximo 15 palabras
- Responde SOLO con la pregunta reformulada, sin explicaciones

Pregunta reformulada:`;

  try {
    const rewritten = await generateText(llmEngine, prompt, {
      temperature: 0.3,
      maxTokens: 100,
      stop: ['\n', 'PREGUNTA ORIGINAL:']
    });

    const cleaned = rewritten.trim().replace(/^["']|["']$/g, '');

    console.log(`✅ [Query Rewriting] Rewritten: "${cleaned}"`);

    return cleaned;

  } catch (error) {
    console.warn('⚠️ [Query Rewriting] Failed to rewrite query:', error);
    return query; // Return original on failure
  }
}

/**
 * Extract key terms from query for highlighting
 */
export function extractKeyTerms(query: string): string[] {
  // Remove stop words
  const stopWords = new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'y', 'o',
    'que', 'es', 'por', 'para', 'con', 'qué', 'cómo', 'cuál', 'dónde',
    'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for',
    'what', 'how', 'which', 'where', 'when', 'why', 'is', 'are', 'was'
  ]);

  const words = query.toLowerCase()
    .split(/\s+/)
    .filter(word =>
      word.length > 2 &&
      !stopWords.has(word) &&
      /^[a-záéíóúñ]+$/i.test(word)
    );

  return Array.from(new Set(words));
}

/**
 * Helper to generate text with LLM engine abstraction
 */
async function generateText(
  llmEngine: LLMEngine,
  prompt: string,
  options: { temperature: number; maxTokens: number; stop?: string[] }
): Promise<string> {
  // WebLLM
  if ('generateText' in llmEngine) {
    return await llmEngine.generateText(prompt, {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      stop: options.stop,
    });
  }

  // Wllama (chat API)
  if ('createChatCompletion' in llmEngine) {
    const response = await llmEngine.createChatCompletion(
      [{ role: 'user', content: prompt }],
      {
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        stop: options.stop,
      }
    );
    return response;
  }

  throw new Error('LLM engine does not support text generation');
}
