// Message Component - Individual chat message

import { User, Bot, FileText, Copy, FileEdit, Volume2, VolumeX, Linkedin, QrCode, Globe, AppWindow, Zap, AlertCircle, X, CheckCircle, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-preact';
import { useState } from 'preact/hooks';
import type { Message as MessageType } from '@/types';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { WebSources } from './WebSources';
import type { WebSource } from './WebSources';
import { Button } from '../ui/Button';
import { speechService, voiceState } from '@/lib/voice/speech-service';
import { i18nStore, languageSignal } from '@/lib/stores/i18n';
import { extensionsStore, extensionsSignal } from '@/lib/stores';
import { generateInLinkedUrl, generateInQRUrl, isUrl } from '@/lib/insuite-utils';
import { updateChunkRelevance, getChunkVote } from '@/lib/db/relevance';
import { useEffect } from 'preact/hooks';

/**
 * Quality Indicator Component
 */
function QualityIndicator({ quality, score }: { quality?: string, score?: number }) {
  if (!quality) return null;

  const config = {
    excellent: { color: 'text-green-500', bg: 'bg-green-500/10', label: 'Excelente', icon: CheckCircle },
    good: { color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Buena', icon: CheckCircle },
    fair: { color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Regular', icon: AlertCircle },
    poor: { color: 'text-red-500', bg: 'bg-red-500/10', label: 'Baja', icon: AlertCircle },
  }[quality as any] || { color: 'text-gray-500', bg: 'bg-gray-500/10', label: quality, icon: Zap };

  const showWarning = quality === 'poor' || quality === 'fair';

  return (
    <div className="flex flex-col gap-2">
      <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit", config.bg, config.color)}>
        <config.icon size={12} />
        <span>Calidad RAG: {config.label}</span>
        {typeof score === 'number' && !isNaN(score) && (
          <span className="opacity-60 ml-1">({(score * 100).toFixed(0)}% precisión)</span>
        )}
      </div>
      {showWarning && (
        <div className="text-[10px] text-red-400/80 italic px-1 flex items-center gap-1">
          <AlertCircle size={10} />
          <span>Sugerencia: Añade más contexto, pregunta de nuevo o <a href="#" onClick={(e) => { e.preventDefault(); window.open('https://form.typeform.com/to/h0cyYt3d', '_blank'); }} className="underline hover:text-red-400 transition-colors">comparte feedback con Inled</a> para mejorar.</span>
        </div>
      )}
    </div>
  );
}

/**
 * Modal para visualizar el contenido completo del chunk
 */
function ChunkPreviewModal({ id, content, docName, score, onClose }: { id: string, content: string, docName: string, score: number, onClose: () => void }) {
  const [voted, setVoted] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (id) {
      getChunkVote(id).then(setVoted);
    }
  }, [id]);

  const handleVote = async (type: 'up' | 'down') => {
    setVoted(type);
    await updateChunkRelevance(id, type);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center">
              <FileText size={16} className="text-[var(--color-primary)]" />
            </div>
            <div>
              <h3 className="text-sm font-bold truncate max-w-[300px]">{docName}</h3>
              <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-widest font-bold">Fragmento del Documento • {(score * 100).toFixed(1)}% relevancia</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[var(--color-bg-tertiary)] rounded-lg p-1 mr-2 border border-[var(--color-border)]">
              <button 
                onClick={() => handleVote('up')}
                className={cn("p-1.5 rounded-md transition-colors", voted === 'up' ? "bg-green-500/20 text-green-500" : "hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]")}
                title="Este fragmento es útil"
              >
                <ThumbsUp size={14} />
              </button>
              <button 
                onClick={() => handleVote('down')}
                className={cn("p-1.5 rounded-md transition-colors", voted === 'down' ? "bg-red-500/20 text-red-500" : "hover:bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]")}
                title="Este fragmento NO es útil"
              >
                <ThumbsDown size={14} />
              </button>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar bg-[var(--color-bg-tertiary)]/30 text-left">
          <div className="prose prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap font-mono opacity-90">
            {content}
          </div>
        </div>
        <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-center text-[10px] text-[var(--color-text-tertiary)]">
          {voted ? "¡Gracias por tu feedback! El sistema aprenderá de esta valoración." : "Vota este fragmento para que el sistema aprenda su importancia real."}
        </div>
      </div>
    </div>
  );
}

export interface MessageProps {
  message: MessageType;
  onOpenInCanvas?: (content: string) => void;
  onRegenerate?: () => void;
}

export function Message({ message, onOpenInCanvas, onRegenerate }: MessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [previewChunk, setPreviewChunk] = useState<{ id: string, content: string, docName: string, score: number } | null>(null);
  const vState = voiceState.value;
  const lang = languageSignal.value;

  // Detectar si hay un appId o mcpServerId en los metadatos (para mensajes de usuario)
  const appId = message.metadata?.appId;
  const mcpId = message.metadata?.mcpServerId;
  
  const builtInApps = [
    { id: 'inlinked', name: 'InLinked', iconUrl: 'https://hosted.inled.es/INLINKED.png' },
    { id: 'inqr', name: 'InQR', iconUrl: 'https://hosted.inled.es/inqr.png' }
  ];

  const app = appId ? (extensionsSignal.value.customApps.find(a => a.id === appId) || builtInApps.find(a => a.id === appId)) : null;
  const mcpName = mcpId ? 'MCP' : null; // Podríamos buscar el nombre real si fuera necesario

  // Detectar si hay fuentes web (metadata con webSources)
  const webSources = (message as any).metadata?.webSources as WebSource[] | undefined;
  const hasWebSources = webSources && webSources.length > 0;

  // Fuentes RAG regulares (documentos locales)
  const hasLocalSources = message.sources && message.sources.length > 0;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }

  function handleOpenInCanvas() {
    if (onOpenInCanvas) {
      onOpenInCanvas(message.content);
    }
  }

  function handleSpeak() {
    if (vState === 'speaking') {
      speechService.stopSpeaking();
    } else {
      speechService.speak(message.content);
    }
  }

  function handleInLinked() {
    const url = generateInLinkedUrl(message.content);
    extensionsStore.open('inlinked', url);
  }

  function handleInQR() {
    const content = message.content.trim();
    const type = isUrl(content) ? 'text' : 'text'; // Simplified for now
    const url = generateInQRUrl({ type, value: content });
    extensionsStore.open('inqr', url);
  }

  function handleCustomAppClick(appId: string, exampleUrl: string) {
    let url = exampleUrl;
    if (url.includes('{{text}}')) {
      url = url.replace('{{text}}', encodeURIComponent(message.content));
    } else if (url.includes('{{url}}') && isUrl(message.content)) {
      url = url.replace('{{url}}', encodeURIComponent(message.content));
    }
    extensionsStore.open(appId, url);
  }

  return (
    <div
      className={cn(
        'flex gap-3 group animate-slideUp',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center shadow-[0_0_15px_rgba(40,229,24,0.3)]">
          <Bot size={18} color="black" />
        </div>
      )}

      <div className={cn('flex flex-col gap-1 max-w-[80%]', isUser && 'items-end')}>
        
        {/* Images attached to the message */}
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-1 justify-end">
            {message.images.map((img, idx) => (
              <img 
                key={idx}
                src={img} 
                alt="Uploaded" 
                className="max-w-[200px] max-h-[200px] rounded-lg border border-[var(--color-border)] object-cover bg-black/5"
              />
            ))}
          </div>
        )}

        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm',
            'transition-all duration-200',
            isUser
              ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_0_15px_rgba(40,229,24,0.2)]'
              : 'bg-[var(--color-bg-secondary)] text-[var(--color-text)] border border-[var(--color-border)]'
          )}
        >
          {isUser ? (
            <div className="flex flex-col gap-2">
              {app && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-black/10 rounded-full text-[10px] font-bold w-fit">
                  {app.iconUrl ? (
                    <img src={app.iconUrl} className="w-3 h-3 object-contain" />
                  ) : (
                    <AppWindow size={10} />
                  )}
                  <span>{app.name}</span>
                </div>
              )}
              {mcpId && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-black/10 rounded-full text-[10px] font-bold w-fit">
                  <Server size={10} />
                  <span>MCP</span>
                </div>
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-left">
              <MarkdownRenderer content={message.content} className="leading-relaxed" />
              {/* Quality Indicator below the text */}
              {!isUser && message.metadata?.ragQuality && (
                <QualityIndicator quality={message.metadata.ragQuality} score={message.metadata.faithfulness} />
              )}
            </div>
          )}
        </div>

        {/* Web sources (if web search was used) */}
        {!isUser && hasWebSources && (
          <WebSources sources={webSources!} className="px-2" />
        )}

        {/* Local document sources (if RAG was used) */}
        {!isUser && hasLocalSources && !hasWebSources && (
          <div className="flex flex-col gap-1 mt-1">
            <span className="text-xs text-[var(--color-text-tertiary)] px-2">
              {message.sources!.length} {message.sources!.length > 1 ? i18nStore.t('message.sources') : i18nStore.t('message.source')}
            </span>
            <div className="flex flex-wrap gap-1">
              {message.sources!.map((source, idx) => (
                <div
                  key={idx}
                  onClick={() => setPreviewChunk({ 
                    id: source.chunk.id,
                    content: source.chunk.metadata?.expandedContext || source.chunk.content, 
                    docName: source.document.name, 
                    score: source.score 
                  })}
                  className="text-xs px-2 py-1 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-md border border-[var(--color-border)] flex items-center gap-1.5 hover:border-[var(--color-primary)] transition-colors cursor-pointer group/source"
                  title="Ver fragmento original"
                >
                  <FileText size={12} className="group-hover/source:text-[var(--color-primary)]" />
                  <span className="truncate max-w-[120px]">
                    {source.document.name}
                  </span>
                  <span className="text-[var(--color-primary)] font-bold">
                    {(source.score * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <span className="text-xs text-[var(--color-text-tertiary)] px-2">
          {new Date(message.timestamp).toLocaleTimeString(lang === 'en' ? 'en-US' : 'es-ES', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>

        {/* Action buttons for assistant messages */}
        {!isUser && (
          <div className="flex flex-wrap items-center gap-2 px-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSpeak}
              className="h-7 px-2 text-xs"
              title={vState === 'speaking' ? i18nStore.t('message.stop') : i18nStore.t('message.listen')}
            >
              {vState === 'speaking' ? <VolumeX size={14} className="mr-1" /> : <Volume2 size={14} className="mr-1" />}
              {vState === 'speaking' ? i18nStore.t('message.stop') : i18nStore.t('message.listen')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 px-2 text-xs"
            >
              <Copy size={14} className="mr-1" />
              {copied ? i18nStore.t('message.copied') : i18nStore.t('message.copy')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenInCanvas}
              className="h-7 px-2 text-xs"
            >
              <FileEdit size={14} className="mr-1" />
              {i18nStore.t('message.openCanvas')}
            </Button>

            {!isUser && onRegenerate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRegenerate}
                className="h-7 px-2 text-xs"
                title="Regenerar respuesta"
              >
                <RefreshCw size={14} className="mr-1" />
                Regenerar
              </Button>
            )}

            {/* Extension Buttons */}
            <div className="h-4 w-[1px] bg-[var(--color-border)] mx-1" />
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleInLinked}
              className="h-7 px-2 text-xs hover:text-[#0077b5]"
              title={i18nStore.t('apps.sendToInLinked')}
            >
              <img src="https://hosted.inled.es/INLINKED.png" className="w-3.5 h-3.5 mr-1" />
              InLinked
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleInQR}
              className="h-7 px-2 text-xs hover:text-[var(--color-primary)]"
              title={i18nStore.t('apps.sendToInQR')}
            >
              <img src="https://hosted.inled.es/inqr.png" className="w-3.5 h-3.5 mr-1" />
              InQR
            </Button>

            {/* Custom Apps Buttons */}
            {extensionsStore.customApps.map(app => (
              <Button
                key={app.id}
                variant="ghost"
                size="sm"
                onClick={() => handleCustomAppClick(app.id, app.exampleUrl || app.url)}
                className="h-7 px-2 text-xs"
                title={app.name}
              >
                {app.iconUrl ? (
                  <img src={app.iconUrl} className="w-3.5 h-3.5 mr-1" />
                ) : (
                  <Globe size={14} className="mr-1" />
                )}
                {app.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-bg-tertiary)] flex items-center justify-center border border-[var(--color-border)]">
          <User size={18} />
        </div>
      )}

      {/* Chunk Preview Modal */}
      {previewChunk && (
        <ChunkPreviewModal 
          {...previewChunk} 
          onClose={() => setPreviewChunk(null)} 
        />
      )}
    </div>
  );
}