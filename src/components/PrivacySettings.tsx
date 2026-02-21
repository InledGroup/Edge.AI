import { useState, useEffect } from 'preact/hooks';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { X, Shield, Bell, Database, Server, Share2, Globe, Key, Cpu } from 'lucide-preact';
import { uiStore, uiSignal } from '@/lib/stores';
import { i18nStore } from '@/lib/stores/i18n';
import { getSetting, setSetting } from '@/lib/db/settings';

export function PrivacySettings() {
  const [enableUpdates, setEnableUpdates] = useState<boolean | null>(null);
  const [enableInboundApi, setEnableInboundApi] = useState(false);
  const [inboundApiKey, setInboundApiKey] = useState('');
  const [extensionId, setExtensionId] = useState('');
  const [activeChatModel, setActiveChatModel] = useState('');
  const [allModels, setAllModels] = useState<string[]>([]);
  const [enableOutboundApi, setEnableOutboundApi] = useState(false);
  const [outboundApiUrl, setOutboundApiUrl] = useState('');
  const [outboundApiKey, setOutboundApiKey] = useState('');
  const [outboundModelId, setOutboundModelId] = useState('');
  const [loading, setLoading] = useState(true);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const show = uiSignal.value.showPrivacySettings;

  useEffect(() => {
    if (show) {
      setLoading(true);
      setTestStatus('idle');
      Promise.all([
        getSetting('enableUpdates'),
        getSetting('enableInboundApi'),
        getSetting('inboundApiKey'),
        getSetting('enableOutboundApi'),
        getSetting('outboundApiUrl'),
        getSetting('outboundApiKey'),
        getSetting('outboundModelId'),
        getSetting('extensionId'),
      ]).then(([updates, inbound, inboundKey, outbound, outboundUrl, outboundKey, outboundModel, extId]) => {
        setEnableUpdates(updates as boolean | null);
        setEnableInboundApi(!!inbound);
        setInboundApiKey(inboundKey as string || '');
        setEnableOutboundApi(!!outbound);
        setOutboundApiUrl(outboundUrl as string || '');
        setOutboundApiKey(outboundKey as string || '');
        setOutboundModelId(outboundModel as string || '');
        setExtensionId(extId as string || '');
        
        // Get currently active model from manager
        import('@/lib/ai/engine-manager').then(({ EngineManager }) => {
          const names = EngineManager.getModelNames();
          setActiveChatModel(names.chat || '');
        });

        // Get all models for the list
        import('@/lib/ai/model-registry').then(({ MODEL_REGISTRY }) => {
          if (MODEL_REGISTRY) {
            setAllModels(MODEL_REGISTRY.filter(m => m.type === 'chat').map(m => m.id));
          }
        });
        
        setLoading(false);
      });
    }
  }, [show]);

  if (!show) return null;

  const handleEnableUpdatesChange = async (val: boolean) => {
    setEnableUpdates(val);
    await setSetting('enableUpdates', val);
  };

  const toggleInboundApi = async () => {
    const newVal = !enableInboundApi;
    setEnableInboundApi(newVal);
    await setSetting('enableInboundApi', newVal);
  };

  const toggleOutboundApi = async () => {
    const newVal = !enableOutboundApi;
    setEnableOutboundApi(newVal);
    setTestStatus('idle');
    await setSetting('enableOutboundApi', newVal);
  };

  const updateInboundKey = async (val: string) => {
    setInboundApiKey(val);
    await setSetting('inboundApiKey', val);
  };

  const updateOutboundUrl = async (val: string) => {
    setOutboundApiUrl(val);
    setTestStatus('idle');
    await setSetting('outboundApiUrl', val);
  };

  const updateOutboundKey = async (val: string) => {
    setOutboundApiKey(val);
    setTestStatus('idle');
    await setSetting('outboundApiKey', val);
  };

  const updateOutboundModel = async (val: string) => {
    setOutboundModelId(val);
    setTestStatus('idle');
    await setSetting('outboundModelId', val);
  };

  const testConnection = async () => {
    if (!outboundApiUrl) return;
    setTestStatus('testing');
    try {
      const { getExtensionBridge } = await import('@/lib/extension-bridge');
      const bridge = getExtensionBridge();
      const headers: any = {};
      if (outboundApiKey) headers['Authorization'] = `Bearer ${outboundApiKey}`;
      
      const response = await bridge.fetchJson(`${outboundApiUrl.replace(/\/+$/, '')}/models`, {
        method: 'GET',
        headers
      });
      
      if (response.success) {
        setTestStatus('success');
      } else {
        setTestStatus('error');
      }
    } catch (e) {
      console.error('Connection test failed:', e);
      setTestStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <Card className="w-full max-w-lg bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-[var(--color-primary)]" />
            <h3 className="font-bold text-sm uppercase tracking-widest">{i18nStore.t('privacy.title')}</h3>
          </div>
          <button onClick={() => uiStore.togglePrivacySettings()} className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="spinner-sm mx-auto mb-2" />
            <p className="text-xs text-[var(--color-text-tertiary)]">Cargando...</p>
          </div>
        ) : (
          <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              {i18nStore.t('privacy.subtitle')}
            </p>

            {/* Updates Settings */}
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-[var(--color-bg-secondary)] p-4 rounded-xl border border-[var(--color-border)]">
                <div className="space-y-1 pr-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-primary)]">
                    <Bell size={14} className="text-[var(--color-primary)]" />
                    {i18nStore.t('privacy.enableUpdates')}
                  </div>
                  <p className="text-[10px] text-[var(--color-text-tertiary)] leading-relaxed">
                    {i18nStore.t('privacy.enableUpdatesDesc')}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input 
                    type="checkbox" 
                    checked={enableUpdates === true} 
                    onChange={(e) => handleEnableUpdatesChange((e.target as HTMLInputElement).checked)}
                    className="sr-only peer" 
                  />
                  <div className="w-9 h-5 bg-[var(--color-bg-tertiary)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                </label>
              </div>
            </div>

            {/* Inbound API (Server Mode) */}
            <div className="bg-[var(--color-bg-secondary)] p-4 rounded-xl border border-[var(--color-border)] space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1 pr-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-primary)]">
                    <Share2 size={14} className="text-[var(--color-primary)]" />
                    {i18nStore.t('privacy.inboundApi')}
                  </div>
                  <p className="text-[10px] text-[var(--color-text-tertiary)] leading-relaxed">
                    {i18nStore.t('privacy.inboundApiDesc')}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input 
                    type="checkbox" 
                    checked={enableInboundApi} 
                    onChange={toggleInboundApi}
                    className="sr-only peer" 
                  />
                  <div className="w-9 h-5 bg-[var(--color-bg-tertiary)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                </label>
              </div>

              {enableInboundApi && (
                <div className="pt-2 space-y-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[var(--color-text-tertiary)] flex items-center gap-1 uppercase tracking-wider">
                        <Globe size={10} /> {i18nStore.t('privacy.apiUrl')}
                      </label>
                      <div className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[10px] font-mono break-all text-[var(--color-primary)] font-bold">
                        {extensionId ? `chrome-extension://${extensionId}/v1` : '---'}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--color-text-tertiary)] flex items-center gap-1 uppercase tracking-wider">
                          <Share2 size={10} /> {i18nStore.t('privacy.extensionId')}
                        </label>
                        <div className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[10px] font-mono break-all text-[var(--color-text-secondary)]">
                          {extensionId || '---'}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[var(--color-text-tertiary)] flex items-center gap-1 uppercase tracking-wider">
                          <Key size={10} /> {i18nStore.t('privacy.apiKey')}
                        </label>
                        <input 
                          type="password" 
                          value={inboundApiKey}
                          onInput={(e) => updateInboundKey((e.target as HTMLInputElement).value)}
                          placeholder="edgeai-sk-..."
                          className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-[var(--color-primary)] outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--color-text-tertiary)] flex items-center gap-1 uppercase tracking-wider">
                      <Cpu size={10} /> {i18nStore.t('privacy.availableModels')}
                    </label>
                    <div className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[9px] flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                      {allModels.length > 0 ? (
                        allModels.map(id => (
                          <span key={id} className={`px-2 py-0.5 rounded border font-mono ${id === activeChatModel ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border-[var(--color-primary)]/30 font-bold' : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)] border-[var(--color-border)]'}`}>
                            {id}
                          </span>
                        ))
                      ) : (
                        <span className="text-[var(--color-text-tertiary)] italic">Cargue un modelo primero</span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                    <p className="text-[9px] text-yellow-600 leading-tight">
                      <strong>Conexión Externa:</strong> El navegador no permite abrir puertos TCP (ej. 8080). Use el ID de extensión arriba como "Puerto Virtual" mediante mensajes de Chrome.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Outbound API (Client Mode) */}
            <div className="bg-[var(--color-bg-secondary)] p-4 rounded-xl border border-[var(--color-border)] space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1 pr-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-primary)]">
                    <Server size={14} className="text-[var(--color-primary)]" />
                    {i18nStore.t('privacy.outboundApi')}
                  </div>
                  <p className="text-[10px] text-[var(--color-text-tertiary)] leading-relaxed">
                    {i18nStore.t('privacy.outboundApiDesc')}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input 
                    type="checkbox" 
                    checked={enableOutboundApi} 
                    onChange={toggleOutboundApi}
                    className="sr-only peer" 
                  />
                  <div className="w-9 h-5 bg-[var(--color-bg-tertiary)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                </label>
              </div>

              {enableOutboundApi && (
                <div className="pt-2 space-y-4 animate-in slide-in-from-top-2 duration-200">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--color-text-tertiary)] flex items-center gap-1 uppercase tracking-wider">
                      <Globe size={10} /> {i18nStore.t('privacy.apiUrl')}
                    </label>
                    <input 
                      type="text" 
                      value={outboundApiUrl}
                      onInput={(e) => updateOutboundUrl((e.target as HTMLInputElement).value)}
                      placeholder="http://localhost:11434/v1"
                      className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-[var(--color-primary)] outline-none"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[var(--color-text-tertiary)] flex items-center gap-1 uppercase tracking-wider">
                        <Key size={10} /> {i18nStore.t('privacy.apiKey')}
                      </label>
                      <input 
                        type="password" 
                        value={outboundApiKey}
                        onInput={(e) => updateOutboundKey((e.target as HTMLInputElement).value)}
                        placeholder="sk-..."
                        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-[var(--color-primary)] outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-[var(--color-text-tertiary)] flex items-center gap-1 uppercase tracking-wider">
                        <Cpu size={10} /> {i18nStore.t('privacy.modelId')}
                      </label>
                      <input 
                        type="text" 
                        value={outboundModelId}
                        onInput={(e) => updateOutboundModel((e.target as HTMLInputElement).value)}
                        placeholder="llama3.2"
                        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-[var(--color-primary)] outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <Button 
                      onClick={testConnection} 
                      variant="secondary" 
                      size="sm" 
                      className="text-[10px] h-7 px-3"
                      disabled={testStatus === 'testing' || !outboundApiUrl}
                    >
                      {testStatus === 'testing' ? (
                        <div className="spinner-sm !w-3 !h-3 mr-2" />
                      ) : (
                        <Globe size={12} className="mr-2" />
                      )}
                      {i18nStore.t('privacy.testConnection')}
                    </Button>
                    
                    {testStatus === 'success' && (
                      <span className="text-[10px] text-green-500 font-bold flex items-center gap-1 animate-in fade-in slide-in-from-left-2">
                        ✓ {i18nStore.t('privacy.connectionSuccess')}
                      </span>
                    )}
                    
                    {testStatus === 'error' && (
                      <span className="text-[10px] text-red-500 font-bold flex items-center gap-1 animate-in fade-in slide-in-from-left-2">
                        ✕ {i18nStore.t('privacy.connectionError')}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Data Storage Info */}
            <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-500">
                <Database size={14} />
                {i18nStore.t('privacy.dataStorage')}
              </div>
              <p className="text-[10px] text-[var(--color-text-secondary)] leading-relaxed">
                {i18nStore.t('privacy.dataStorageDesc')}
              </p>
            </div>
          </div>
        )}

        <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex justify-end">
          <Button onClick={() => uiStore.togglePrivacySettings()} variant="primary" size="sm">
            {i18nStore.t('common.close')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
