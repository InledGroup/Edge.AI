import React, { useState } from 'react';
import { ShieldAlert, X, ExternalLink, Globe, Check } from 'lucide-preact';
import { Button } from '../ui/Button';

interface UrlConfirmationModalProps {
  urls: string[];
  onConfirm: (selectedUrls: string[]) => void;
  onCancel: () => void;
}

export function UrlConfirmationModal({ urls, onConfirm, onCancel }: UrlConfirmationModalProps) {
  const [selectedUrls, setSelectedUrls] = useState<string[]>(urls);

  const toggleUrl = (url: string) => {
    if (selectedUrls.includes(url)) {
      setSelectedUrls(selectedUrls.filter(u => u !== url));
    } else {
      setSelectedUrls([...selectedUrls, url]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center bg-[var(--color-bg-secondary)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <ShieldAlert size={20} />
            </div>
            <h3 className="font-semibold text-[var(--color-text-primary)]">Confirmar fuentes externas</h3>
          </div>
          <button 
            onClick={onCancel}
            className="p-1 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed">
            La IA ha encontrado estas páginas para responder tu pregunta. 
            Por seguridad, confirma cuáles quieres que analice:
          </p>

          <div className="space-y-2">
            {urls.map((url, idx) => {
              const domain = new URL(url).hostname.replace('www.', '');
              const isSelected = selectedUrls.includes(url);
              
              return (
                <div 
                  key={idx} 
                  className={`relative group flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'bg-[var(--color-primary)]/5 border-[var(--color-primary)]/30 shadow-sm' 
                      : 'bg-[var(--color-bg-secondary)] border-[var(--color-border)] opacity-60 hover:opacity-80'
                  }`}
                  onClick={() => toggleUrl(url)}
                >
                  <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-bg)] border-[var(--color-border)]'
                  }`}>
                    {isSelected && <Check size={12} strokeWidth={3} />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] mb-0.5 font-medium">
                      <Globe size={10} />
                      <span>{domain}</span>
                    </div>
                    <div className="text-sm text-[var(--color-text-primary)] truncate" title={url}>{url}</div>
                  </div>
                  
                  <a 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-all"
                    onClick={(e) => e.stopPropagation()}
                    title="Abrir enlace en nueva pestaña"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]/50 flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm(selectedUrls)}
            disabled={selectedUrls.length === 0}
            className="shadow-lg shadow-[var(--color-primary)]/20"
          >
            Analizar {selectedUrls.length} páginas
          </Button>
        </div>
      </div>
    </div>
  );
}
