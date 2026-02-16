import { useState, useEffect } from 'preact/hooks';
import { X, Plus, AppWindow, Edit2, Trash2, Globe, Info, Save, ExternalLink } from 'lucide-preact';
import { Button } from './ui/Button';
import { i18nStore } from '@/lib/stores/i18n';
import { extensionsStore } from '@/lib/stores';
import { saveCustomApp, getAllCustomApps, deleteCustomApp } from '@/lib/db/custom-apps';
import type { CustomApp } from '@/types';
import { cn } from '@/lib/utils';

interface CustomAppsSettingsProps {
  onClose: () => void;
}

export function CustomAppsSettings({ onClose }: CustomAppsSettingsProps) {
  const [apps, setApps] = useState<CustomApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [newApp, setNewApp] = useState<Omit<CustomApp, 'id' | 'createdAt'>>({
    name: '',
    url: '',
    baseUrlToIntercept: '',
    exampleUrl: '',
    instructions: '',
    iconUrl: ''
  });

  useEffect(() => {
    loadApps();
  }, []);

  async function loadApps() {
    setLoading(true);
    try {
      const all = await getAllCustomApps();
      setApps(all);
      extensionsStore.setCustomApps(all);
    } finally {
      setLoading(false);
    }
  }

  function startEditing(app: CustomApp) {
    setEditingId(app.id);
    setNewApp({
      name: app.name,
      url: app.url,
      baseUrlToIntercept: app.baseUrlToIntercept,
      exampleUrl: app.exampleUrl,
      instructions: app.instructions,
      iconUrl: app.iconUrl || ''
    });
    setShowAddForm(true);
  }

  async function handleSaveApp(e: Event) {
    e.preventDefault();
    if (!newApp.name || !newApp.url) return;

    try {
      const id = editingId || crypto.randomUUID();
      const app: CustomApp = {
        ...newApp,
        id,
        createdAt: editingId ? (apps.find(a => a.id === editingId)?.createdAt || Date.now()) : Date.now()
      };

      await saveCustomApp(app);
      
      setShowAddForm(false);
      setEditingId(null);
      setNewApp({
        name: '',
        url: '',
        baseUrlToIntercept: '',
        exampleUrl: '',
        instructions: '',
        iconUrl: ''
      });
      await loadApps();
    } catch (err) {
      console.error(err);
      alert('Error saving app');
    }
  }

  async function handleDelete(id: string) {
    if (confirm(i18nStore.t('common.confirmDelete'))) {
      await deleteCustomApp(id);
      await loadApps();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <AppWindow className="text-[var(--color-primary)]" />
              {i18nStore.t('customApps.title')}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {i18nStore.t('customApps.subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* App List */}
          <div className="space-y-4">
            {apps.map(app => (
              <div key={app.id} className="bg-[var(--color-bg-tertiary)]/30 border border-[var(--color-border)] rounded-xl p-4 flex items-center justify-between group">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-[var(--color-primary)]/10 rounded-lg text-[var(--color-primary)] flex items-center justify-center w-12 h-12">
                    {app.iconUrl ? (
                      <img src={app.iconUrl} alt={app.name} className="w-full h-full object-contain" />
                    ) : (
                      <Globe size={24} />
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium text-[var(--color-text)] flex items-center gap-2">
                      {app.name}
                    </h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1 font-mono truncate max-w-md">{app.url}</p>
                    {app.baseUrlToIntercept && (
                      <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">
                        Intercepts: <span className="font-mono">{app.baseUrlToIntercept}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEditing(app)}
                    className="p-2 rounded-lg text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors opacity-0 group-hover:opacity-100"
                    title={i18nStore.t('common.edit')}
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(app.id)}
                    className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title={i18nStore.t('common.delete')}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}

            {apps.length === 0 && !showAddForm && (
              <div className="text-center py-12 text-[var(--color-text-secondary)]">
                <AppWindow size={48} className="mx-auto mb-4 opacity-10" />
                <p>{i18nStore.t('customApps.noApps')}</p>
                <Button variant="ghost" className="mt-4" onClick={() => setShowAddForm(true)}>
                  {i18nStore.t('customApps.addApp')}
                </Button>
              </div>
            )}
          </div>

          {/* Add/Edit Form */}
          {showAddForm && (
            <form onSubmit={handleSaveApp} className="mt-6 bg-[var(--color-bg-tertiary)]/50 border border-[var(--color-border)] rounded-xl p-5 animate-in fade-in slide-in-from-top-4">
              <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                {editingId ? <Edit2 size={20} /> : <Plus size={20} />}
                {editingId ? i18nStore.t('customApps.editApp') : i18nStore.t('customApps.addApp')}
              </h3>
              
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                      {i18nStore.t('customApps.name')}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={i18nStore.t('customApps.placeholderName')}
                      value={newApp.name}
                      onChange={(e) => setNewApp({ ...newApp, name: (e.target as HTMLInputElement).value })}
                      className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:border-[var(--color-primary)] outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                      Icon URL (Optional)
                    </label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={newApp.iconUrl}
                      onChange={(e) => setNewApp({ ...newApp, iconUrl: (e.target as HTMLInputElement).value })}
                      className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:border-[var(--color-primary)] outline-none transition-all font-mono"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                    {i18nStore.t('customApps.url')}
                  </label>
                  <input
                    type="url"
                    required
                    placeholder={i18nStore.t('customApps.placeholderUrl')}
                    value={newApp.url}
                    onChange={(e) => setNewApp({ ...newApp, url: (e.target as HTMLInputElement).value })}
                    className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:border-[var(--color-primary)] outline-none transition-all font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1">
                      {i18nStore.t('customApps.baseUrlToIntercept')}
                      <Info size={12} className="opacity-50" title="Trigger integration when this URL is detected" />
                    </label>
                    <input
                      type="text"
                      placeholder={i18nStore.t('customApps.placeholderIntercept')}
                      value={newApp.baseUrlToIntercept}
                      onChange={(e) => setNewApp({ ...newApp, baseUrlToIntercept: (e.target as HTMLInputElement).value })}
                      className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:border-[var(--color-primary)] outline-none transition-all font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1">
                      {i18nStore.t('customApps.exampleUrl')}
                      <Info size={12} className="opacity-50" title={i18nStore.t('customApps.tipVariables')} />
                    </label>
                    <input
                      type="text"
                      placeholder={i18nStore.t('customApps.placeholderExample')}
                      value={newApp.exampleUrl}
                      onChange={(e) => setNewApp({ ...newApp, exampleUrl: (e.target as HTMLInputElement).value })}
                      className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm focus:border-[var(--color-primary)] outline-none transition-all font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                    {i18nStore.t('customApps.instructions')}
                  </label>
                  <textarea
                    rows={6}
                    placeholder={i18nStore.t('customApps.placeholderInstructions')}
                    value={newApp.instructions}
                    onChange={(e) => setNewApp({ ...newApp, instructions: (e.target as HTMLTextAreaElement).value })}
                    className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-sm focus:border-[var(--color-primary)] outline-none transition-all font-mono resize-none"
                  />
                  <p className="text-[10px] text-[var(--color-text-tertiary)] mt-2 flex items-center gap-1">
                    <Info size={10} />
                    Markdown supported
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
                  <Button type="button" variant="ghost" onClick={() => {
                    setShowAddForm(false);
                    setEditingId(null);
                    setNewApp({ name: '', url: '', baseUrlToIntercept: '', exampleUrl: '', instructions: '', iconUrl: '' });
                  }}>
                    {i18nStore.t('customApps.cancel')}
                  </Button>
                  <Button type="submit" variant="primary" className="gap-2">
                    <Save size={18} />
                    {editingId ? i18nStore.t('customApps.update') : i18nStore.t('customApps.save')}
                  </Button>
                </div>
              </div>
            </form>
          )}

          {!showAddForm && apps.length > 0 && (
            <div className="mt-8 flex justify-center">
              <Button onClick={() => setShowAddForm(true)} variant="outline" className="gap-2 py-6 px-8 border-dashed">
                <Plus size={20} />
                {i18nStore.t('customApps.addApp')}
              </Button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
