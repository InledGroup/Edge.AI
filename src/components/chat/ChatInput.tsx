// ChatInput Component - Message input with auto-resize

import { useState, useRef, useEffect } from 'preact/hooks';
import { Send, Loader2, Globe } from 'lucide-preact';
import { Button } from '../ui/Button';
import { cn } from '@/lib/utils';

export interface ChatInputProps {
  onSend: (message: string, useWebSearch?: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  webSearchEnabled?: boolean;
  onWebSearchToggle?: (enabled: boolean) => void;
}

export function ChatInput({
  onSend,
  disabled = false,
  loading = false,
  placeholder = 'Escribe tu pregunta...',
  webSearchEnabled = false,
  onWebSearchToggle
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [webSearchActive, setWebSearchActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [message]);

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (message.trim() && !disabled && !loading) {
      onSend(message.trim(), webSearchActive);
      setMessage('');
    }
  }

  function toggleWebSearch() {
    const newValue = !webSearchActive;
    setWebSearchActive(newValue);
    onWebSearchToggle?.(newValue);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      {/* Web search indicator */}
      {webSearchActive && (
        <div className="mb-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
          <Globe size={14} />
          <span>Búsqueda web activa</span>
        </div>
      )}

      <div className="relative flex items-end gap-2 p-3 bg-[var(--color-bg-secondary)] rounded-2xl transition-all duration-200">
        {/* Web search toggle button (if enabled) */}
        {webSearchEnabled && (
          <button
            type="button"
            onClick={toggleWebSearch}
            disabled={disabled || loading}
            className={cn(
              'flex-shrink-0 p-2 rounded-lg transition-all duration-200',
              'hover:bg-[var(--color-bg-hover)] active:scale-95',
              webSearchActive
                ? 'text-blue-600 dark:text-blue-400 bg-blue-500/10'
                : 'text-[var(--color-text-secondary)]',
              (disabled || loading) && 'opacity-50 cursor-not-allowed'
            )}
            title={webSearchActive ? 'Desactivar búsqueda web' : 'Activar búsqueda web'}
          >
            <Globe size={20} />
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={message}
          onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || loading}
          placeholder={placeholder}
          rows={1}
          className={cn(
            'flex-1 bg-transparent text-[var(--color-text)]',
            'resize-none outline-none border-none',
            'text-sm leading-relaxed',
            'min-h-[24px] max-h-[200px]'
          )}
          style={{ scrollbarWidth: 'thin' }}
        />

        <Button
          type="submit"
          size="icon"
          variant="primary"
          disabled={!message.trim() || disabled || loading}
          className="flex-shrink-0"
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </Button>
      </div>
    </form>
  );
}
