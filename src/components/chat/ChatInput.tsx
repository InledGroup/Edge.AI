// ChatInput Component - Message input with auto-resize

import { useState, useRef, useEffect } from 'preact/hooks';
import { Send, Loader2, Globe, Sparkles, MessageCircle, FileSearchCorner, Mic, MicOff, Volume2, Image as ImageIcon, X, AlertTriangle, AudioWaveform, MoreHorizontal, Server, AppWindow } from 'lucide-preact';
import { Button } from '../ui/Button';
import { cn } from '@/lib/utils';
import { i18nStore, languageSignal } from '@/lib/stores/i18n';
import { uiStore, uiSignal, extensionsStore, extensionsSignal } from '@/lib/stores';
import { speechService, voiceState, isVoiceModeEnabled } from '@/lib/voice/speech-service';
import { getEnabledMCPServers } from '@/lib/db/mcp';
import type { MCPServer } from '@/types';

export interface ChatInputProps {
  onSend: (message: string, mode: 'web' | 'local' | 'smart' | 'conversation', images?: string[], activeTool?: { type: 'app' | 'mcp', id: string, name: string } | null) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  webSearchEnabled?: boolean;
  onWebSearchToggle?: (enabled: boolean) => void;
  supportsVision?: boolean;
}

export function ChatInput({
  onSend,
  disabled = false,
  loading = false,
  placeholder = i18nStore.t('chat.placeholder'),
  webSearchEnabled = false,
  onWebSearchToggle,
  supportsVision = true
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [mode, setMode] = useState<'web' | 'local' | 'smart' | 'conversation'>('conversation');
  const [showMenu, setShowMenu] = useState(false);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Subscribe to signals
  const lang = languageSignal.value;
  const vState = voiceState.value;
  const vMode = isVoiceModeEnabled.value;
  const showLiveMode = uiSignal.value.showLiveMode;
  const activeTool = extensionsSignal.value.activeTool;
  const customApps = extensionsSignal.value.customApps;
  
  // Incluimos apps nativas
  const builtInApps = [
    { id: 'inlinked', name: 'InLinked', iconUrl: 'https://hosted.inled.es/INLINKED.png' },
    { id: 'inqr', name: 'InQR', iconUrl: 'https://hosted.inled.es/inqr.png' }
  ];

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }

    // Autocomplete Logic
    if (message.startsWith('/') && !message.includes(' ') && !activeTool) {
      if (mcpServers.length === 0) {
        getEnabledMCPServers().then(setMcpServers);
      }
      setShowAutocomplete(true);
    } else {
      setShowAutocomplete(false);
    }
  }, [message, activeTool]);

  // Handle voice results
  useEffect(() => {
    // If Live Mode is active, do NOT interfere with speech service
    if (showLiveMode) return;

    // Si estamos en modo continuo, el speechService se encargará de reiniciar
    // Si solo estamos dictando, actualizamos el input
    if (vState === 'listening') {
      // El callback ya debería estar configurado si startListening se llamó correctamente
      // No volvemos a llamar a startListening() aquí para evitar bucles.
    }
  }, [vState, mode, onSend, selectedImage, showLiveMode, activeTool]);

  function handleSubmit(e: Event) {
    e.preventDefault();
    if ((message.trim() || selectedImage) && !disabled && !loading) {
      onSend(message.trim(), mode, selectedImage ? [selectedImage] : undefined, activeTool);
      setMessage('');
      setSelectedImage(null);
    }
  }

  function handleImageSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      // Check if it's an image
      if (!file.type.startsWith('image/')) {
        alert(i18nStore.t('chat.onlyImages'));
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setSelectedImage(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
    // Reset input so same file can be selected again
    input.value = '';
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
    
    // Remove active tool on Backspace if message is empty
    if (e.key === 'Backspace' && message === '' && activeTool) {
      extensionsStore.setActiveTool(null);
    }
  }

  function toggleDictation() {
    if (vState === 'listening') {
      speechService.stopListening();
    } else {
      // Si el modo continuo estaba activo, lo quitamos para dictado simple
      if (isVoiceModeEnabled.value) {
        isVoiceModeEnabled.value = false;
      }
      
      speechService.startListening((text) => {
        setMessage(prev => (prev + ' ' + text).trim());
        // Auto-stop after dictation if not in continuous mode
        if (!isVoiceModeEnabled.value) {
           speechService.stopListening();
        }
      });
    }
  }

  const mcpMatches = mcpServers.filter(s => 
    ('/' + s.name).toLowerCase().startsWith(message.toLowerCase())
  );
  
  const allApps = [...builtInApps, ...customApps];
  const appMatches = allApps.filter(app => 
    ('/' + app.name).toLowerCase().startsWith(message.toLowerCase())
  );

  return (
    <form onSubmit={handleSubmit} className="relative">
      {/* Autocomplete Popup */}
      {showAutocomplete && (mcpMatches.length > 0 || appMatches.length > 0) && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          {mcpMatches.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)]/50 border-b border-[var(--color-border)]">
                MCP Servers
              </div>
              {mcpMatches.map(server => (
                <button
                  key={server.id}
                  type="button"
                  onClick={() => {
                    setMessage('');
                    extensionsStore.setActiveTool({
                      type: 'mcp',
                      id: server.id,
                      name: server.name
                    });
                    setShowAutocomplete(false);
                    setTimeout(() => textareaRef.current?.focus(), 10);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] transition-colors text-left"
                >
                  <Server size={14} className="text-[var(--color-primary)]" />
                  <span>{server.name}</span>
                </button>
              ))}
            </>
          )}
          
          {appMatches.length > 0 && (
            <>
              <div className="px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-bg-tertiary)]/50 border-b border-[var(--color-border)] border-t first:border-t-0">
                Apps
              </div>
              {appMatches.map(app => (
                <button
                  key={(app as any).id}
                  type="button"
                  onClick={() => {
                    setMessage('');
                    extensionsStore.setActiveTool({
                      type: 'app',
                      id: (app as any).id,
                      name: (app as any).name,
                      icon: (app as any).iconUrl
                    });
                    setShowAutocomplete(false);
                    setTimeout(() => textareaRef.current?.focus(), 10);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] transition-colors text-left"
                >
                  {(app as any).iconUrl ? (
                    <img src={(app as any).iconUrl} className="w-3.5 h-3.5 object-contain" />
                  ) : (
                    <AppWindow size={14} className="text-[var(--color-primary)]" />
                  )}
                  <span>{(app as any).name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Mode indicator */}
      <div className="mb-2 px-3 py-1.5 rounded-lg flex items-center justify-between text-sm transition-all"
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
        <div className="flex items-center gap-2">
          {mode === 'conversation' && <><MessageCircle size={14} /><span>{i18nStore.t('chat.strategies.conversation')}</span></>}
          {mode === 'smart' && <><Sparkles size={14} /><span>{i18nStore.t('chat.strategies.smart')}</span></>}
          {mode === 'web' && <><Globe size={14} /><span>{i18nStore.t('chat.strategies.web')}</span></>}
          {mode === 'local' && <><span><FileSearchCorner size={14} /></span><span>{i18nStore.t('chat.strategies.local')}</span></>}
        </div>

        {/* Voice Mode Status */}
        {vMode && (
          <div className="flex items-center gap-1.5 text-xs font-medium animate-pulse text-[var(--color-primary)]">
            <Volume2 size={12} />
            <span>{i18nStore.t('chat.voiceModeActive')}</span>
          </div>
        )}
      </div>

      {/* Selected Image Preview */}
      {selectedImage && (
        <div className="mb-2 relative inline-block group">
          <img src={selectedImage} alt="Preview" className="h-20 w-auto rounded-lg border border-[var(--color-border)] object-cover" />
          <button
            type="button"
            onClick={() => setSelectedImage(null)}
            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600 transition-colors"
          >
            <X size={14} />
          </button>
          
          {!supportsVision && (
            <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center backdrop-blur-[1px]">
              <div className="text-xs text-white text-center px-1 font-medium flex flex-col items-center gap-1">
                <AlertTriangle size={16} className="text-amber-400" />
                <span>Modelo sin visión</span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="relative flex items-end gap-2 p-3 bg-[var(--color-bg-secondary)] rounded-2xl transition-all duration-200">
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*"
          onChange={handleImageSelect}
        />

        {/* Options Dropdown */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            disabled={disabled || loading}
            className={cn(
              'p-2 rounded-lg transition-all duration-200',
              'hover:bg-[var(--color-bg-hover)] active:scale-95',
              'text-[var(--color-text-secondary)]',
              showMenu && 'bg-[var(--color-bg-hover)] text-[var(--color-primary)]',
              (disabled || loading) && 'opacity-50 cursor-not-allowed'
            )}
            title={i18nStore.t('common.settings')}
          >
            <MoreHorizontal size={20} />
          </button>

          {/* Dropdown Menu */}
          {showMenu && (
            <div className="absolute bottom-full left-0 mb-2 w-64 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-200 p-1.5 flex flex-col gap-0.5">
              {/* Image Upload */}
              <button
                type="button"
                onClick={() => { fileInputRef.current?.click(); setShowMenu(false); }}
                disabled={disabled || loading || !supportsVision}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
                  'hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]',
                  (!supportsVision || disabled || loading) && 'opacity-50 cursor-not-allowed'
                )}
              >
                <ImageIcon size={18} />
                <div className="flex flex-col">
                  <span>{i18nStore.t('chat.uploadImage') || 'Subir imagen'}</span>
                  {!supportsVision && <span className="text-[10px] text-amber-500 font-medium">No soportado por el modelo</span>}
                </div>
              </button>

              <div className="h-[1px] bg-[var(--color-border)] my-1 mx-2" />

              {/* Strategy Modes */}
              <button
                type="button"
                onClick={() => { setModeAndNotify('conversation'); setShowMenu(false); }}
                disabled={disabled || loading}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
                  mode === 'conversation' 
                    ? 'bg-gray-500/10 text-gray-600 dark:text-gray-400' 
                    : 'hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                )}
              >
                <MessageCircle size={18} />
                <span>{i18nStore.t('chat.pureChat')}</span>
              </button>

              <button
                type="button"
                onClick={() => { setModeAndNotify('local'); setShowMenu(false); }}
                disabled={disabled || loading}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
                  mode === 'local' 
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                    : 'hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                )}
              >
                <FileSearchCorner size={18} />
                <span>{i18nStore.t('chat.localSearch')}</span>
              </button>

              <button
                type="button"
                onClick={() => { setModeAndNotify('web'); setShowMenu(false); }}
                disabled={disabled || loading}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
                  mode === 'web' 
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' 
                    : 'hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                )}
              >
                <Globe size={18} />
                <span>{i18nStore.t('chat.webSearch')}</span>
              </button>

              <div className="h-[1px] bg-[var(--color-border)] my-1 mx-2" />

              {/* Voice & Live features */}
              <button
                type="button"
                onClick={() => { speechService.toggleVoiceMode(); setShowMenu(false); }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
                  vMode 
                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500/20' 
                    : 'hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                )}
              >
                <Volume2 size={18} />
                <span>{i18nStore.t('chat.voiceModeContinuous')}</span>
              </button>

              <button
                type="button"
                onClick={() => { uiStore.toggleLiveMode(); setShowMenu(false); }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
                  'hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:text-blue-500'
                )}
              >
                <AudioWaveform size={18} />
                <span>{i18nStore.t('live.title')}</span>
              </button>

              <button
                type="button"
                onClick={() => { toggleDictation(); setShowMenu(false); }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors text-left',
                  vState === 'listening' && !vMode 
                    ? 'bg-red-500/10 text-red-600 animate-pulse' 
                    : 'hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                )}
              >
                {vState === 'listening' && !vMode ? <MicOff size={18} /> : <Mic size={18} />}
                <span>{i18nStore.t('chat.dictate')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Selected Tool Pill (Apps or MCPs) */}
        {activeTool && (
          <div className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-full text-xs font-semibold text-[var(--color-text)] animate-in zoom-in-95 duration-200 shadow-sm">
            {activeTool.type === 'mcp' ? (
              <Server size={12} className="text-[var(--color-primary)]" />
            ) : activeTool.icon ? (
              <img src={activeTool.icon} className="w-3.5 h-3.5 object-contain" />
            ) : (
              <AppWindow size={12} className="text-[var(--color-primary)]" />
            )}
            <span>{activeTool.name}</span>
            <button
              type="button"
              onClick={() => extensionsStore.setActiveTool(null)}
              className="ml-1 p-0.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors"
            >
              <X size={10} />
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={message}
          onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || loading}
          placeholder={vState === 'listening' ? i18nStore.t('chat.listening') : activeTool ? `Usar ${activeTool.name}...` : placeholder}
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
          disabled={(!message.trim() && !selectedImage) || disabled || loading}
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
