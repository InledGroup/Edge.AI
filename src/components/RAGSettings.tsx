import { useState, useEffect } from 'preact/hooks';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { X, Sliders, History, Zap, CheckCircle, Info, AlertCircle, Globe } from 'lucide-preact';
import { uiStore, uiSignal } from '@/lib/stores';
import { i18nStore } from '@/lib/stores/i18n';
import { 
  getGenerationSettings, 
  updateGenerationSettings, 
  getRAGSettings, 
  updateRAGSettings,
  getWebSearchSettings,
  updateWebSearchSettings
} from '@/lib/db/settings';

export function RAGSettingsPopup() {
  const [historyWeight, setHistoryWeight] = useState(0.5);
  const [historyLimit, setHistoryLimit] = useState(10);
  const [faithfulnessThreshold, setFaithfulnessThreshold] = useState(0.45);
  const [temperature, setTemperature] = useState(0.1);
  const [chunkWindowSize, setChunkWindowSize] = useState(1);
  const [chunkSize, setChunkSize] = useState(512);
  const [topK, setTopK] = useState(5);
  const [maxWebUrls, setMaxWebUrls] = useState(3);
  const [loading, setLoading] = useState(true);

  const show = uiSignal.value.showRAGSettings;

  useEffect(() => {
    if (show) {
      setLoading(true);
      Promise.all([
        getGenerationSettings(),
        getRAGSettings(),
        getWebSearchSettings()
      ]).then(([gen, rag, web]) => {
        setHistoryWeight(gen.historyWeight);
        setHistoryLimit(gen.historyLimit || 10);
        setFaithfulnessThreshold(gen.faithfulnessThreshold || 0.45);
        setTemperature(gen.temperature ?? 0.1);
        setChunkWindowSize(rag.chunkWindowSize || 1);
        setChunkSize(rag.chunkSize || 512);
        setTopK(rag.topK);
        setMaxWebUrls(web.webSearchMaxUrls || 3);
        setLoading(false);
      });
    }
  }, [show]);

  if (!show) return null;

  const handleEnableUpdatesChange = async (val: boolean) => {
    setEnableUpdates(val);
    const { setSetting } = await import('@/lib/db/settings');
    await setSetting('enableUpdates', val);
  };

  const handleTemperatureChange = async (val: number) => {
    setTemperature(val);
    await updateGenerationSettings({ temperature: val });
  };

  const handleHistoryLimitChange = async (val: number) => {
    setHistoryLimit(val);
    await updateGenerationSettings({ historyLimit: val });
  };

  const handleHistoryWeightChange = async (val: number) => {
    setHistoryWeight(val);
    await updateGenerationSettings({ historyWeight: val });
  };

  const handleFaithfulnessThresholdChange = async (val: number) => {
    setFaithfulnessThreshold(val);
    await updateGenerationSettings({ faithfulnessThreshold: val });
  };

  const handleChunkWindowSizeChange = async (val: number) => {
    setChunkWindowSize(val);
    await updateRAGSettings({ chunkWindowSize: val });
  };

  const handleChunkSizeChange = async (val: number) => {
    setChunkSize(val);
    await updateRAGSettings({ chunkSize: val });
  };

  const handleTopKChange = async (val: number) => {
    setTopK(val);
    await updateRAGSettings({ topK: val });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <Card className="w-full max-w-md bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-[var(--color-primary)]" />
            <h3 className="font-bold text-sm uppercase tracking-widest">{i18nStore.t('ragSettings.title')}</h3>
          </div>
          <button onClick={() => uiStore.toggleRAGSettings()} className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="spinner-sm mx-auto mb-2" />
            <p className="text-xs text-[var(--color-text-tertiary)]">{i18nStore.t('ragSettings.loading')}</p>
          </div>
        ) : (
          <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
            {/* History Settings */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold uppercase text-[var(--color-primary)] tracking-[0.2em] mb-4">{i18nStore.t('ragSettings.memoryContext')}</h4>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--color-text-secondary)]">
                  <div className="flex items-center gap-2"><History size={14} /> {i18nStore.t('ragSettings.historyWeight')}</div>
                  <span className="font-mono text-[var(--color-primary)]">{Math.round(historyWeight * 100)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.1" value={historyWeight} 
                  onInput={(e) => handleHistoryWeightChange(parseFloat((e.target as HTMLInputElement).value))}
                  className="w-full h-1.5 bg-[var(--color-bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--color-text-secondary)]">
                  <div className="flex items-center gap-2"><History size={14} /> {i18nStore.t('ragSettings.historyLimit')}</div>
                  <span className="font-mono text-[var(--color-primary)]">{historyLimit} msgs</span>
                </div>
                <input 
                  type="range" min="1" max="30" step="1" value={historyLimit} 
                  onInput={(e) => handleHistoryLimitChange(parseInt((e.target as HTMLInputElement).value))}
                  className="w-full h-1.5 bg-[var(--color-bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
                />
              </div>
            </div>

            <div className="h-px bg-[var(--color-border)]" />

            {/* Retrieval Settings */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold uppercase text-[var(--color-primary)] tracking-[0.2em] mb-4">{i18nStore.t('ragSettings.searchEngine')}</h4>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--color-text-secondary)]">
                  <div className="flex items-center gap-2"><Zap size={14} /> {i18nStore.t('ragSettings.topK')}</div>
                  <span className="font-mono text-[var(--color-primary)]">{topK}</span>
                </div>
                <input 
                  type="range" min="1" max="15" step="1" value={topK} 
                  onInput={(e) => handleTopKChange(parseInt((e.target as HTMLInputElement).value))}
                  className="w-full h-1.5 bg-[var(--color-bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--color-text-secondary)]">
                  <div className="flex items-center gap-2"><Info size={14} /> {i18nStore.t('ragSettings.contextWindow')}</div>
                  <span className="font-mono text-[var(--color-primary)]">+{chunkWindowSize}</span>
                </div>
                <input 
                  type="range" min="0" max="3" step="1" value={chunkWindowSize} 
                  onInput={(e) => handleChunkWindowSizeChange(parseInt((e.target as HTMLInputElement).value))}
                  className="w-full h-1.5 bg-[var(--color-bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--color-text-secondary)]">
                  <div className="flex items-center gap-2"><Sliders size={14} /> {i18nStore.t('ragSettings.chunkSize')}</div>
                  <span className="font-mono text-[var(--color-primary)]">{chunkSize} tokens</span>
                </div>
                <input 
                  type="range" min="256" max="2048" step="128" value={chunkSize} 
                  onInput={(e) => handleChunkSizeChange(parseInt((e.target as HTMLInputElement).value))}
                  className="w-full h-1.5 bg-[var(--color-bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
                />
                <p className="text-[9px] text-amber-500 flex items-center gap-1">
                  <AlertCircle size={10} /> {i18nStore.t('ragSettings.chunkSizeNote')}
                </p>
              </div>
            </div>

            <div className="h-px bg-[var(--color-border)]" />

            {/* Web Search Settings */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold uppercase text-[var(--color-primary)] tracking-[0.2em] mb-4">{i18nStore.t('ragSettings.webResearch')}</h4>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--color-text-secondary)]">
                  <div className="flex items-center gap-2"><Globe size={14} /> {i18nStore.t('ragSettings.sourcesToCollect')}</div>
                  <span className="font-mono text-[var(--color-primary)]">{maxWebUrls} {i18nStore.t('message.sources')}</span>
                </div>
                <input 
                  type="range" min="1" max="10" step="1" value={maxWebUrls} 
                  onInput={(e) => handleMaxWebUrlsChange(parseInt((e.target as HTMLInputElement).value))}
                  className="w-full h-1.5 bg-[var(--color-bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
                />
                <p className="text-[9px] text-[var(--color-text-tertiary)] italic">
                  {i18nStore.t('ragSettings.webSearchNote')}
                </p>
              </div>
            </div>

            <div className="h-px bg-[var(--color-border)]" />

            {/* Accuracy Settings */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold uppercase text-[var(--color-primary)] tracking-[0.2em] mb-4">{i18nStore.t('ragSettings.fidelityAlgorithm')}</h4>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--color-text-secondary)]">
                  <div className="flex items-center gap-2"><Zap size={14} /> {i18nStore.t('ragSettings.creativity')}</div>
                  <span className="font-mono text-[var(--color-primary)]">{temperature.toFixed(2)}</span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.05" value={temperature} 
                  onInput={(e) => handleTemperatureChange(parseFloat((e.target as HTMLInputElement).value))}
                  className="w-full h-1.5 bg-[var(--color-bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--color-text-secondary)]">
                  <div className="flex items-center gap-2"><CheckCircle size={14} /> {i18nStore.t('ragSettings.sensitivity')}</div>
                  <span className="font-mono text-[var(--color-primary)]">{Math.round(faithfulnessThreshold * 100)}%</span>
                </div>
                <input 
                  type="range" min="0.1" max="0.9" step="0.05" value={faithfulnessThreshold} 
                  onInput={(e) => handleFaithfulnessThresholdChange(parseFloat((e.target as HTMLInputElement).value))}
                  className="w-full h-1.5 bg-[var(--color-bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
                />
              </div>
            </div>
          </div>
        )}

        <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex justify-between items-center">
          <Button 
            onClick={async () => {
              const optimalGen = {
                historyWeight: 0.5,
                historyLimit: 10,
                faithfulnessThreshold: 0.45,
                temperature: 0.3,
                maxTokens: 1024
              };
              const optimalRAG = {
                topK: 7,
                chunkWindowSize: 2
              };
              const optimalWeb = {
                webSearchMaxUrls: 3
              };
              
              setLoading(true);
              await Promise.all([
                updateGenerationSettings(optimalGen),
                updateRAGSettings(optimalRAG),
                updateWebSearchSettings(optimalWeb)
              ]);
              
              setHistoryWeight(optimalGen.historyWeight);
              setHistoryLimit(optimalGen.historyLimit);
              setFaithfulnessThreshold(optimalGen.faithfulnessThreshold);
              setTemperature(optimalGen.temperature);
              setChunkWindowSize(optimalRAG.chunkWindowSize);
              setTopK(optimalRAG.topK);
              setMaxWebUrls(optimalWeb.webSearchMaxUrls);
              setLoading(false);
            }} 
            variant="ghost" 
            size="sm"
            className="text-[10px] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
          >
            {i18nStore.t('ragSettings.optimalConfig')}
          </Button>
          <Button onClick={() => uiStore.toggleRAGSettings()} variant="primary" size="sm">
            {i18nStore.t('ragSettings.saveClose')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
