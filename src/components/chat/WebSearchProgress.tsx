/**
 * WebSearchProgress Component
 *
 * Muestra el progreso de una búsqueda web en curso con indicadores visuales
 * para cada paso del proceso.
 */

import { Globe, Search, FileText, Cpu, Sparkles } from 'lucide-preact';
import { cn } from '@/lib/utils';
import type { WebSearchStep } from '@/lib/web-search/types';

export interface WebSearchProgressProps {
  step: WebSearchStep;
  progress: number;
  message?: string;
}

const STEP_INFO: Record<WebSearchStep, { icon: any; label: string; color: string }> = {
  query_generation: {
    icon: Sparkles,
    label: 'Generando consulta',
    color: 'text-purple-500'
  },
  web_search: {
    icon: Search,
    label: 'Buscando en web',
    color: 'text-blue-500'
  },
  url_selection: {
    icon: FileText,
    label: 'Seleccionando fuentes',
    color: 'text-indigo-500'
  },
  page_fetch: {
    icon: Globe,
    label: 'Descargando páginas',
    color: 'text-cyan-500'
  },
  content_extraction: {
    icon: FileText,
    label: 'Extrayendo contenido',
    color: 'text-teal-500'
  },
  chunking: {
    icon: Cpu,
    label: 'Procesando documentos',
    color: 'text-green-500'
  },
  embedding: {
    icon: Cpu,
    label: 'Generando embeddings',
    color: 'text-emerald-500'
  },
  vector_search: {
    icon: Search,
    label: 'Buscando relevancia',
    color: 'text-lime-500'
  },
  answer_generation: {
    icon: Sparkles,
    label: 'Generando respuesta',
    color: 'text-amber-500'
  },
  completed: {
    icon: Sparkles,
    label: 'Completado',
    color: 'text-green-600'
  },
  error: {
    icon: Sparkles,
    label: 'Error',
    color: 'text-red-500'
  }
};

export function WebSearchProgress({ step, progress, message }: WebSearchProgressProps) {
  const stepInfo = STEP_INFO[step] || STEP_INFO.web_search;
  const Icon = stepInfo.icon;

  return (
    <div className="py-3 px-4 bg-[var(--color-bg-secondary)] rounded-lg">
      {/* Header con icono y label */}
      <div className="flex items-center gap-3 mb-2">
        <div className={cn('flex-shrink-0', stepInfo.color)}>
          <Icon size={18} className="animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--color-text)]">
            {stepInfo.label}
          </div>
          {message && (
            <div className="text-xs text-[var(--color-text-secondary)] truncate">
              {message}
            </div>
          )}
        </div>
        <div className="text-xs font-mono text-[var(--color-text-secondary)]">
          {Math.round(progress)}%
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="w-full h-1.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-300 ease-out rounded-full',
            stepInfo.color.replace('text-', 'bg-')
          )}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}
