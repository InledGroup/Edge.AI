/**
 * Model Configuration Menu
 * Allows users to reconfigure models after initial setup
 */

import { useState } from 'preact/hooks';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Settings, RefreshCw, Trash2, Download, Info } from 'lucide-preact';
import { modelsStore, modelsReady } from '@/lib/stores';
import {
  getDefaultModelIds,
  clearModelSettings,
  saveDefaultChatModel,
  saveDefaultEmbeddingModel
} from '@/lib/ai/model-settings';
import EngineManager from '@/lib/ai/engine-manager';

interface ModelConfigMenuProps {
  onOpenWizard: () => void;
}

export function ModelConfigMenu({ onOpenWizard }: ModelConfigMenuProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  async function handleReload() {
    try {
      const currentModels = EngineManager.getModelNames();

      if (currentModels.chat) {
        // Reload chat model
        const chatEngine = await EngineManager.getChatEngine();
        console.log('✅ Chat model reloaded');
      }

      if (currentModels.embedding) {
        // Reload embedding model
        const embeddingEngine = await EngineManager.getEmbeddingEngine();
        console.log('✅ Embedding model reloaded');
      }

      alert('Modelos recargados correctamente');
    } catch (error) {
      console.error('Failed to reload models:', error);
      alert('Error al recargar modelos');
    }
  }

  async function handleReset() {
    const confirmed = confirm(
      'Esto borrará la configuración actual y reiniciará el asistente. ¿Continuar?'
    );

    if (!confirmed) return;

    try {
      setIsResetting(true);

      // Clear engines
      await EngineManager.resetAll();

      // Clear store
      modelsStore.setChatModel(null);
      modelsStore.setEmbeddingModel(null);

      // Clear settings
      clearModelSettings();

      console.log('✅ Configuration reset');

      // Close menu
      setShowMenu(false);

      // Reopen wizard
      setTimeout(() => {
        onOpenWizard();
      }, 500);
    } catch (error) {
      console.error('Failed to reset:', error);
      alert('Error al resetear configuración');
    } finally {
      setIsResetting(false);
    }
  }

  function handleChangeModels() {
    setShowMenu(false);
    onOpenWizard();
  }

  if (!showMenu) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setShowMenu(true)}
        title="Configurar modelos"
      >
        <Settings size={16} />
        Configurar modelos
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Configuración de Modelos</h2>
            <button
              onClick={() => setShowMenu(false)}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            >
              ✕
            </button>
          </div>

          {/* Current Models Status */}
          <div className="space-y-3">
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
              <h3 className="font-medium mb-3">Modelos actuales</h3>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-secondary)]">Chat:</span>
                  <span className={modelsStore.chat ? 'text-[var(--color-success)]' : 'text-[var(--color-text-tertiary)]'}>
                    {modelsStore.chat ? modelsStore.chat.name : 'No cargado'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-secondary)]">Embeddings:</span>
                  <span className={modelsStore.embedding ? 'text-[var(--color-success)]' : 'text-[var(--color-text-tertiary)]'}>
                    {modelsStore.embedding ? modelsStore.embedding.name : 'No cargado'}
                  </span>
                </div>
              </div>

              {modelsReady.value && (
                <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                  <div className="flex items-center gap-2 text-xs text-[var(--color-success)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                    Todos los modelos listos
                  </div>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-2 text-sm">
              <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-blue-500">
                Los modelos se descargan una sola vez y se cachean en tu navegador para futuras sesiones.
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <Button
              variant="secondary"
              onClick={handleChangeModels}
              className="w-full"
            >
              <Download size={16} />
              Cambiar modelos
            </Button>

            <Button
              variant="secondary"
              onClick={handleReload}
              disabled={!modelsReady.value}
              className="w-full"
            >
              <RefreshCw size={16} />
              Recargar modelos actuales
            </Button>

            <Button
              variant="secondary"
              onClick={handleReset}
              disabled={isResetting}
              className="w-full text-red-500 hover:text-red-600 hover:bg-red-500/10"
            >
              <Trash2 size={16} />
              Resetear configuración
            </Button>
          </div>

          <div className="pt-4 border-t border-[var(--color-border)]">
            <Button
              variant="secondary"
              onClick={() => setShowMenu(false)}
              className="w-full"
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
