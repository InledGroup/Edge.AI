/**
 * WebSources Component
 *
 * Muestra las fuentes web consultadas para generar una respuesta,
 * con transparencia sobre el proceso local.
 */

import { ExternalLink, Globe } from 'lucide-preact';
import { cn } from '@/lib/utils';

export interface WebSource {
  title: string;
  url: string;
  wordCount?: number;
  score?: number; // Relevance score 0-1
}

/**
 * Remove aiproxy.inled.es from URLs for display
 */
function cleanProxyUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'aiproxy.inled.es') {
      const targetUrl = urlObj.searchParams.get('url');
      return targetUrl ? decodeURIComponent(targetUrl) : url;
    }
    return url;
  } catch {
    return url;
  }
}

export interface WebSourcesProps {
  sources: WebSource[];
  className?: string;
}

export function WebSources({ sources, className }: WebSourcesProps) {
  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className={cn('mt-4 space-y-2', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)]">
        <Globe size={14} />
        <span>Fuentes web consultadas</span>
      </div>

      {/* Sources list */}
      <div className="space-y-1.5">
        {sources.map((source, index) => {
          const cleanUrl = cleanProxyUrl(source.url);
          return (
            <a
              key={index}
              href={cleanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'group flex items-start gap-2 p-2.5 rounded-lg',
                'bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)]',
                'border border-[var(--color-border)]',
                'transition-all duration-200',
                'hover:scale-[1.02] active:scale-100'
              )}
            >
              {/* Index */}
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center text-xs font-medium text-blue-600 dark:text-blue-400">
                {index + 1}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--color-text)] line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {source.title}
                </div>
                <div className="mt-0.5 text-xs text-[var(--color-text-secondary)] truncate">
                  {new URL(cleanUrl).hostname}
                </div>
              {source.wordCount && (
                <div className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  {source.wordCount.toLocaleString()} palabras
                </div>
              )}
            </div>

            {/* External link icon */}
            <div className="flex-shrink-0 text-[var(--color-text-tertiary)] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              <ExternalLink size={14} />
            </div>

              {/* Relevance indicator (if score available) */}
              {source.score !== undefined && (
                <div className="absolute top-2 right-2 text-xs font-mono text-[var(--color-text-tertiary)]">
                  {(source.score * 100).toFixed(0)}%
                </div>
              )}
            </a>
          );
        })}
      </div>

      {/* Footer - transparency message */}
      <div className="flex items-start gap-2 px-3 py-2 bg-blue-500/5 border border-blue-500/20 rounded-lg">
        <div className="flex-shrink-0 mt-0.5">
          <Globe size={12} className="text-blue-600 dark:text-blue-400" />
        </div>
        <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
          <strong>Información analizada localmente.</strong> Todo el procesamiento se realizó
          en tu navegador. No se envió ningún dato a servidores externos.
        </p>
      </div>
    </div>
  );
}
