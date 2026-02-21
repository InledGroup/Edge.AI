import { useState, useEffect } from 'preact/hooks';
import { RefreshCw, AlertTriangle, X, ShieldAlert, Globe } from 'lucide-preact';
import { i18nStore } from '@/lib/stores/i18n';
import { getExtensionBridgeSafe } from '@/lib/extension-bridge';

const CURRENT_VERSION = '0.1.0';
const UPDATE_API_URL = 'https://extupdater.inled.es/api/updates.json';

export function UpdateNotifier() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [newVersion, setNewVersion] = useState('');

  useEffect(() => {
    async function checkUpdates() {
      const bridge = getExtensionBridgeSafe();
      let updates = null;

      // MÉTODO 1: Extensión (Bypassea CORS 100%)
      if (bridge && bridge.isConnected()) {
        try {
          console.log('[UpdateNotifier] Checking via extension...');
          const res = await bridge.fetchJson(`${UPDATE_API_URL}?t=${Date.now()}`);
          if (res && res.results) updates = res.results;
          else if (Array.isArray(res)) updates = res;
        } catch (e) {
          console.warn('[UpdateNotifier] Extension fetch failed, falling back to proxies');
        }
      }

      // MÉTODO 2: Proxies (Si no hay extensión o falló)
      if (!updates) {
        updates = await fetchWithProxies();
      }

      if (updates) {
        processUpdates(updates);
      }
    }

    async function fetchWithProxies() {
      // Intento 1: AllOrigins
      try {
        const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(UPDATE_API_URL)}&t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.contents) return JSON.parse(data.contents);
        }
      } catch (e) {}

      // Intento 2: CORSProxy.io (Excelente alternativa)
      try {
        const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(UPDATE_API_URL)}`);
        if (res.ok) return await res.json();
      } catch (e) {}

      return null;
    }

    function processUpdates(updates: any[]) {
      if (!Array.isArray(updates)) return;

      // Buscar actualizaciones para edgeai (web o general)
      const edgeUpdate = updates.find(u => u.id && (u.id.startsWith('edgeai-web-v') || u.id.startsWith('edgeai-v')));
      
      if (edgeUpdate) {
        const versionMatch = edgeUpdate.id.match(/v(\d+\.\d+\.\d+)/);
        const detectedVersion = versionMatch ? versionMatch[1] : '';
        
        if (detectedVersion && detectedVersion !== CURRENT_VERSION) {
          setNewVersion(detectedVersion);
          setShowUpdate(true);
        }
      }
    }

    // Comprobar al cargar
    checkUpdates();
  }, []);

  if (!showUpdate) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
      <div className="w-full max-w-md bg-[var(--color-bg)] border border-[var(--color-warning)]/50 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 max-h-[90vh] flex flex-col">
        <div className="bg-[var(--color-warning)]/10 p-8 flex flex-col items-center justify-center space-y-4 border-b border-[var(--color-border)] shrink-0">
          <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center border border-amber-500/30">
            <RefreshCw size={32} className="text-amber-500 animate-spin-slow" />
          </div>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)] text-center">
            {i18nStore.t('updates.title')}
          </h2>
          <div className="px-3 py-1 bg-amber-500 text-black text-[10px] font-bold rounded-full uppercase tracking-widest">
            v{newVersion} disponible
          </div>
        </div>
        
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed text-center">
            {i18nStore.t('updates.message')}
          </p>
          
          <div className="bg-[var(--color-bg-secondary)] p-4 rounded-2xl border border-[var(--color-border)] space-y-3">
            <div className="flex items-start gap-3 text-sm text-[var(--color-text-primary)]">
              <div className="mt-0.5"><ShieldAlert size={16} className="text-blue-500" /></div>
              <p>{i18nStore.t('updates.step1')}</p>
            </div>
            <div className="flex items-start gap-3 text-sm text-[var(--color-text-primary)] font-semibold">
              <div className="mt-0.5"><AlertTriangle size={16} className="text-amber-500" /></div>
              <p>{i18nStore.t('updates.step2')}</p>
            </div>
            <div className="flex items-start gap-3 text-sm text-[var(--color-text-primary)]">
              <div className="mt-0.5"><RefreshCw size={16} className="text-green-500" /></div>
              <p>{i18nStore.t('updates.step3')}</p>
            </div>
          </div>

          <p className="text-xs text-[var(--color-text-tertiary)] italic text-center">
            {i18nStore.t('updates.backupNotice')}
          </p>
          
          <button
            onClick={() => setShowUpdate(false)}
            className="w-full py-4 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-bold rounded-2xl transition-all active:scale-95 shadow-lg shadow-[var(--color-primary)]/20"
          >
            {i18nStore.t('updates.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
