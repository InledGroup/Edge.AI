import { extensionsSignal, extensionsStore } from '@/lib/stores';
import { X, ExternalLink, RefreshCw } from 'lucide-preact';
import { useState } from 'preact/hooks';

export function ExtensionsPanel() {
  const { isOpen, activeExtension, url } = extensionsSignal.value;
  const [key, setKey] = useState(0);

  if (!isOpen || !url) return null;

  const title = activeExtension === 'inlinked' ? 'InLinked' : 'InQR';
  const logo = activeExtension === 'inlinked' 
    ? 'https://hosted.inled.es/INLINKED.png' 
    : 'https://hosted.inled.es/inqr.png';

  return (
    <div className="w-1/2 min-w-[400px] max-w-[800px] border-l border-[var(--color-border)] bg-[var(--color-bg)] h-full flex flex-col shadow-xl z-20 transition-all duration-300">
      <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-white p-1">
            <img src={logo} alt={title} className="w-full h-full object-contain" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2>
            <div className="flex items-center gap-1.5 overflow-hidden max-w-[200px] lg:max-w-md">
               <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider font-medium whitespace-nowrap">Extension</p>
               <span className="text-[var(--color-border)]">•</span>
               <p className="text-[9px] text-[var(--color-text-tertiary)] truncate font-mono opacity-70" title={url}>{url}</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button
            onClick={() => setKey(k => k + 1)}
            className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-lg text-[var(--color-text-secondary)] transition-colors"
            title="Recargar"
          >
            <RefreshCw size={18} />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-lg text-[var(--color-text-secondary)] transition-colors"
            title="Abrir en nueva pestaña"
          >
            <ExternalLink size={18} />
          </a>
          <button
            onClick={() => extensionsStore.close()}
            className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-lg text-[var(--color-text-secondary)] transition-colors"
            title="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 bg-[var(--color-bg)] relative overflow-hidden flex flex-col">
        <iframe
          key={key}
          src={url}
          className="flex-1 w-full h-full border-0"
          title={title}
          allow="clipboard-write"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
        
        {/* Fallback if loading fails */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center -z-10 pointer-events-none opacity-40">
           <p className="text-xs mb-2">Si el contenido no carga, es posible que tu navegador esté bloqueando la conexión.</p>
           <a 
             href={url} 
             target="_blank" 
             className="text-xs text-[var(--color-primary)] underline pointer-events-auto"
           >
             Abrir en nueva pestaña
           </a>
        </div>
      </div>
    </div>
  );
}
