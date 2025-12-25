// DocumentCanvas - WYSIWYG editor with export capabilities
// Uses Quill for rich text editing and exports to PDF, MD, DOCX

import { useEffect, useRef, useState } from 'preact/hooks';
import { Download, FileText, X } from 'lucide-preact';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

export interface DocumentCanvasProps {
  initialContent?: string;
  onClose?: () => void;
  onContentChange?: (content: string) => void;
}

// Export function to get content from outside
export function getCanvasContent(quillRef: any): string {
  if (!quillRef?.current) return '';
  return quillRef.current.root?.innerHTML || '';
}

export function DocumentCanvas({ initialContent = '', onClose, onContentChange }: DocumentCanvasProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Ensure we're on the client
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !editorRef.current || quillRef.current) return;

    // Dynamic import of Quill and its CSS (client-side only)
    async function initQuill() {
      try {
        // Import Quill dynamically
        const QuillModule = await import('quill');
        const Quill = QuillModule.default;

        // Import CSS
        await import('quill/dist/quill.snow.css');

        if (!editorRef.current || quillRef.current) return;
        // Initialize Quill editor
        const quill = new Quill(editorRef.current, {
          theme: 'snow',
          modules: {
            toolbar: [
              [{ header: [1, 2, 3, 4, 5, 6, false] }],
              ['bold', 'italic', 'underline', 'strike'],
              [{ list: 'ordered' }, { list: 'bullet' }],
              [{ indent: '-1' }, { indent: '+1' }],
              [{ align: [] }],
              ['blockquote', 'code-block'],
              [{ color: [] }, { background: [] }],
              ['link'],
              ['clean'],
            ],
          },
          placeholder: 'El contenido generado aparecerá aquí...',
        });

        // Set initial content if provided
        if (initialContent) {
          quill.clipboard.dangerouslyPasteHTML(initialContent);
        }

        // Listen for content changes
        quill.on('text-change', () => {
          if (onContentChange) {
            const html = quill.root.innerHTML;
            onContentChange(html);
          }
        });

        quillRef.current = quill;
      } catch (error) {
        console.error('Error initializing Quill:', error);
      }
    }

    initQuill();

    return () => {
      if (quillRef.current) {
        quillRef.current = null;
      }
    };
  }, [isClient, initialContent]);

  // Update content when initialContent changes
  useEffect(() => {
    if (!isClient || !quillRef.current || !initialContent) return;

    const currentContent = quillRef.current.root?.innerHTML;
    if (currentContent === '<p><br></p>' || currentContent === '') {
      quillRef.current.clipboard.dangerouslyPasteHTML(initialContent);
    }
  }, [isClient, initialContent]);

  /**
   * Export as Markdown
   */
  async function exportAsMarkdown() {
    if (!isClient || !quillRef.current) return;

    try {
      const html = quillRef.current.root.innerHTML;
      const markdown = htmlToMarkdown(html);

      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });

      // Manual download (no external dependency needed)
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documento-${Date.now()}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting to Markdown:', error);
      alert('Error al exportar a Markdown');
    }
  }

  /**
   * Export as Word (DOCX)
   * Uses html-docx-js from CDN with multiple fallbacks
   */
  async function exportAsWord() {
    if (!isClient || !quillRef.current) return;
    setIsExporting(true);

    try {
      const html = quillRef.current.root.innerHTML;

      // Wrap in proper HTML structure
      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; }
            h1, h2, h3, h4, h5, h6 { margin-top: 1em; margin-bottom: 0.5em; }
            p { margin-bottom: 1em; }
          </style>
        </head>
        <body>
          ${html}
        </body>
        </html>
      `;

      // Load html-docx-js from CDN if not already loaded
      if (!(window as any).htmlDocx) {
        // Try multiple CDN sources
        const cdnUrls = [
          'https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js',
          'https://unpkg.com/html-docx-js@0.3.1/dist/html-docx.js',
          'https://cdnjs.cloudflare.com/ajax/libs/html-docx-js/0.3.1/html-docx.min.js'
        ];

        let loaded = false;
        let lastError: Error | null = null;

        for (const cdnUrl of cdnUrls) {
          try {
            const script = document.createElement('script');
            script.src = cdnUrl;

            await new Promise<void>((resolve, reject) => {
              script.onload = () => resolve();
              script.onerror = () => reject(new Error(`Failed to load from ${cdnUrl}`));
              document.head.appendChild(script);
            });

            // Verify the library loaded correctly
            if ((window as any).htmlDocx) {
              loaded = true;
              console.log(`Successfully loaded html-docx-js from ${cdnUrl}`);
              break;
            }
          } catch (error) {
            lastError = error as Error;
            console.warn(`Failed to load from ${cdnUrl}:`, error);
          }
        }

        if (!loaded) {
          throw new Error(`No se pudo cargar html-docx-js desde ningún CDN. Último error: ${lastError?.message}`);
        }
      }

      const htmlDocx = (window as any).htmlDocx;
      if (!htmlDocx || typeof htmlDocx.asBlob !== 'function') {
        throw new Error('html-docx-js se cargó pero no está funcionando correctamente');
      }

      const converted = htmlDocx.asBlob(fullHtml);

      // Manual download
      const url = URL.createObjectURL(converted);
      const a = document.createElement('a');
      a.href = url;
      a.download = `documento-${Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting to Word:', error);
      alert(`Error al exportar a Word: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  }

  /**
   * Export as PDF (using browser print)
   */
  function exportAsPDF() {
    if (!isClient || !quillRef.current || typeof window === 'undefined') return;

    const html = quillRef.current.root.innerHTML;

    // Create a new window with the content
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, permite ventanas emergentes para exportar PDF');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Documento</title>
        <style>
          @page {
            margin: 2cm;
          }
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 100%;
          }
          h1, h2, h3, h4, h5, h6 {
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            page-break-after: avoid;
          }
          p {
            margin-bottom: 1em;
            orphans: 3;
            widows: 3;
          }
          blockquote {
            border-left: 3px solid #ccc;
            margin-left: 0;
            padding-left: 1em;
            color: #666;
          }
          code {
            background: #f4f4f4;
            padding: 0.2em 0.4em;
            border-radius: 3px;
          }
          pre {
            background: #f4f4f4;
            padding: 1em;
            border-radius: 5px;
            overflow-x: auto;
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>
    `);

    printWindow.document.close();

    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  /**
   * Simple HTML to Markdown converter
   */
  function htmlToMarkdown(html: string): string {
    let markdown = html;

    // Remove Quill-specific classes and empty paragraphs
    markdown = markdown.replace(/<p[^>]*><br><\/p>/g, '\n');

    // Headers
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/g, '# $1\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/g, '## $1\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/g, '### $1\n');
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/g, '#### $1\n');
    markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/g, '##### $1\n');
    markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/g, '###### $1\n');

    // Bold and italic
    markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/g, '**$1**');
    markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/g, '**$1**');
    markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/g, '*$1*');
    markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/g, '*$1*');

    // Lists
    markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/g, '- $1\n');
    markdown = markdown.replace(/<\/ul>/g, '\n');
    markdown = markdown.replace(/<ul[^>]*>/g, '');
    markdown = markdown.replace(/<\/ol>/g, '\n');
    markdown = markdown.replace(/<ol[^>]*>/g, '');

    // Blockquotes
    markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/g, '> $1\n');

    // Code
    markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/g, '`$1`');
    markdown = markdown.replace(/<pre[^>]*>(.*?)<\/pre>/g, '```\n$1\n```\n');

    // Links
    markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, '[$2]($1)');

    // Paragraphs and breaks
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/g, '$1\n\n');
    markdown = markdown.replace(/<br\s*\/?>/g, '\n');

    // Remove remaining HTML tags
    markdown = markdown.replace(/<[^>]+>/g, '');

    // Clean up excessive newlines
    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    return markdown.trim();
  }

  // Don't render on server
  if (!isClient) {
    return (
      <Card className="h-full flex flex-col">
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-[var(--color-primary)]" />
          <h3 className="font-semibold">Editor de Documentos</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Export buttons */}
          <Button
            variant="outline"
            size="sm"
            onClick={exportAsMarkdown}
            disabled={isExporting}
          >
            <Download size={16} className="mr-1" />
            MD
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportAsWord}
            disabled={isExporting}
          >
            <Download size={16} className="mr-1" />
            {isExporting ? 'Exportando...' : 'DOCX'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportAsPDF}
            disabled={isExporting}
          >
            <Download size={16} className="mr-1" />
            PDF
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X size={20} />
            </Button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <div
          ref={editorRef}
          className="h-full"
          style={{
            '--quill-border-color': 'var(--color-border)',
          } as any}
        />
      </div>
    </Card>
  );
}
