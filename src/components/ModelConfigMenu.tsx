/**
 * Model Configuration Menu
 * Allows users to reconfigure models after initial setup
 */

import { useState, useRef, useEffect } from 'preact/hooks';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Settings, RefreshCw, Trash2, Download, Info, Upload, Database, Zap } from 'lucide-preact';
import { modelsStore, modelsReady, conversationsStore } from '@/lib/stores';
import {
  getDefaultModelIds,
  clearModelSettings,
  saveDefaultChatModel,
  saveDefaultEmbeddingModel
} from '@/lib/ai/model-settings';
import EngineManager from '@/lib/ai/engine-manager';
import { i18nStore, languageSignal } from '@/lib/stores/i18n';
import { 
  exportConversations, 
  importConversations, 
  getConversationsSorted 
} from '@/lib/db/conversations';
import { getUseAdvancedRAG, setUseAdvancedRAG } from '@/lib/db/settings';

interface ModelConfigMenuProps {
  onOpenWizard: () => void;
}

export function ModelConfigMenu({ onOpenWizard }: ModelConfigMenuProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [useAdvancedRAG, setUseAdvancedRAGState] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Load settings on mount
  useEffect(() => {
    getUseAdvancedRAG().then(setUseAdvancedRAGState);
  }, []);

  async function handleToggleAdvancedRAG() {
    const newValue = !useAdvancedRAG;
    setUseAdvancedRAGState(newValue);
    await setUseAdvancedRAG(newValue);
  }
  
  // Subscribe to language changes
  const lang = languageSignal.value;

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

      // Reload Tool Engine only if it's already ready
      if (EngineManager.isToolEngineReady()) {
        await EngineManager.getToolEngine();
        console.log('✅ Tool engine reloaded');
      }

      alert(i18nStore.t('models.reloaded'));
    } catch (error) {
      console.error('Failed to reload models:', error);
      alert(i18nStore.t('models.reloadError'));
    }
  }

  async function handleReset() {
    const confirmed = confirm(
      i18nStore.t('models.confirmReset')
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
      alert(i18nStore.t('models.resetError'));
    } finally {
      setIsResetting(false);
    }
  }

  function handleChangeModels() {
    setShowMenu(false);
    onOpenWizard();
  }

  async function handleExport() {
    try {
      const data = await exportConversations();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edgeai-conversations-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed');
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      await importConversations(data);
      
      // Refresh conversations store
      const conversations = await getConversationsSorted();
      conversationsStore.set(conversations);
      
      alert(i18nStore.t('data.importSuccess'));
      
      // Reset input
      target.value = '';
    } catch (error) {
      console.error('Import failed:', error);
      alert(i18nStore.t('data.importError'));
    }
  }

  if (!showMenu) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setShowMenu(true)}
        title={i18nStore.t('models.configure')}
      >
        <Settings size={16} />
        {i18nStore.t('models.configure')}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">{i18nStore.t('models.configure')}</h2>
            <button
              onClick={() => setShowMenu(false)}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[70vh] pr-2 -mr-2 space-y-4">
            {/* Current Models Status */}
            <div className="space-y-3">
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
                <h3 className="font-medium mb-3">{i18nStore.t('models.currentModels')}</h3>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text-secondary)]">{i18nStore.t('models.chat')}:</span>
                    <span className={modelsStore.chat ? 'text-[var(--color-success)]' : 'text-[var(--color-text-tertiary)]'}>
                      {modelsStore.chat ? modelsStore.chat.name : i18nStore.t('models.notLoaded')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text-secondary)]">{i18nStore.t('models.embeddings')}:</span>
                    <span className={modelsStore.embedding ? 'text-[var(--color-success)]' : 'text-[var(--color-text-tertiary)]'}>
                      {modelsStore.embedding ? modelsStore.embedding.name : i18nStore.t('models.notLoaded')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text-secondary)]">MCP Tools:</span>
                    <span className={EngineManager.isToolEngineReady() ? 'text-[var(--color-success)]' : 'text-[var(--color-text-tertiary)]'}>
                      {EngineManager.isToolEngineReady() ? 'LFM2 Tool (Emergencia)' : i18nStore.t('models.notLoaded')}
                    </span>
                  </div>
                </div>

                {/* Advanced RAG Toggle */}
                <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap size={16} className={useAdvancedRAG ? "text-amber-500" : "text-[var(--color-text-tertiary)]"} />
                      <div>
                        <div className="text-sm font-medium">RAG Avanzado (Fudan)</div>
                        <div className="text-[10px] text-[var(--color-text-tertiary)]">Máximo rendimiento y precisión</div>
                      </div>
                    </div>
                    <button
                      onClick={handleToggleAdvancedRAG}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        useAdvancedRAG ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg-tertiary)]'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          useAdvancedRAG ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {modelsReady.value && (
                  <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                    <div className="flex items-center gap-2 text-xs text-[var(--color-success)]">
                      <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                      {i18nStore.t('models.allReady')}
                    </div>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex gap-2 text-sm">
                <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-blue-500">
                  {i18nStore.t('models.cacheInfo')}
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
                {i18nStore.t('models.change')}
              </Button>

              <Button
                variant="secondary"
                onClick={handleReload}
                disabled={!modelsReady.value}
                className="w-full"
              >
                <RefreshCw size={16} />
                {i18nStore.t('models.reload')}
              </Button>
            </div>

            {/* Data Management Section */}
            <div className="pt-4 border-t border-[var(--color-border)] space-y-3">
              <h3 className="font-medium text-sm flex items-center gap-2">
                <Database size={16} />
                {i18nStore.t('data.title')}
              </h3>
              
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExport}
                  className="flex-1"
                >
                  <Download size={14} />
                  {i18nStore.t('data.export')}
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleImportClick}
                  className="flex-1"
                >
                  <Upload size={14} />
                  {i18nStore.t('data.import')}
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".json"
                  className="hidden"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--color-border)]">
              <Button
                variant="secondary"
                onClick={handleReset}
                disabled={isResetting}
                className="w-full text-red-500 hover:text-red-600 hover:bg-red-500/10"
              >
                <Trash2 size={16} />
                {i18nStore.t('models.reset')}
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--color-border)]">
            <Button
              variant="secondary"
              onClick={() => setShowMenu(false)}
              className="w-full"
            >
              {i18nStore.t('common.close')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
