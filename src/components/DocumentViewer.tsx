// DocumentViewer - Modal to view document contents

import { useState, useEffect } from 'preact/hooks';
import { X, FileText, Download, Trash2 } from 'lucide-preact';
import { getDocument, deleteDocument } from '@/lib/db/documents';
import { documentsStore } from '@/lib/stores';
import type { Document } from '@/types';
import { MarkdownRenderer } from './ui/MarkdownRenderer';

interface DocumentViewerProps {
  documentId: string | null;
  onClose: () => void;
}

export function DocumentViewer({ documentId, onClose }: DocumentViewerProps) {
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (documentId) {
      loadDocument(documentId);
    }
  }, [documentId]);

  async function loadDocument(id: string) {
    setLoading(true);
    try {
      const doc = await getDocument(id);
      setDocument(doc || null);
    } catch (error) {
      console.error('Error loading document:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!document) return;

    if (!confirm(`¿Estás seguro de que quieres borrar "${document.name}"?`)) {
      return;
    }

    try {
      await deleteDocument(document.id);
      documentsStore.remove(document.id);
      onClose();
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Error al borrar el documento');
    }
  }

  function handleDownload() {
    if (!document) return;

    const blob = new Blob([document.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = document.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  if (!documentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl h-[90vh] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center">
              <FileText size={20} className="text-[var(--color-primary)]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-lg truncate">
                {document?.name || 'Cargando...'}
              </h2>
              {document && (
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {formatFileSize(document.size)} • {document.type.toUpperCase()} • {new Date(document.uploadedAt).toLocaleDateString('es-ES')}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              disabled={!document}
              className="w-9 h-9 rounded-lg hover:bg-[var(--color-bg-secondary)] flex items-center justify-center transition-colors disabled:opacity-50"
              aria-label="Descargar documento"
              title="Descargar documento"
            >
              <Download size={18} />
            </button>
            <button
              onClick={handleDelete}
              disabled={!document}
              className="w-9 h-9 rounded-lg hover:bg-[var(--color-error)]/20 text-[var(--color-error)] flex items-center justify-center transition-colors disabled:opacity-50"
              aria-label="Borrar documento"
              title="Borrar documento"
            >
              <Trash2 size={18} />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-lg hover:bg-[var(--color-bg-secondary)] flex items-center justify-center transition-colors"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)] rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-[var(--color-text-secondary)]">Cargando documento...</p>
              </div>
            </div>
          ) : document ? (
            <div className="prose prose-invert max-w-none">
              {document.type === 'md' || document.type === 'markdown' ? (
                <MarkdownRenderer content={document.content} />
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-sm bg-[var(--color-bg-secondary)] p-4 rounded-lg border border-[var(--color-border)]">
                  {document.content}
                </pre>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-[var(--color-text-secondary)]">No se pudo cargar el documento</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
