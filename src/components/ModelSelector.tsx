// ModelSelector - Selector de modelos de IA

import { Cpu, Zap, Trophy, AlertCircle } from 'lucide-preact';

interface ModelOption {
  id: string;
  name: string;
  size: string;
  description: string;
  bestFor: string;
  tier: 'entry' | 'balanced' | 'performance';
}

const models: ModelOption[] = [
  {
    id: 'SmolLM2-135M-Instruct-q0f16-MLC',
    name: 'SmolLM2 135M',
    size: '~135 MB',
    description: 'El modelo más pequeño y rápido. Ideal para dispositivos móviles o con recursos limitados.',
    bestFor: 'Máxima velocidad',
    tier: 'entry',
  },
  {
    id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 360M',
    size: '~200 MB',
    description: 'Balance excelente entre tamaño y calidad. Funciona bien en la mayoría de dispositivos.',
    bestFor: 'Dispositivos móviles',
    tier: 'entry',
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 0.5B',
    size: '~350 MB',
    description: 'Modelo ligero con buen rendimiento. Recomendado para la mayoría de casos de uso.',
    bestFor: 'Uso general (Recomendado)',
    tier: 'balanced',
  },
  {
    id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC',
    name: 'TinyLlama 1.1B',
    size: '~550 MB',
    description: 'Modelo intermedio con mejor capacidad de razonamiento.',
    bestFor: 'Razonamiento básico',
    tier: 'balanced',
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B',
    size: '~700 MB',
    description: 'Excelente balance entre calidad y rendimiento. Muy buena comprensión.',
    bestFor: 'Calidad/rendimiento',
    tier: 'balanced',
  },
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    name: 'Phi-3.5 Mini',
    size: '~1.9 GB',
    description: 'Modelo más potente. Requiere más recursos pero ofrece la mejor calidad.',
    bestFor: 'Máxima calidad',
    tier: 'performance',
  },
];

interface ModelSelectorProps {
  selectedModel: string;
  onSelect: (modelId: string) => void;
}

export function ModelSelector({ selectedModel, onSelect }: ModelSelectorProps) {
  return (
    <div class="space-y-4">
      {/* Info Box */}
      <div class="p-4 bg-blue-900/20 border border-blue-800 rounded-lg flex items-start gap-3 mb-6">
        <AlertCircle size={20} class="text-blue-400 flex-shrink-0 mt-0.5" />
        <div class="text-sm text-blue-200">
          <p class="font-semibold mb-1">El modelo se ejecuta 100% en el navegador</p>
          <p>
            La primera vez que un visitante use el chatbot, el modelo se descargará y cacheará. 
            Las siguientes veces cargará instantáneamente.
          </p>
        </div>
      </div>

      {/* Model Cards */}
      <div class="grid gap-4">
        {models.map((model) => {
          const isSelected = selectedModel === model.id;
          
          return (
            <div
              key={model.id}
              onClick={() => onSelect(model.id)}
              class={`
                relative p-5 rounded-xl border-2 cursor-pointer transition-all duration-200
                ${isSelected
                  ? 'border-[var(--inled-green)] bg-[var(--inled-green)]/10'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'
                }
              `}
            >
              {isSelected && (
                <div class="absolute top-3 right-3 text-[var(--inled-green)]">
                  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                  </svg>
                </div>
              )}
              
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-2">
                    <h3 class="text-lg font-bold text-white">{model.name}</h3>
                    {model.tier === 'balanced' && (
                      <span class="px-2 py-0.5 bg-[var(--inled-green)] text-black text-xs font-semibold rounded-full">
                        Recomendado
                      </span>
                    )}
                    {model.tier === 'performance' && (
                      <span class="px-2 py-0.5 bg-purple-600 text-white text-xs font-semibold rounded-full flex items-center gap-1">
                        <Trophy size={12} />
                        Premium
                      </span>
                    )}
                  </div>
                  
                  <p class="text-sm text-gray-400 mb-3">{model.description}</p>
                  
                  <div class="flex items-center gap-4 text-xs">
                    <div class="flex items-center gap-1 text-gray-500">
                      <Cpu size={14} />
                      <span>{model.size}</span>
                    </div>
                    <div class="flex items-center gap-1 text-gray-500">
                      <Zap size={14} />
                      <span>{model.bestFor}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Technical Note */}
      <div class="mt-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
        <p class="text-xs text-gray-400">
          <strong class="text-gray-300">Nota técnica:</strong> Todos los modelos usan cuantización Q4_K_M 
          (4-bit) para optimizar el tamaño sin perder mucha calidad. El modelo seleccionado se incluirá 
          en el HTML exportado y se ejecutará completamente en el navegador del visitante.
        </p>
      </div>
    </div>
  );
}
