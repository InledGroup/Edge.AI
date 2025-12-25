/**
 * Model Loading Indicator
 * Shows a subtle toast when models are loading in background
 */

import { modelsStore } from '@/lib/stores';
import { Download } from 'lucide-preact';

export function ModelLoadingIndicator() {
  const isLoading = modelsStore.chatLoading || modelsStore.embeddingLoading;

  if (!isLoading) return null;

  return (
    <div className="fixed bottom-4 right-4 z-30 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg shadow-lg p-4 max-w-xs animate-slideUp">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <Download size={20} className="text-[var(--color-primary)] animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Cargando modelos...</div>
          <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            {modelsStore.chatLoading && 'Modelo de chat'}
            {modelsStore.chatLoading && modelsStore.embeddingLoading && ' y '}
            {modelsStore.embeddingLoading && 'embeddings'}
          </div>
        </div>
      </div>
    </div>
  );
}
