import { useState, useRef } from 'preact/hooks';
import { X, Database, Download, Upload, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-preact';
import { i18nStore } from '@/lib/stores/i18n';
import { exportConversations, importConversations } from '@/lib/db/conversations';
import { Button } from './ui/Button';

interface DataManagerProps {
  onClose: () => void;
}

export function DataManager({ onClose }: DataManagerProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setStatus('loading');
    try {
      const data = await exportConversations();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edgeai-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      setStatus('success');
      setMessage(i18nStore.t('data.exportSuccess'));
      setTimeout(() => setStatus('idle'), 3000);
    } catch (error) {
      console.error(error);
      setStatus('error');
      setMessage('Error al exportar los datos');
    }
  };

  const handleImport = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    setStatus('loading');
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        
        await importConversations(data);
        
        setStatus('success');
        setMessage(i18nStore.t('data.importSuccess'));
        setTimeout(() => {
          window.location.reload(); // Recargar para ver los cambios
        }, 1500);
      } catch (error) {
        console.error(error);
        setStatus('error');
        setMessage(i18nStore.t('data.importError'));
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center bg-[var(--color-bg-secondary)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Database size={20} />
            </div>
            <h3 className="font-semibold">{i18nStore.t('data.title')}</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
              <ShieldCheck size={18} className="text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                {i18nStore.t('data.notice')}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <Button 
                variant="secondary" 
                className="w-full justify-start gap-3 h-14"
                onClick={handleExport}
                disabled={status === 'loading'}
              >
                <Download size={18} />
                <div className="text-left">
                  <div className="font-semibold text-sm">{i18nStore.t('data.export')}</div>
                  <div className="text-[10px] opacity-60">{i18nStore.t('data.exportDesc')}</div>
                </div>
              </Button>

              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".json" 
                onChange={handleImport}
              />
              
              <Button 
                variant="secondary" 
                className="w-full justify-start gap-3 h-14"
                onClick={() => fileInputRef.current?.click()}
                disabled={status === 'loading'}
              >
                <Upload size={18} />
                <div className="text-left">
                  <div className="font-semibold text-sm">{i18nStore.t('data.import')}</div>
                  <div className="text-[10px] opacity-60">{i18nStore.t('data.importDesc')}</div>
                </div>
              </Button>
            </div>
          </div>

          {status !== 'idle' && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-sm animate-in slide-in-from-bottom-2 ${
              status === 'success' ? 'bg-green-500/10 text-green-500' : 
              status === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'
            }`}>
              {status === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{message || (status === 'loading' ? 'Procesando...' : '')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
