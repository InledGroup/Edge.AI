// Sidebar - ChatGPT-style sidebar with conversation history

import { useState, useEffect } from 'preact/hooks';
import {
  MessageSquare,
  Plus,
  Trash2,
  FileText,
  Menu,
  X,
  ChevronRight,
  Settings,
  Upload,
  Brain,
  Check,
  Languages,
  MessageCircle
} from 'lucide-preact';
import { conversationsStore, documentsStore, uiStore } from '@/lib/stores';
import { i18nStore, languageSignal } from '@/lib/stores/i18n';
import {
  createConversation,
  deleteConversation,
  getConversationsSorted,
  updateConversationTitle,
  generateTitle
} from '@/lib/db/conversations';
import type { Conversation } from '@/types';
import { ModelConfigMenu } from './ModelConfigMenu';

interface SidebarProps {
  onDocumentClick?: (documentId: string) => void;
  onShowDocumentUpload?: () => void;
  onShowModelWizard?: () => void;
}

export function Sidebar({ onDocumentClick, onShowDocumentUpload, onShowModelWizard }: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [showDocuments, setShowDocuments] = useState(false);

  // Subscribe to language changes for re-rendering
  const lang = languageSignal.value;

  function openFeedbackPopup() {
    // Only run on client-side to avoid SSR errors
    if (typeof window === 'undefined') return;

    const width = 640;
    const height = 800;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    window.open(
      'https://form.typeform.com/to/h0cyYt3d',
      'FeedbackEdgeAI',
      `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes`
    );
  }

  // Load conversations

  useEffect(() => {
    loadConversations();
  }, [conversationsStore.all.length]);

  async function loadConversations() {
    const sorted = await getConversationsSorted();
    setConversations(sorted);
  }

  async function handleNewChat() {
    const conversation = await createConversation(i18nStore.t('common.newConversation'));
    conversationsStore.add(conversation);
    conversationsStore.setActive(conversation.id);
    await loadConversations();
  }

  async function handleDeleteConversation(id: string, e: Event) {
    e.stopPropagation();

    if (!confirm(i18nStore.t('common.confirmDelete'))) {
      return;
    }

    await deleteConversation(id);
    conversationsStore.remove(id);
    await loadConversations();
  }

  function handleSelectConversation(id: string) {
    conversationsStore.setActive(id);
  }

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const diffInDays = diffInHours / 24;

    if (diffInHours < 24) {
      return i18nStore.t('common.today');
    } else if (diffInDays < 2) {
      return i18nStore.t('common.yesterday');
    } else if (diffInDays < 7) {
      return i18nStore.t('common.thisWeek');
    } else if (diffInDays < 30) {
      return i18nStore.t('common.thisMonth');
    } else {
      return date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { month: 'short', year: 'numeric' });
    }
  }

  // Group conversations by date
  const groupedConversations = conversations.reduce((groups, conv) => {
    const label = formatDate(conv.updatedAt);
    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(conv);
    return groups;
  }, {} as Record<string, Conversation[]>);

  const sidebarWidth = isOpen ? 'w-64' : 'w-0';

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] flex items-center justify-center hover:bg-[var(--color-bg-tertiary)] transition-colors"
        aria-label="Toggle sidebar"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] ${sidebarWidth} transition-all duration-300 ease-in-out overflow-hidden z-40 flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <a href={"/landing"}>
            <div className="flex items-center gap-2">
              <img src="/inledai.svg" width={28} height={28} />
              <span className="font-semibold text-sm">Edge.AI</span>
            </div>
          </a>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--color-primary)] text-black font-medium text-sm hover:bg-[var(--color-primary)]/90 transition-colors shadow-[0_0_20px_rgba(40,229,24,0.3)]"
          >
            <Plus size={18} />
            <span>{i18nStore.t('common.newConversation')}</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 px-3 pb-3 border-b border-[var(--color-border)]">
          <button
            onClick={() => setShowDocuments(false)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${!showDocuments
              ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]/50'
              }`}
          >
            <MessageSquare size={14} />
            <span>{i18nStore.t('common.conversations')}</span>
          </button>
          <button
            onClick={() => setShowDocuments(true)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${showDocuments
              ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text)]'
              : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]/50'
              }`}
          >
            <FileText size={14} />
            <span>{i18nStore.t('common.documents')} ({documentsStore.all.length})</span>
          </button>
        </div>

        {/* Conversations List */}
        {!showDocuments ? (
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {Object.keys(groupedConversations).length === 0 ? (
              <div className="text-center py-8 text-sm text-[var(--color-text-secondary)]">
                <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                <p>{i18nStore.t('common.noConversations')}</p>
                <p className="text-xs mt-1">{i18nStore.t('common.createToStart')}</p>
              </div>
            ) : (
              Object.entries(groupedConversations).map(([label, convs]) => (
                <div key={label} className="mb-4">
                  <div className="px-2 py-1 text-xs font-medium text-[var(--color-text-tertiary)]">
                    {label}
                  </div>
                  <div className="space-y-1">
                    {convs.map((conv) => (
                      <div
                        key={conv.id}
                        onClick={() => handleSelectConversation(conv.id)}
                        className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${conversationsStore.activeId === conv.id
                          ? 'bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]'
                          : 'hover:bg-[var(--color-bg-tertiary)]/50'
                          }`}
                      >
                        <MessageSquare size={14} className="flex-shrink-0 text-[var(--color-text-secondary)]" />
                        <span className="flex-1 text-sm truncate">
                          {conv.title}
                        </span>
                        <button
                          onClick={(e) => handleDeleteConversation(conv.id, e)}
                          className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-6 h-6 rounded-md hover:bg-[var(--color-error)]/20 flex items-center justify-center transition-all"
                          aria-label="Borrar conversación"
                        >
                          <Trash2 size={14} className="text-[var(--color-error)]" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Documents List */
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {documentsStore.all.length === 0 ? (
              <div className="text-center py-8 text-sm text-[var(--color-text-secondary)]">
                <FileText size={32} className="mx-auto mb-2 opacity-50" />
                <p>{i18nStore.t('common.noDocuments')}</p>
                <p className="text-xs mt-1">{i18nStore.t('common.uploadToStart')}</p>
              </div>
            ) : (
              <div className="space-y-1">
                {documentsStore.all.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => onDocumentClick?.(doc.id)}
                    className="group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-[var(--color-bg-tertiary)]/50 transition-all"
                  >
                    <FileText size={14} className="flex-shrink-0 text-[var(--color-text-secondary)]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{doc.name}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1">
                        {doc.status === 'ready' ? (
                          <>
                            <Check size={10} className="text-[var(--color-success)]" />
                            <span>{i18nStore.t('common.ready')}</span>
                          </>
                        ) : i18nStore.t('common.processing')}
                      </p>
                    </div>
                    <ChevronRight size={14} className="flex-shrink-0 text-[var(--color-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bottom Actions */}
        <div className="border-t border-[var(--color-border)] p-3 space-y-2">
          <button
            onClick={onShowDocumentUpload}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            <Upload size={16} />
            <span>{i18nStore.t('common.uploadDocuments')}</span>
          </button>

          <button
            onClick={openFeedbackPopup}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            <MessageCircle size={16} />
            <span>{i18nStore.t('common.feedback')}</span>
          </button>

          {/* Language Switcher */}
          <button
            onClick={() => i18nStore.setLanguage(lang === 'es' ? 'en' : 'es')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            <Languages size={16} />
            <span>{lang === 'es' ? 'English' : 'Español'}</span>
          </button>

          {/* Model Config Menu inline */}
          <div className="w-full">
            <ModelConfigMenu
              onOpenWizard={() => {
                onShowModelWizard?.();
              }}
            />
          </div>
        </div>
      </aside>
    </>
  );
}
