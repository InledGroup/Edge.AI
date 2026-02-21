import { useState, useEffect } from 'preact/hooks';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { X, Shield, Bell, Database } from 'lucide-preact';
import { uiStore, uiSignal } from '@/lib/stores';
import { i18nStore } from '@/lib/stores/i18n';
import { getSetting, setSetting } from '@/lib/db/settings';

export function PrivacySettings() {
  const [enableUpdates, setEnableUpdates] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const show = uiSignal.value.showPrivacySettings;

  useEffect(() => {
    if (show) {
      setLoading(true);
      getSetting('enableUpdates').then((val) => {
        setEnableUpdates(val as boolean | null);
        setLoading(false);
      });
    }
  }, [show]);

  if (!show) return null;

  const handleEnableUpdatesChange = async (val: boolean) => {
    setEnableUpdates(val);
    await setSetting('enableUpdates', val);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <Card className="w-full max-w-md bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
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
