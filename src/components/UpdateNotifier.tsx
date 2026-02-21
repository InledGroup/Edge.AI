import { useState, useEffect } from 'preact/hooks';
import { RefreshCw, AlertTriangle, ShieldAlert, Globe, Check, X, Shield, Bell } from 'lucide-preact';
import { i18nStore } from '@/lib/stores/i18n';
import { getSetting, setSetting } from '@/lib/db/settings';

const CURRENT_VERSION = '0.1.0';
const UPDATE_API_URL = 'https://extupdater.inled.es/api/updates.json';

export function UpdateNotifier() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [newVersion, setNewVersion] = useState('');

  useEffect(() => {
    async function init() {
      const enabled = await getSetting('enableUpdates');
      
      if (enabled === null) {
        // Primera vez, pedir consentimiento
        setShowConsent(true);
      } else if (enabled === true) {
        // Si está activado, comprobar actualizaciones directamente (sin proxies)
        checkUpdates();
      }
    }

    async function checkUpdates() {
      try {
        const response = await fetch(UPDATE_API_URL, { 
          cache: 'no-store',
          mode: 'cors' // Petición directa estándar
        });
        
        if (response.ok) {
          const updates = await response.json();
          processUpdates(updates);
        }
      } catch (error) {
        // Fallará si hay problemas de red o CORS en el servidor, 
        // pero cumplimos con no usar proxies.
        console.warn('[UpdateNotifier] Update check failed (Direct connection only)');
      }
    }

    function processUpdates(updates: any[]) {
      if (!Array.isArray(updates)) return;

      const edgeUpdate = updates.find(u => u.id && (u.id.startsWith('edgeai-web-v')));
      
      if (edgeUpdate) {
        const versionMatch = edgeUpdate.id.match(/v(\d+\.\d+\.\d+)/);
        const detectedVersion = versionMatch ? versionMatch[1] : '';
        
        if (detectedVersion && detectedVersion !== CURRENT_VERSION) {
          setNewVersion(detectedVersion);
          setShowUpdate(true);
        }
      }
    }

    init();
  }, []);

  const handleConsent = async (consent: boolean) => {
    await setSetting('enableUpdates', consent);
    setShowConsent(false);
    if (consent) {
      // Si acepta, podemos recargar o simplemente esperar a la próxima vez
      // Por simplicidad, ejecutamos la comprobación ahora
      window.location.reload();
    }
  };

  if (showConsent) {
    return (
      <div className="fixed bottom-6 right-6 z-[200] max-w-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl shadow-2xl p-5 animate-in slide-in-from-bottom-10 duration-500">
        <div className="flex gap-4">
          <div className="w-10 h-10 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center shrink-0">
            <Shield size={20} className="text-[var(--color-primary)]" />
          </div>
          <div className="space-y-3">
            <div>
              <h4 className="font-bold text-sm text-[var(--color-text-primary)]">
                {i18nStore.t('updates.title')}
              </h4>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed mt-1">
                {i18nStore.t('privacy.enableUpdatesDesc')}
              </p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => handleConsent(true)}
                className="px-3 py-1.5 bg-[var(--color-primary)] text-black text-xs font-bold rounded-lg hover:opacity-90 transition-all"
              >
                {i18nStore.t('common.ready')}
              </button>
              <button 
                onClick={() => handleConsent(false)}
                className="px-3 py-1.5 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] text-xs font-medium rounded-lg hover:bg-[var(--color-bg-hover)] transition-all"
              >
                {i18nStore.t('common.close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
