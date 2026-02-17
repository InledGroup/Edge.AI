import { ARAGTools } from './arag-tools';
import { RAGModelLoader } from './model-loader';

export class ARAGAgent {
  private tools = new ARAGTools();
  private maxIterations = 5; 

  async run(question: string, onProgress?: (msg: string) => void) {
    const loader = RAGModelLoader.getInstance();
    const generator = await loader.getGenerator();

    let historyStr = `System: Eres un Agente de Investigación experto. Tu misión es extraer información precisa de documentos locales.
        
HERRAMIENTAS DISPONIBLES:
1. keyword_search(keywords: string[]): Busca nombres exactos o términos técnicos.
2. semantic_search(query: string): Busca conceptos o explicaciones relacionadas.
3. chunk_read(chunk_ids: string[]): Lee el texto completo de fragmentos específicos.

REGLAS ESTRICTAS:
- Responde SIEMPRE en formato JSON.
- No alucines. Si no hay información tras investigar, di "No tengo suficiente información".
- Usa "keyword_search" para buscar nombres de empresas como "Inled Group".

EJEMPLO DE RESPUESTA:
{
  "thought": "Necesito identificar qué es Inled Group, usaré búsqueda por palabras clave.",
  "tool_call": { "name": "keyword_search", "args": { "keywords": ["Inled Group"] } }
}

User: ${question}`;

    const chunksRead = new Set<string>();
    let finalAnswer = null;
    let errorCount = 0;

    for (let i = 0; i < this.maxIterations; i++) {
      if (onProgress) onProgress(`Investigación: Ronda ${i + 1}...`);
      
      const result = await generator(historyStr, { 
        max_new_tokens: 300,
        temperature: 0.1,
        do_sample: false,
        repetition_penalty: 1.2
      });

      const response = result[0].generated_text;

      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found");
        
        const action = JSON.parse(jsonMatch[0]);

        if (action.final_answer) {
          finalAnswer = action.final_answer;
          break;
        }

        if (action.tool_call) {
          const { name, args } = action.tool_call;
          if (onProgress) onProgress(`Ejecutando ${name}...`);
          
          let toolResult: any;
          if (name === 'keyword_search') toolResult = await this.tools.keyword_search(args.keywords || []);
          else if (name === 'semantic_search') toolResult = await this.tools.semantic_search(args.query || question);
          else if (name === 'chunk_read') {
            const ids = args.chunk_ids || [];
            const unreadIds = ids.filter((id: string) => !chunksRead.has(id));
            if (unreadIds.length === 0) toolResult = "Ya has leído estos fragmentos.";
            else {
              toolResult = await this.tools.chunk_read(unreadIds);
              unreadIds.forEach((id: string) => chunksRead.add(id));
            }
          }

          historyStr += `\nAssistant: ${JSON.stringify(action)}\nObservation: ${JSON.stringify(toolResult)}`;
        } else {
          throw new Error("No tool_call or final_answer");
        }
      } catch (e) {
        console.warn("Loop Agente: Fallo de formato, aplicando corrección...", e);
        errorCount++;
        
        if (errorCount >= 2) {
          // Fallback agresivo: Forzar una búsqueda si el modelo se pierde
          if (onProgress) onProgress("Recuperando control: Ejecutando búsqueda de emergencia...");
          const emergency = await this.tools.keyword_search(question.split(' '));
          historyStr += `\nSystem: El formato anterior fue incorrecto. Aquí tienes datos directos para responder: ${JSON.stringify(emergency)}. Responde con {"final_answer": "..."}`;
        } else {
          historyStr += `\nSystem: ERROR: Debes responder ÚNICAMENTE con un JSON que contenga "thought" y ("tool_call" o "final_answer").`;
        }
      }
    }

    return finalAnswer || "He intentado investigar en tus documentos pero no he podido extraer una respuesta clara sobre este tema.";
  }
}
