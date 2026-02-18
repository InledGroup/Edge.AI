// DocumentUploader - Componente para subir documentos

import { useState, useRef } from 'preact/hooks';
import { Upload, FileText, X, AlertCircle } from 'lucide-preact';

interface DocumentUploaderProps {
  onDocumentsUploaded: (docs: Array<{ name: string; content: string; file: File }>) => void;
  disabled?: boolean;
}

export function DocumentUploader({ onDocumentsUploaded, disabled = false }: DocumentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseFile = async (file: File): Promise<string> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (extension === 'txt' || extension === 'md') {
      return await file.text();
    }
    
    if (extension === 'pdf') {
      // Simple PDF text extraction (for basic PDFs)
      // For production, use pdf-parse or similar
      const text = await file.text();
      // Remove non-text characters
      return text.replace(/[^\x20-\x7E\n\r\t]/g, '');
    }
    
    throw new Error(`Formato no soportado: ${extension}`);
  };

  const handleFiles = async (files: FileList | File[]) => {
    if (disabled || isProcessing) return;
    
    setIsProcessing(true);
    
    try {
      const documents = [];
      
      for (const file of Array.from(files)) {
        // Validate file type
        const validTypes = ['text/plain', 'text/markdown', 'application/pdf'];
        const extension = file.name.split('.').pop()?.toLowerCase();
        const validExtensions = ['txt', 'md', 'pdf'];
        
        if (!validTypes.includes(file.type) && !validExtensions.includes(extension)) {
          console.warn(`Skipping unsupported file: ${file.name}`);
          continue;
        }
        
        // Parse file content
        const content = await parseFile(file);
        
        if (content.trim().length === 0) {
          console.warn(`Skipping empty file: ${file.name}`);
          continue;
        }
        
        documents.push({
          name: file.name,
          content,
          file,
        });
      }
      
      if (documents.length > 0) {
        onDocumentsUploaded(documents);
      }
    } catch (error) {
      console.error('Error processing files:', error);
      alert('Error al procesar archivos: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!disabled && !isProcessing) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer?.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files) {
      handleFiles(target.files);
    }
  };

  return (
    <div class="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && !isProcessing && fileInputRef.current?.click()}
        class={`
          relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300
          ${isDragging 
            ? 'border-[var(--inled-green)] bg-[var(--inled-green)]/10' 
            : 'border-gray-600 hover:border-[var(--inled-green)] hover:bg-gray-800/50'
          }
          ${disabled || isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.pdf"
          onChange={handleFileInput}
          class="hidden"
          disabled={disabled || isProcessing}
        />
        
        {isProcessing ? (
          <div class="flex flex-col items-center gap-3">
            <div class="w-12 h-12 border-4 border-[var(--inled-green)] border-t-transparent rounded-full animate-spin" />
            <p class="text-gray-400">Procesando archivos...</p>
          </div>
        ) : (
          <div class="flex flex-col items-center gap-4">
            <div class={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
              isDragging ? 'bg-[var(--inled-green)] text-black' : 'bg-gray-800 text-[var(--inled-green)]'
            }`}>
              <Upload size={32} />
            </div>
            
            <div>
              <p class="text-lg font-semibold text-white mb-1">
                {isDragging ? 'Suelta los archivos aquí' : 'Arrastra y suelta archivos aquí'}
              </p>
              <p class="text-sm text-gray-400">
                o haz clic para explorar (TXT, MD, PDF)
              </p>
            </div>
            
            <div class="flex items-center gap-2 text-xs text-gray-500">
              <AlertCircle size={14} />
              <span>Máximo 10 archivos por vez</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Supported formats info */}
      <div class="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500">
        <div class="flex items-center gap-1">
          <FileText size={14} />
          <span>Text (.txt)</span>
        </div>
        <div class="flex items-center gap-1">
          <FileText size={14} />
          <span>Markdown (.md)</span>
        </div>
        <div class="flex items-center gap-1">
          <FileText size={14} />
          <span>PDF (.pdf)</span>
        </div>
      </div>
    </div>
  );
}
