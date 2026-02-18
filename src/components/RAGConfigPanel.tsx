// RAGConfigPanel - Panel de configuración RAG

import { useState, useEffect } from 'preact/hooks';
import { Sliders, Zap, Search, AlertCircle } from 'lucide-preact';
import type { RAGConfig } from '../types/constructor';

interface RAGConfigPanelProps {
  config: RAGConfig;
  onChange: (config: RAGConfig) => void;
}

export function RAGConfigPanel({ config, onChange }: RAGConfigPanelProps) {
  const [localConfig, setLocalConfig] = useState<RAGConfig>(config);

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  const updateConfig = (key: keyof RAGConfig, value: number) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    onChange(newConfig);
  };

  return (
    <div class="space-y-8">
      {/* Retrieval Settings */}
      <div>
        <h3 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Search size={20} class="text-[var(--inled-green)]" />
          Búsqueda y Recuperación
        </h3>
        
        <div class="space-y-6">
          {/* Top-K */}
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium text-gray-300">
                Top-K (Fragmentos a recuperar)
              </label>
              <span class="text-sm font-mono text-[var(--inled-green)] bg-[var(--inled-green)]/10 px-3 py-1 rounded-full">
                {localConfig.topK}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="15"
              step="1"
              value={localConfig.topK}
              onInput={(e) => updateConfig('topK', parseInt((e.target as HTMLInputElement).value))}
              class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--inled-green)]"
            />
            <p class="text-xs text-gray-400">
              Número de fragmentos de documentos a recuperar para cada consulta. Más fragmentos = más contexto pero más lento.
            </p>
          </div>

          {/* Similarity Threshold */}
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium text-gray-300">
                Umbral de Similitud
              </label>
              <span class="text-sm font-mono text-[var(--inled-green)] bg-[var(--inled-green)]/10 px-3 py-1 rounded-full">
                {Math.round(localConfig.similarityThreshold * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={localConfig.similarityThreshold}
              onInput={(e) => updateConfig('similarityThreshold', parseFloat((e.target as HTMLInputElement).value))}
              class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--inled-green)]"
            />
            <p class="text-xs text-gray-400">
              Mínima similitud requerida para considerar un fragmento como relevante. Más alto = más preciso pero menos resultados.
            </p>
          </div>
        </div>
      </div>

      <div class="border-t border-gray-700" />

      {/* Chunking Settings */}
      <div>
        <h3 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Sliders size={20} class="text-[var(--inled-green)]" />
          Fragmentación (Chunking)
        </h3>
        
        <div class="space-y-6">
          {/* Chunk Size */}
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium text-gray-300">
                Tamaño de Fragmento
              </label>
              <span class="text-sm font-mono text-[var(--inled-green)] bg-[var(--inled-green)]/10 px-3 py-1 rounded-full">
                {localConfig.chunkSize} tokens
              </span>
            </div>
            <input
              type="range"
              min="256"
              max="2048"
              step="128"
              value={localConfig.chunkSize}
              onInput={(e) => updateConfig('chunkSize', parseInt((e.target as HTMLInputElement).value))}
              class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--inled-green)]"
            />
            <p class="text-xs text-gray-400">
              Tamaño de cada fragmento de texto. Fragmentos más grandes = más contexto pero más costoso computacionalmente.
            </p>
          </div>

          {/* Chunk Overlap */}
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium text-gray-300">
                Superposición (Overlap)
              </label>
              <span class="text-sm font-mono text-[var(--inled-green)] bg-[var(--inled-green)]/10 px-3 py-1 rounded-full">
                {localConfig.chunkOverlap} tokens
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="256"
              step="16"
              value={localConfig.chunkOverlap}
              onInput={(e) => updateConfig('chunkOverlap', parseInt((e.target as HTMLInputElement).value))}
              class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--inled-green)]"
            />
            <p class="text-xs text-gray-400">
              Cantidad de texto solapado entre fragmentos consecutivos. Ayuda a mantener el contexto entre fragmentos.
            </p>
          </div>
        </div>
      </div>

      <div class="border-t border-gray-700" />

      {/* Generation Settings */}
      <div>
        <h3 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Zap size={20} class="text-[var(--inled-green)]" />
          Generación de Respuestas
        </h3>
        
        <div class="space-y-6">
          {/* Temperature */}
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium text-gray-300">
                Temperatura (Creatividad)
              </label>
              <span class="text-sm font-mono text-[var(--inled-green)] bg-[var(--inled-green)]/10 px-3 py-1 rounded-full">
                {localConfig.temperature.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={localConfig.temperature}
              onInput={(e) => updateConfig('temperature', parseFloat((e.target as HTMLInputElement).value))}
              class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--inled-green)]"
            />
            <p class="text-xs text-gray-400">
              Controla la creatividad del modelo. 0 = más preciso/determinista, 1 = más creativo/aleatorio.
            </p>
          </div>

          {/* Max Tokens */}
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium text-gray-300">
                Máximos Tokens en Respuesta
              </label>
              <span class="text-sm font-mono text-[var(--inled-green)] bg-[var(--inled-green)]/10 px-3 py-1 rounded-full">
                {localConfig.maxTokens}
              </span>
            </div>
            <input
              type="range"
              min="128"
              max="2048"
              step="64"
              value={localConfig.maxTokens}
              onInput={(e) => updateConfig('maxTokens', parseInt((e.target as HTMLInputElement).value))}
              class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[var(--inled-green)]"
            />
            <p class="text-xs text-gray-400">
              Longitud máxima de la respuesta generada. Más tokens = respuestas más largas pero más lento.
            </p>
          </div>
        </div>
      </div>

      {/* Preset Buttons */}
      <div class="flex gap-3 pt-4">
        <button
          onClick={() => {
            const preset: RAGConfig = {
              topK: 3,
              chunkSize: 256,
              chunkOverlap: 25,
              temperature: 0.1,
              maxTokens: 256,
              similarityThreshold: 0.5,
            };
            setLocalConfig(preset);
            onChange(preset);
          }}
          class="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-300 hover:text-white transition-colors"
        >
          Preciso (Búsqueda exacta)
        </button>
        <button
          onClick={() => {
            const preset: RAGConfig = {
              topK: 7,
              chunkSize: 512,
              chunkOverlap: 50,
              temperature: 0.3,
              maxTokens: 512,
              similarityThreshold: 0.35,
            };
            setLocalConfig(preset);
            onChange(preset);
          }}
          class="flex-1 px-4 py-2 bg-[var(--inled-green)]/10 hover:bg-[var(--inled-green)]/20 border border-[var(--inled-green)] rounded-lg text-sm text-[var(--inled-green)] transition-colors"
        >
          Balanceado (Recomendado)
        </button>
        <button
          onClick={() => {
            const preset: RAGConfig = {
              topK: 10,
              chunkSize: 768,
              chunkOverlap: 100,
              temperature: 0.7,
              maxTokens: 1024,
              similarityThreshold: 0.2,
            };
            setLocalConfig(preset);
            onChange(preset);
          }}
          class="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-300 hover:text-white transition-colors"
        >
          Creativo (Más contexto)
        </button>
      </div>
    </div>
  );
}
