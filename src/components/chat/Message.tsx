// Message Component - Individual chat message

import { User, Bot, FileText, Copy, FileEdit, Volume2, VolumeX, Linkedin, QrCode } from 'lucide-preact';
import { useState } from 'preact/hooks';
import type { Message as MessageType } from '@/types';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { WebSources } from './WebSources';
import type { WebSource } from './WebSources';
import { Button } from '../ui/Button';
import { speechService, voiceState } from '@/lib/voice/speech-service';
import { i18nStore, languageSignal } from '@/lib/stores/i18n';
import { extensionsStore } from '@/lib/stores';
import { generateInLinkedUrl, generateInQRUrl, isUrl } from '@/lib/insuite-utils';

export interface MessageProps {
  message: MessageType;
  onOpenInCanvas?: (content: string) => void;
}

export function Message({ message, onOpenInCanvas }: MessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const vState = voiceState.value;
  const lang = languageSignal.value;

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
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
            <MarkdownRenderer content={message.content} className="leading-relaxed" />
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
                  className="text-xs px-2 py-1 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-md border border-[var(--color-border)] flex items-center gap-1.5 hover:border-[var(--color-primary)] transition-colors"
                  title={source.chunk.content.substring(0, 100)}
                >
                  <FileText size={12} />
                  <span className="truncate max-w-[120px]">
                    {source.document.name}
                  </span>
                  <span className="text-[var(--color-primary)]">
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
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-bg-tertiary)] flex items-center justify-center border border-[var(--color-border)]">
          <User size={18} />
        </div>
      )}
    </div>
  );
}