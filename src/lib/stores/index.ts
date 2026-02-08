// Global State - Preact Signals for reactive state management
// Single source of truth for the entire application

import { signal, computed } from '@preact/signals';
import type { Document, Conversation, ModelConfig, ProcessingStatus } from '@/types';

// ============================================================================
// Documents Store
// ============================================================================

export const documentsSignal = signal<Document[]>([]);

export const documentsStore = {
  get all() {
    return documentsSignal.value;
  },

  get ready() {
    return documentsSignal.value.filter(doc => doc.status === 'ready');
  },

  get processing() {
    return documentsSignal.value.filter(doc => doc.status === 'processing');
  },

  add(document: Document) {
    documentsSignal.value = [...documentsSignal.value, document];
  },

  update(id: string, updates: Partial<Document>) {
    documentsSignal.value = documentsSignal.value.map(doc =>
      doc.id === id ? { ...doc, ...updates } : doc
    );
  },

  remove(id: string) {
    documentsSignal.value = documentsSignal.value.filter(doc => doc.id !== id);
  },

  set(documents: Document[]) {
    documentsSignal.value = documents;
  },

  clear() {
    documentsSignal.value = [];
  }
};

// ============================================================================
// Models Store
// ============================================================================

interface ModelsState {
  chat: ModelConfig | null;
  embedding: ModelConfig | null;
  chatLoading: boolean;
  embeddingLoading: boolean;
}

export const modelsSignal = signal<ModelsState>({
  chat: null,
  embedding: null,
  chatLoading: false,
  embeddingLoading: false
});

export const modelsStore = {
  get chat() {
    return modelsSignal.value.chat;
  },

  get embedding() {
    return modelsSignal.value.embedding;
  },

  get chatLoading() {
    return modelsSignal.value.chatLoading;
  },

  get embeddingLoading() {
    return modelsSignal.value.embeddingLoading;
  },

  setChatModel(model: ModelConfig | null) {
    modelsSignal.value = { ...modelsSignal.value, chat: model };
  },

  setEmbeddingModel(model: ModelConfig | null) {
    modelsSignal.value = { ...modelsSignal.value, embedding: model };
  },

  setChatLoading(loading: boolean) {
    modelsSignal.value = { ...modelsSignal.value, chatLoading: loading };
  },

  setEmbeddingLoading(loading: boolean) {
    modelsSignal.value = { ...modelsSignal.value, embeddingLoading: loading };
  }
};

// Computed: Are models ready?
export const modelsReady = computed(() => {
  const state = modelsSignal.value;
  return state.chat !== null && state.embedding !== null;
});

// ============================================================================
// Conversations Store
// ============================================================================

export const conversationsSignal = signal<Conversation[]>([]);
export const activeConversationIdSignal = signal<string | null>(null);

export const conversationsStore = {
  get all() {
    return conversationsSignal.value;
  },

  get active() {
    const id = activeConversationIdSignal.value;
    if (!id) return null;
    return conversationsSignal.value.find(c => c.id === id) || null;
  },

  get activeId() {
    return activeConversationIdSignal.value;
  },

  add(conversation: Conversation) {
    conversationsSignal.value = [...conversationsSignal.value, conversation];
  },

  update(id: string, updates: Partial<Conversation>) {
    conversationsSignal.value = conversationsSignal.value.map(conv =>
      conv.id === id ? { ...conv, ...updates, updatedAt: Date.now() } : conv
    );
  },

  remove(id: string) {
    conversationsSignal.value = conversationsSignal.value.filter(c => c.id !== id);
    if (activeConversationIdSignal.value === id) {
      activeConversationIdSignal.value = null;
    }
  },

  setActive(id: string | null) {
    activeConversationIdSignal.value = id;
  },

  set(conversations: Conversation[]) {
    conversationsSignal.value = conversations;
  },

  clear() {
    conversationsSignal.value = [];
    activeConversationIdSignal.value = null;
  }
};

// ============================================================================
// Processing Store (for UI feedback)
// ============================================================================

export const processingSignal = signal<ProcessingStatus | null>(null);

export const processingStore = {
  get current() {
    return processingSignal.value;
  },

  get isProcessing() {
    return processingSignal.value !== null;
  },

  set(status: ProcessingStatus | null) {
    processingSignal.value = status;
  },

  clear() {
    processingSignal.value = null;
  }
};

// ============================================================================
// UI Store
// ============================================================================

interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'auto';
  showSettings: boolean;
  showLiveMode: boolean;
}

export const uiSignal = signal<UIState>({
  sidebarOpen: true,
  theme: 'auto',
  showSettings: false,
  showLiveMode: false
});

export const uiStore = {
  get sidebarOpen() {
    return uiSignal.value.sidebarOpen;
  },

  get theme() {
    return uiSignal.value.theme;
  },

  get showSettings() {
    return uiSignal.value.showSettings;
  },

  get showLiveMode() {
    return uiSignal.value.showLiveMode;
  },

  toggleSidebar() {
    uiSignal.value = {
      ...uiSignal.value,
      sidebarOpen: !uiSignal.value.sidebarOpen
    };
  },

  setTheme(theme: 'light' | 'dark' | 'auto') {
    uiSignal.value = { ...uiSignal.value, theme };

    // Apply theme to document
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  },

  toggleSettings() {
    uiSignal.value = {
      ...uiSignal.value,
      showSettings: !uiSignal.value.showSettings
    };
  },

  toggleLiveMode() {
    uiSignal.value = {
      ...uiSignal.value,
      showLiveMode: !uiSignal.value.showLiveMode
    };
  }
};

// ============================================================================
// Canvas Store (Right Sidebar)
// ============================================================================

interface CanvasState {
  isOpen: boolean;
  content: string;
}

export const canvasSignal = signal<CanvasState>({
  isOpen: false,
  content: ''
});

export const canvasStore = {
  get isOpen() {
    return canvasSignal.value.isOpen;
  },

  get content() {
    return canvasSignal.value.content;
  },

  open(content?: string) {
    canvasSignal.value = {
      isOpen: true,
      content: content !== undefined ? content : canvasSignal.value.content
    };
  },

  close() {
    canvasSignal.value = {
      ...canvasSignal.value,
      isOpen: false
    };
  },

  toggle() {
    canvasSignal.value = {
      ...canvasSignal.value,
      isOpen: !canvasSignal.value.isOpen
    };
  },

  setContent(content: string) {
    // console.log('📝 Canvas Store Update:', content.substring(0, 50));
    canvasSignal.value = {
      ...canvasSignal.value,
      content
    };
  }
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize stores from IndexedDB
 * Call this on app startup
 */
export async function initializeStores() {
  try {
    // Import DB functions (dynamic to avoid SSR issues)
    const { getAllDocuments } = await import('@/lib/db/documents');
    const { getConversationsSorted } = await import('@/lib/db/conversations');
    const { getSetting } = await import('@/lib/db/settings');
    const { i18nStore } = await import('@/lib/stores/i18n');
    const { mcpManager } = await import('@/lib/ai/mcp-manager');

    // Initialize language
    await i18nStore.init();

    // Initialize MCP Manager
    await mcpManager.initialize();

    // Load documents
    const documents = await getAllDocuments();
    documentsStore.set(documents);

    // Load conversations
    const conversations = await getConversationsSorted();
    conversationsStore.set(conversations);

    // Load theme preference
    const theme = await getSetting('theme');
    if (theme) {
      uiStore.setTheme(theme);
    }

    console.log('✅ Stores initialized');
  } catch (error) {
    console.error('❌ Failed to initialize stores:', error);
  }
}

// ============================================================================
// Computed Values
// ============================================================================

export const hasDocuments = computed(() => {
  return documentsSignal.value.length > 0;
});

export const hasReadyDocuments = computed(() => {
  return documentsSignal.value.some(doc => doc.status === 'ready');
});

export const canChat = computed(() => {
  return modelsReady.value && hasReadyDocuments.value;
});
