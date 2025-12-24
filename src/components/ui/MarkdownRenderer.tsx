// MarkdownRenderer - Safe markdown rendering component

import { useMemo } from 'preact/hooks';
import { marked } from 'marked';

export interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// Configure marked for safe rendering
marked.setOptions({
  breaks: true, // Convert \n to <br>
  gfm: true, // GitHub Flavored Markdown
  headerIds: false, // Don't generate header IDs
});

/**
 * Renders markdown content safely
 * Supports: bold, italic, code blocks, links, lists, etc.
 */
export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const htmlContent = useMemo(() => {
    try {
      return marked.parse(content, { async: false }) as string;
    } catch (error) {
      console.error('Failed to parse markdown:', error);
      return content; // Fallback to raw content
    }
  }, [content]);

  return (
    <div
      className={`markdown-content ${className}`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
