// DocumentUpload Island - Upload and process documents

import { useState, useRef } from 'preact/hooks';
import { FileText, Trash2, UploadCloud } from 'lucide-preact';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ProgressBar } from './ui/ProgressBar';
import { documentsStore, processingStore, modelsReady } from '@/lib/stores';
import { parseDocument, validateFile } from '@/lib/parsers';
import { createDocument } from '@/lib/db/documents';
import { processDocument } from '@/lib/rag/rag-pipeline';
import EngineManager from '@/lib/ai/engine-manager';
import { getRAGSettings } from '@/lib/db/settings';

export function DocumentUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) {
      await processFiles(files);
    }
  }

  async function handleFileSelect(e: Event) {
    const target = e.target as HTMLInputElement;
    const files = Array.from(target.files || []);
    if (files.length > 0) {
      await processFiles(files);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function processFiles(files: File[]) {
    for (const file of files) {
      await processFile(file);
    }
  }

  async function processFile(file: File) {
    try {
      console.log(`📄 Processing file: ${file.name}`);

      // CRITICAL: Check if models are ready before processing
      if (!modelsReady.value) {
        alert('⚠️ Los modelos de IA aún no están cargados. Por favor, espera a que se completen antes de subir documentos.');
        return;
      }

      // Validate file
      const validation = validateFile(file);
      if (!validation.valid) {
        alert(validation.error);
        return;
      }

      // Parse document
      processingStore.set({
        documentId: 'temp',
        stage: 'parsing',
        progress: 0,
        message: 'Extrayendo texto...'
      });

      const parsed = await parseDocument(file, {
        onProgress: (progress, message) => {
          processingStore.set({
            documentId: 'temp',
            stage: 'parsing',
            progress,
            message
          });
        }
      });

      // Create document in DB
      const document = await createDocument({
        name: file.name,
        type: parsed.type,
        content: parsed.text,
        size: file.size,
        metadata: parsed.metadata
      });

      // Add to store
      documentsStore.add(document);

      console.log(`✅ Document created: ${document.id}`);

      // Now process with RAG pipeline
      await processDocumentRAG(document.id, parsed.text);

    } catch (error) {
      console.error('❌ Failed to process file:', error);
      alert(`Error: ${error}`);
      processingStore.clear();
    }
  }

  async function processDocumentRAG(documentId: string, text: string) {
    try {
      // Get settings
      const settings = await getRAGSettings();

      // Get initialized embedding engine from global manager
      // This was already loaded in ModelSelector
      const embeddingEngine = await EngineManager.getEmbeddingEngine();

      // Process document
      await processDocument(
        documentId,
        text,
        embeddingEngine,
        settings.chunkSize,
        (status) => {
          processingStore.set(status);
          documentsStore.update(documentId, {
            status: status.stage === 'complete' ? 'ready' : 'processing'
          });
        }
      );

      processingStore.clear();
      console.log(`✅ Document ${documentId} processed with RAG`);

    } catch (error) {
      console.error('❌ Failed to process document with RAG:', error);
      documentsStore.update(documentId, {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      processingStore.clear();
    }
  }

  async function deleteDocument(id: string) {
    if (!confirm('¿Eliminar este documento?')) return;

    try {
      const { deleteDocument: dbDeleteDocument } = await import('@/lib/db/documents');
      await dbDeleteDocument(id);
      documentsStore.remove(id);
      console.log(`✅ Document ${id} deleted`);
    } catch (error) {
      console.error('Failed to delete document:', error);
      alert(`Error: ${error}`);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Documentos</h3>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Sube documentos para consultar con IA
        </p>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${isDragging
            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
            : 'border-[var(--color-border)] hover:border-[var(--color-primary)]'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md,.markdown"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="space-y-2">
          <div className="text-[var(--color-primary)] flex justify-center">
            <UploadCloud size={48} strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium">
            Arrastra archivos aquí o
          </p>
          <Button
            variant="default"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={!modelsReady.value}
          >
            {modelsReady.value ? 'Seleccionar archivos' : 'Esperando modelos...'}
          </Button>
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {modelsReady.value
              ? 'PDF, TXT, MD (máx. 50MB)'
              : '⏳ Los modelos deben cargarse primero'
            }
          </p>
        </div>
      </div>

      {/* Processing Status */}
      {processingStore.current && (
        <div className="bg-[var(--color-bg-secondary)] rounded-lg p-4">
          <ProgressBar
            progress={processingStore.current.progress}
            label={processingStore.current.message}
            variant={processingStore.current.stage === 'error' ? 'error' : 'default'}
          />
        </div>
      )}

      {/* Documents List */}
      {documentsStore.all.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Documentos cargados</h4>
          {documentsStore.all.map(doc => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 bg-[var(--color-bg-secondary)] rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{doc.name}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  {(doc.size / 1024).toFixed(1)} KB · {doc.type.toUpperCase()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {doc.status === 'ready' && (
                  <span className="text-xs text-[var(--color-success)] font-bold">READY</span>
                )}
                {doc.status === 'processing' && (
                  <span className="spinner text-[var(--color-primary)]" />
                )}
                {doc.status === 'error' && (
                  <span className="text-xs text-[var(--color-error)]" title={doc.errorMessage}>
                    ✗
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteDocument(doc.id)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
