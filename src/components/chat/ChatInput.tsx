// ChatInput Component - Message input with auto-resize

import { useState, useRef, useEffect } from 'preact/hooks';
import { Send, Loader2, Globe, Sparkles, MessageCircle, FileSearchCorner } from 'lucide-preact';
import { Button } from '../ui/Button';
import { cn } from '@/lib/utils';

export interface ChatInputProps {
  onSend: (message: string, mode: 'web' | 'local' | 'smart' | 'conversation') => void;
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
  const [mode, setMode] = useState<'web' | 'local' | 'smart' | 'conversation'>('conversation');
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
      onSend(message.trim(), mode);
      setMessage('');
    }
  }

  function setModeAndNotify(newMode: typeof mode) {
    setMode(newMode);
    if (newMode === 'web') {
      onWebSearchToggle?.(true);
    } else {
      onWebSearchToggle?.(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      {/* Mode indicator */}
      <div className="mb-2 px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm transition-all"
        style={{
          backgroundColor: mode === 'conversation' ? 'var(--color-bg-secondary)' :
                          mode === 'smart' ? 'rgb(168 85 247 / 0.1)' :
                          mode === 'web' ? 'rgb(59 130 246 / 0.1)' :
                          'rgb(34 197 94 / 0.1)',
          borderColor: mode === 'conversation' ? 'var(--color-border)' :
                       mode === 'smart' ? 'rgb(168 85 247 / 0.3)' :
                       mode === 'web' ? 'rgb(59 130 246 / 0.3)' :
                       'rgb(34 197 94 / 0.3)',
          color: mode === 'conversation' ? 'var(--color-text-secondary)' :
                 mode === 'smart' ? 'rgb(168 85 247)' :
                 mode === 'web' ? 'rgb(59 130 246)' :
                 'rgb(34 197 94)',
          borderWidth: '1px',
          borderStyle: 'solid'
        }}
      >
        {mode === 'conversation' && <><MessageCircle size={14} /><span>Conversación pura - Sin RAG ni búsqueda</span></>}
        {mode === 'smart' && <><Sparkles size={14} /><span>Modo inteligente - IA decide estrategia</span></>}
        {mode === 'web' && <><Globe size={14} /><span>Búsqueda web activa</span></>}
        {mode === 'local' && <><span><FileSearchCorner size={14} /></span><span>Búsqueda en documentos locales</span></>}
      </div>

      <div className="relative flex items-end gap-2 p-3 bg-[var(--color-bg-secondary)] rounded-2xl transition-all duration-200">
        {/* Conversation mode button */}
        <button
          type="button"
          onClick={() => setModeAndNotify('conversation')}
          disabled={disabled || loading}
          className={cn(
            'flex-shrink-0 p-2 rounded-lg transition-all duration-200',
            'hover:bg-[var(--color-bg-hover)] active:scale-95',
            mode === 'conversation'
              ? 'text-gray-600 dark:text-gray-400 bg-gray-500/10'
              : 'text-[var(--color-text-secondary)]',
            (disabled || loading) && 'opacity-50 cursor-not-allowed'
          )}
          title="Modo conversacional puro"
        >
          <MessageCircle size={20} />
        </button>

        {/* Local RAG button */}
        <button
          type="button"
          onClick={() => setModeAndNotify('local')}
          disabled={disabled || loading}
          className={cn(
            'flex-shrink-0 p-2 rounded-lg transition-all duration-200',
            'hover:bg-[var(--color-bg-hover)] active:scale-95',
            mode === 'local'
              ? 'text-green-600 dark:text-green-400 bg-green-500/10'
              : 'text-[var(--color-text-secondary)]',
            (disabled || loading) && 'opacity-50 cursor-not-allowed'
          )}
          title="Búsqueda en documentos"
        >
          <span className="text-lg"><FileSearchCorner size={20} /></span>
        </button>

        {/* Web search button */}
        <button
          type="button"
          onClick={() => setModeAndNotify('web')}
          disabled={disabled || loading}
          className={cn(
            'flex-shrink-0 p-2 rounded-lg transition-all duration-200',
            'hover:bg-[var(--color-bg-hover)] active:scale-95',
            mode === 'web'
              ? 'text-blue-600 dark:text-blue-400 bg-blue-500/10'
              : 'text-[var(--color-text-secondary)]',
            (disabled || loading) && 'opacity-50 cursor-not-allowed'
          )}
          title="Búsqueda web"
        >
          <Globe size={20} />
        </button>

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
