/* empty css                                 */
import { c as createComponent, r as renderHead, a as renderComponent, b as renderTemplate } from '../chunks/astro/server_BtO_ChDG.mjs';
import 'kleur/colors';
import 'html-escaper';
import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { X, Menu, Plus, MessageSquare, FileText, Trash2, Check, ChevronRight, Upload, Brain, Globe, ExternalLink, Bot, User, MessageCircle, Sparkles, FileSearchCorner, Loader2, Send, Search, Cpu, Download, AlertCircle, Zap, CheckCircle2, UploadCloud } from 'lucide-preact';
import { signal, computed } from '@preact/signals';
import { openDB } from 'idb';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsxs, Fragment, jsx } from 'preact/jsx-runtime';
import { marked as marked$1 } from 'marked';
import 'preact';
import Quill from 'quill';
/* empty css                                 */
import { saveAs } from 'file-saver';
import htmlDocx from 'html-docx-js/dist/html-docx.js';
import * as webllm from '@mlc-ai/web-llm';
export { renderers } from '../renderers.mjs';

const documentsSignal = signal([]);
const documentsStore = {
  get all() {
    return documentsSignal.value;
  },
  get ready() {
    return documentsSignal.value.filter((doc) => doc.status === "ready");
  },
  get processing() {
    return documentsSignal.value.filter((doc) => doc.status === "processing");
  },
  add(document2) {
    documentsSignal.value = [...documentsSignal.value, document2];
  },
  update(id, updates) {
    documentsSignal.value = documentsSignal.value.map((doc) => doc.id === id ? {
      ...doc,
      ...updates
    } : doc);
  },
  remove(id) {
    documentsSignal.value = documentsSignal.value.filter((doc) => doc.id !== id);
  },
  set(documents) {
    documentsSignal.value = documents;
  },
  clear() {
    documentsSignal.value = [];
  }
};
const modelsSignal = signal({
  chat: null,
  embedding: null,
  chatLoading: false,
  embeddingLoading: false
});
const modelsStore = {
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
  setChatModel(model) {
    modelsSignal.value = {
      ...modelsSignal.value,
      chat: model
    };
  },
  setEmbeddingModel(model) {
    modelsSignal.value = {
      ...modelsSignal.value,
      embedding: model
    };
  },
  setChatLoading(loading) {
    modelsSignal.value = {
      ...modelsSignal.value,
      chatLoading: loading
    };
  },
  setEmbeddingLoading(loading) {
    modelsSignal.value = {
      ...modelsSignal.value,
      embeddingLoading: loading
    };
  }
};
const modelsReady = computed(() => {
  const state = modelsSignal.value;
  return state.chat !== null && state.embedding !== null;
});
const conversationsSignal = signal([]);
const activeConversationIdSignal = signal(null);
const conversationsStore = {
  get all() {
    return conversationsSignal.value;
  },
  get active() {
    const id = activeConversationIdSignal.value;
    if (!id) return null;
    return conversationsSignal.value.find((c) => c.id === id) || null;
  },
  get activeId() {
    return activeConversationIdSignal.value;
  },
  add(conversation) {
    conversationsSignal.value = [...conversationsSignal.value, conversation];
  },
  update(id, updates) {
    conversationsSignal.value = conversationsSignal.value.map((conv) => conv.id === id ? {
      ...conv,
      ...updates,
      updatedAt: Date.now()
    } : conv);
  },
  remove(id) {
    conversationsSignal.value = conversationsSignal.value.filter((c) => c.id !== id);
    if (activeConversationIdSignal.value === id) {
      activeConversationIdSignal.value = null;
    }
  },
  setActive(id) {
    activeConversationIdSignal.value = id;
  },
  set(conversations) {
    conversationsSignal.value = conversations;
  },
  clear() {
    conversationsSignal.value = [];
    activeConversationIdSignal.value = null;
  }
};
const processingSignal = signal(null);
const processingStore = {
  get current() {
    return processingSignal.value;
  },
  get isProcessing() {
    return processingSignal.value !== null;
  },
  set(status) {
    processingSignal.value = status;
  },
  clear() {
    processingSignal.value = null;
  }
};
signal({
  sidebarOpen: true,
  theme: "auto",
  showSettings: false
});
computed(() => {
  return documentsSignal.value.length > 0;
});
const hasReadyDocuments = computed(() => {
  return documentsSignal.value.some((doc) => doc.status === "ready");
});
computed(() => {
  return modelsReady.value && hasReadyDocuments.value;
});

const DB_NAME = "edge-ai-db";
const DB_VERSION = 1;
let dbInstance = null;
async function getDB() {
  if (dbInstance) {
    return dbInstance;
  }
  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      console.log(`Upgrading DB from version ${oldVersion} to ${newVersion}`);
      if (!db.objectStoreNames.contains("documents")) {
        const documentsStore = db.createObjectStore("documents", {
          keyPath: "id"
        });
        documentsStore.createIndex("by-status", "status");
        documentsStore.createIndex("by-uploaded", "uploadedAt");
      }
      if (!db.objectStoreNames.contains("chunks")) {
        const chunksStore = db.createObjectStore("chunks", {
          keyPath: "id"
        });
        chunksStore.createIndex("by-document", "documentId");
        chunksStore.createIndex("by-index", "index");
      }
      if (!db.objectStoreNames.contains("embeddings")) {
        const embeddingsStore = db.createObjectStore("embeddings", {
          keyPath: "id"
        });
        embeddingsStore.createIndex("by-chunk", "chunkId");
        embeddingsStore.createIndex("by-document", "documentId");
        embeddingsStore.createIndex("by-model", "model");
      }
      if (!db.objectStoreNames.contains("conversations")) {
        const conversationsStore = db.createObjectStore("conversations", {
          keyPath: "id"
        });
        conversationsStore.createIndex("by-updated", "updatedAt");
        conversationsStore.createIndex("by-created", "createdAt");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
    },
    blocked() {
      console.warn("DB upgrade blocked - close other tabs");
    },
    blocking() {
      console.warn("DB blocking a newer version");
      dbInstance?.close();
      dbInstance = null;
    },
    terminated() {
      console.error("DB connection terminated unexpectedly");
      dbInstance = null;
    }
  });
  return dbInstance;
}

function cn(...inputs) {
  return twMerge(clsx(inputs));
}
function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch (error) {
      console.warn("crypto.randomUUID() failed, using fallback");
    }
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}

async function createConversation(title = "New Conversation", model) {
  const db = await getDB();
  const conversation = {
    id: generateUUID(),
    title,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    model
  };
  await db.add("conversations", conversation);
  return conversation;
}
async function getConversation(id) {
  const db = await getDB();
  return db.get("conversations", id);
}
async function getConversationsSorted() {
  const db = await getDB();
  const conversations = await db.getAllFromIndex("conversations", "by-updated");
  return conversations.reverse();
}
async function updateConversation(id, updates) {
  const db = await getDB();
  const conversation = await db.get("conversations", id);
  if (!conversation) {
    throw new Error(`Conversation ${id} not found`);
  }
  const updated = {
    ...conversation,
    ...updates,
    updatedAt: Date.now()
  };
  await db.put("conversations", updated);
}
async function addMessage(conversationId, message) {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }
  const newMessage = {
    ...message,
    id: generateUUID(),
    timestamp: Date.now()
  };
  conversation.messages.push(newMessage);
  await updateConversation(conversationId, {
    messages: conversation.messages
  });
  return newMessage;
}
async function updateConversationTitle(id, title) {
  await updateConversation(id, {
    title
  });
}
function generateTitle(firstMessage) {
  const maxLength = 50;
  const cleaned = firstMessage.trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return cleaned.substring(0, maxLength - 3) + "...";
}
async function deleteConversation(id) {
  const db = await getDB();
  await db.delete("conversations", id);
}
async function getOrCreateConversation(conversationId, model) {
  return createConversation("New Conversation", model);
}

const conversations = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  addMessage,
  createConversation,
  deleteConversation,
  generateTitle,
  getConversation,
  getConversationsSorted,
  getOrCreateConversation,
  updateConversation,
  updateConversationTitle
}, Symbol.toStringTag, { value: 'Module' }));

function Sidebar({
  onDocumentClick,
  onShowModelSelector,
  onShowDocumentUpload
}) {
  const [conversations, setConversations] = useState([]);
  const [isOpen, setIsOpen] = useState(true);
  const [showDocuments, setShowDocuments] = useState(false);
  useEffect(() => {
    loadConversations();
  }, [conversationsStore.all.length]);
  async function loadConversations() {
    const sorted = await getConversationsSorted();
    setConversations(sorted);
  }
  async function handleNewChat() {
    const conversation = await createConversation("Nueva conversación");
    conversationsStore.add(conversation);
    conversationsStore.setActive(conversation.id);
    await loadConversations();
  }
  async function handleDeleteConversation(id, e) {
    e.stopPropagation();
    if (!confirm("¿Estás seguro de que quieres borrar esta conversación?")) {
      return;
    }
    await deleteConversation(id);
    conversationsStore.remove(id);
    await loadConversations();
  }
  function handleSelectConversation(id) {
    conversationsStore.setActive(id);
  }
  function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = /* @__PURE__ */ new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1e3 * 60 * 60);
    const diffInDays = diffInHours / 24;
    if (diffInHours < 24) {
      return "Hoy";
    } else if (diffInDays < 2) {
      return "Ayer";
    } else if (diffInDays < 7) {
      return "Esta semana";
    } else if (diffInDays < 30) {
      return "Este mes";
    } else {
      return date.toLocaleDateString("es-ES", {
        month: "short",
        year: "numeric"
      });
    }
  }
  const groupedConversations = conversations.reduce((groups, conv) => {
    const label = formatDate(conv.updatedAt);
    if (!groups[label]) {
      groups[label] = [];
    }
    groups[label].push(conv);
    return groups;
  }, {});
  const sidebarWidth = isOpen ? "w-64" : "w-0";
  return jsxs(Fragment, {
    children: [jsx("button", {
      onClick: () => setIsOpen(!isOpen),
      className: "lg:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] flex items-center justify-center hover:bg-[var(--color-bg-tertiary)] transition-colors",
      "aria-label": "Toggle sidebar",
      children: isOpen ? jsx(X, {
        size: 20
      }) : jsx(Menu, {
        size: 20
      })
    }), jsxs("aside", {
      className: `fixed top-0 left-0 h-screen bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)] ${sidebarWidth} transition-all duration-300 ease-in-out overflow-hidden z-40 flex flex-col`,
      children: [jsxs("div", {
        className: "flex items-center justify-between p-4 border-b border-[var(--color-border)]",
        children: [jsxs("div", {
          className: "flex items-center gap-2",
          children: [jsx("img", {
            src: "/inledai.svg",
            width: 28,
            height: 28
          }), jsx("span", {
            className: "font-semibold text-sm",
            children: "Edge.AI"
          })]
        }), jsx("button", {
          onClick: () => setIsOpen(false),
          className: "lg:hidden w-8 h-8 rounded-lg hover:bg-[var(--color-bg-tertiary)] flex items-center justify-center transition-colors",
          "aria-label": "Close sidebar",
          children: jsx(X, {
            size: 18
          })
        })]
      }), jsx("div", {
        className: "p-3",
        children: jsxs("button", {
          onClick: handleNewChat,
          className: "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--color-primary)] text-black font-medium text-sm hover:bg-[var(--color-primary)]/90 transition-colors shadow-[0_0_20px_rgba(40,229,24,0.3)]",
          children: [jsx(Plus, {
            size: 18
          }), jsx("span", {
            children: "Nueva conversación"
          })]
        })
      }), jsxs("div", {
        className: "flex gap-2 px-3 pb-3 border-b border-[var(--color-border)]",
        children: [jsxs("button", {
          onClick: () => setShowDocuments(false),
          className: `flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${!showDocuments ? "bg-[var(--color-bg-tertiary)] text-[var(--color-text)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]/50"}`,
          children: [jsx(MessageSquare, {
            size: 14
          }), jsx("span", {
            children: "Chats"
          })]
        }), jsxs("button", {
          onClick: () => setShowDocuments(true),
          className: `flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${showDocuments ? "bg-[var(--color-bg-tertiary)] text-[var(--color-text)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]/50"}`,
          children: [jsx(FileText, {
            size: 14
          }), jsxs("span", {
            children: ["Docs (", documentsStore.all.length, ")"]
          })]
        })]
      }), !showDocuments ? jsx("div", {
        className: "flex-1 overflow-y-auto px-3 py-2",
        children: Object.keys(groupedConversations).length === 0 ? jsxs("div", {
          className: "text-center py-8 text-sm text-[var(--color-text-secondary)]",
          children: [jsx(MessageSquare, {
            size: 32,
            className: "mx-auto mb-2 opacity-50"
          }), jsx("p", {
            children: "No hay conversaciones"
          }), jsx("p", {
            className: "text-xs mt-1",
            children: "Crea una nueva para empezar"
          })]
        }) : Object.entries(groupedConversations).map(([label, convs]) => jsxs("div", {
          className: "mb-4",
          children: [jsx("div", {
            className: "px-2 py-1 text-xs font-medium text-[var(--color-text-tertiary)]",
            children: label
          }), jsx("div", {
            className: "space-y-1",
            children: convs.map((conv) => jsxs("div", {
              onClick: () => handleSelectConversation(conv.id),
              className: `group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${conversationsStore.activeId === conv.id ? "bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]" : "hover:bg-[var(--color-bg-tertiary)]/50"}`,
              children: [jsx(MessageSquare, {
                size: 14,
                className: "flex-shrink-0 text-[var(--color-text-secondary)]"
              }), jsx("span", {
                className: "flex-1 text-sm truncate",
                children: conv.title
              }), jsx("button", {
                onClick: (e) => handleDeleteConversation(conv.id, e),
                className: "opacity-0 group-hover:opacity-100 flex-shrink-0 w-6 h-6 rounded-md hover:bg-[var(--color-error)]/20 flex items-center justify-center transition-all",
                "aria-label": "Borrar conversación",
                children: jsx(Trash2, {
                  size: 14,
                  className: "text-[var(--color-error)]"
                })
              })]
            }, conv.id))
          })]
        }, label))
      }) : (
        /* Documents List */
        jsx("div", {
          className: "flex-1 overflow-y-auto px-3 py-2",
          children: documentsStore.all.length === 0 ? jsxs("div", {
            className: "text-center py-8 text-sm text-[var(--color-text-secondary)]",
            children: [jsx(FileText, {
              size: 32,
              className: "mx-auto mb-2 opacity-50"
            }), jsx("p", {
              children: "No hay documentos"
            }), jsx("p", {
              className: "text-xs mt-1",
              children: "Sube documentos para empezar"
            })]
          }) : jsx("div", {
            className: "space-y-1",
            children: documentsStore.all.map((doc) => jsxs("div", {
              onClick: () => onDocumentClick?.(doc.id),
              className: "group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-[var(--color-bg-tertiary)]/50 transition-all",
              children: [jsx(FileText, {
                size: 14,
                className: "flex-shrink-0 text-[var(--color-text-secondary)]"
              }), jsxs("div", {
                className: "flex-1 min-w-0",
                children: [jsx("p", {
                  className: "text-sm truncate",
                  children: doc.name
                }), jsx("p", {
                  className: "text-xs text-[var(--color-text-tertiary)] flex items-center gap-1",
                  children: doc.status === "ready" ? jsxs(Fragment, {
                    children: [jsx(Check, {
                      size: 10,
                      className: "text-[var(--color-success)]"
                    }), jsx("span", {
                      children: "Listo"
                    })]
                  }) : "Procesando..."
                })]
              }), jsx(ChevronRight, {
                size: 14,
                className: "flex-shrink-0 text-[var(--color-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
              })]
            }, doc.id))
          })
        })
      ), jsxs("div", {
        className: "border-t border-[var(--color-border)] p-3 space-y-2",
        children: [jsxs("button", {
          onClick: onShowDocumentUpload,
          className: "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors",
          children: [jsx(Upload, {
            size: 16
          }), jsx("span", {
            children: "Subir documentos"
          })]
        }), jsxs("button", {
          onClick: onShowModelSelector,
          className: "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)] transition-colors",
          children: [jsx(Brain, {
            size: 16
          }), jsx("span", {
            children: "Configurar modelos"
          })]
        })]
      })]
    })]
  });
}

marked$1.setOptions({
  breaks: true,
  // Convert \n to <br>
  gfm: true,
  // GitHub Flavored Markdown
  headerIds: false
  // Don't generate header IDs
});
function MarkdownRenderer({
  content,
  className = ""
}) {
  const htmlContent = useMemo(() => {
    try {
      return marked$1.parse(content, {
        async: false
      });
    } catch (error) {
      console.error("Failed to parse markdown:", error);
      return content;
    }
  }, [content]);
  return jsx("div", {
    className: `markdown-content ${className}`,
    dangerouslySetInnerHTML: {
      __html: htmlContent
    }
  });
}

function WebSources({
  sources,
  className
}) {
  if (!sources || sources.length === 0) {
    return null;
  }
  return jsxs("div", {
    className: cn("mt-4 space-y-2", className),
    children: [jsxs("div", {
      className: "flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)]",
      children: [jsx(Globe, {
        size: 14
      }), jsx("span", {
        children: "Fuentes web consultadas"
      })]
    }), jsx("div", {
      className: "space-y-1.5",
      children: sources.map((source, index) => jsxs("a", {
        href: source.url,
        target: "_blank",
        rel: "noopener noreferrer",
        className: cn("group flex items-start gap-2 p-2.5 rounded-lg", "bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)]", "border border-[var(--color-border)]", "transition-all duration-200", "hover:scale-[1.02] active:scale-100"),
        children: [jsx("div", {
          className: "flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center text-xs font-medium text-blue-600 dark:text-blue-400",
          children: index + 1
        }), jsxs("div", {
          className: "flex-1 min-w-0",
          children: [jsx("div", {
            className: "text-sm font-medium text-[var(--color-text)] line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors",
            children: source.title
          }), jsx("div", {
            className: "mt-0.5 text-xs text-[var(--color-text-secondary)] truncate",
            children: new URL(source.url).hostname
          }), source.wordCount && jsxs("div", {
            className: "mt-1 text-xs text-[var(--color-text-tertiary)]",
            children: [source.wordCount.toLocaleString(), " palabras"]
          })]
        }), jsx("div", {
          className: "flex-shrink-0 text-[var(--color-text-tertiary)] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors",
          children: jsx(ExternalLink, {
            size: 14
          })
        }), source.score !== void 0 && jsxs("div", {
          className: "absolute top-2 right-2 text-xs font-mono text-[var(--color-text-tertiary)]",
          children: [(source.score * 100).toFixed(0), "%"]
        })]
      }, index))
    }), jsxs("div", {
      className: "flex items-start gap-2 px-3 py-2 bg-blue-500/5 border border-blue-500/20 rounded-lg",
      children: [jsx("div", {
        className: "flex-shrink-0 mt-0.5",
        children: jsx(Globe, {
          size: 12,
          className: "text-blue-600 dark:text-blue-400"
        })
      }), jsxs("p", {
        className: "text-xs text-blue-600 dark:text-blue-400 leading-relaxed",
        children: [jsx("strong", {
          children: "Información analizada localmente."
        }), " Todo el procesamiento se realizó en tu navegador. No se envió ningún dato a servidores externos."]
      })]
    })]
  });
}

function Message({
  message
}) {
  const isUser = message.role === "user";
  const webSources = message.metadata?.webSources;
  const hasWebSources = webSources && webSources.length > 0;
  const hasLocalSources = message.sources && message.sources.length > 0;
  return jsxs("div", {
    className: cn("flex gap-3 group animate-slideUp", isUser ? "justify-end" : "justify-start"),
    children: [!isUser && jsx("div", {
      className: "flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center shadow-[0_0_15px_rgba(40,229,24,0.3)]",
      children: jsx(Bot, {
        size: 18,
        color: "black"
      })
    }), jsxs("div", {
      className: cn("flex flex-col gap-1 max-w-[80%]", isUser && "items-end"),
      children: [jsx("div", {
        className: cn("rounded-2xl px-4 py-2.5 text-sm", "transition-all duration-200", isUser ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_0_15px_rgba(40,229,24,0.2)]" : "bg-[var(--color-bg-secondary)] text-[var(--color-text)] border border-[var(--color-border)]"),
        children: isUser ? jsx("p", {
          className: "whitespace-pre-wrap leading-relaxed",
          children: message.content
        }) : jsx(MarkdownRenderer, {
          content: message.content,
          className: "leading-relaxed"
        })
      }), !isUser && hasWebSources && jsx(WebSources, {
        sources: webSources,
        className: "px-2"
      }), !isUser && hasLocalSources && !hasWebSources && jsxs("div", {
        className: "flex flex-col gap-1 mt-1",
        children: [jsxs("span", {
          className: "text-xs text-[var(--color-text-tertiary)] px-2",
          children: [message.sources.length, " fuente", message.sources.length > 1 ? "s" : ""]
        }), jsx("div", {
          className: "flex flex-wrap gap-1",
          children: message.sources.map((source, idx) => jsxs("div", {
            className: "text-xs px-2 py-1 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] rounded-md border border-[var(--color-border)] flex items-center gap-1.5 hover:border-[var(--color-primary)] transition-colors",
            title: source.chunk.content.substring(0, 100),
            children: [jsx(FileText, {
              size: 12
            }), jsx("span", {
              className: "truncate max-w-[120px]",
              children: source.document.name
            }), jsxs("span", {
              className: "text-[var(--color-primary)]",
              children: [(source.score * 100).toFixed(0), "%"]
            })]
          }, idx))
        })]
      }), jsx("span", {
        className: "text-xs text-[var(--color-text-tertiary)] px-2",
        children: new Date(message.timestamp).toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit"
        })
      })]
    }), isUser && jsx("div", {
      className: "flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-bg-tertiary)] flex items-center justify-center border border-[var(--color-border)]",
      children: jsx(User, {
        size: 18
      })
    })]
  });
}

function Button({
  children,
  variant = "default",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = false,
  onClick,
  type = "button",
  className = ""
}) {
  const baseStyles = cn("inline-flex items-center justify-center gap-2", "font-medium rounded-lg", "transition-all duration-200", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2", "disabled:opacity-50 disabled:pointer-events-none", "active:scale-95", fullWidth && "w-full");
  const variants = {
    default: "bg-[var(--color-bg-tertiary)] text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] border border-[var(--color-border)]",
    primary: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 shadow-[0_0_20px_rgba(40,229,24,0.3)] hover:shadow-[0_0_30px_rgba(40,229,24,0.5)]",
    ghost: "hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text)]",
    outline: "border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] hover:border-[var(--color-primary)]",
    destructive: "bg-[var(--color-error)] text-white hover:opacity-90"
  };
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
    icon: "h-10 w-10"
  };
  return jsxs("button", {
    type,
    onClick,
    disabled: disabled || loading,
    className: cn(baseStyles, variants[variant], sizes[size], className),
    children: [loading && jsx("span", {
      className: "spinner",
      style: {
        width: "1rem",
        height: "1rem"
      }
    }), children]
  });
}

function ChatInput({
  onSend,
  disabled = false,
  loading = false,
  placeholder = "Escribe tu pregunta...",
  webSearchEnabled = false,
  onWebSearchToggle
}) {
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("conversation");
  const textareaRef = useRef(null);
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    }
  }, [message]);
  function handleSubmit(e) {
    e.preventDefault();
    if (message.trim() && !disabled && !loading) {
      onSend(message.trim(), mode);
      setMessage("");
    }
  }
  function setModeAndNotify(newMode) {
    setMode(newMode);
    if (newMode === "web") {
      onWebSearchToggle?.(true);
    } else {
      onWebSearchToggle?.(false);
    }
  }
  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }
  return jsxs("form", {
    onSubmit: handleSubmit,
    className: "relative",
    children: [jsxs("div", {
      className: "mb-2 px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm transition-all",
      style: {
        backgroundColor: mode === "conversation" ? "var(--color-bg-secondary)" : mode === "smart" ? "rgb(168 85 247 / 0.1)" : mode === "web" ? "rgb(59 130 246 / 0.1)" : "rgb(34 197 94 / 0.1)",
        borderColor: mode === "conversation" ? "var(--color-border)" : mode === "smart" ? "rgb(168 85 247 / 0.3)" : mode === "web" ? "rgb(59 130 246 / 0.3)" : "rgb(34 197 94 / 0.3)",
        color: mode === "conversation" ? "var(--color-text-secondary)" : mode === "smart" ? "rgb(168 85 247)" : mode === "web" ? "rgb(59 130 246)" : "rgb(34 197 94)",
        borderWidth: "1px",
        borderStyle: "solid"
      },
      children: [mode === "conversation" && jsxs(Fragment, {
        children: [jsx(MessageCircle, {
          size: 14
        }), jsx("span", {
          children: "Conversación pura - Sin RAG ni búsqueda"
        })]
      }), mode === "smart" && jsxs(Fragment, {
        children: [jsx(Sparkles, {
          size: 14
        }), jsx("span", {
          children: "Modo inteligente - IA decide estrategia"
        })]
      }), mode === "web" && jsxs(Fragment, {
        children: [jsx(Globe, {
          size: 14
        }), jsx("span", {
          children: "Búsqueda web activa"
        })]
      }), mode === "local" && jsxs(Fragment, {
        children: [jsx("span", {
          children: jsx(FileSearchCorner, {
            size: 14
          })
        }), jsx("span", {
          children: "Búsqueda en documentos locales"
        })]
      })]
    }), jsxs("div", {
      className: "relative flex items-end gap-2 p-3 bg-[var(--color-bg-secondary)] rounded-2xl transition-all duration-200",
      children: [jsx("button", {
        type: "button",
        onClick: () => setModeAndNotify("conversation"),
        disabled: disabled || loading,
        className: cn("flex-shrink-0 p-2 rounded-lg transition-all duration-200", "hover:bg-[var(--color-bg-hover)] active:scale-95", mode === "conversation" ? "text-gray-600 dark:text-gray-400 bg-gray-500/10" : "text-[var(--color-text-secondary)]", (disabled || loading) && "opacity-50 cursor-not-allowed"),
        title: "Modo conversacional puro",
        children: jsx(MessageCircle, {
          size: 20
        })
      }), jsx("button", {
        type: "button",
        onClick: () => setModeAndNotify("smart"),
        disabled: disabled || loading,
        className: cn("flex-shrink-0 p-2 rounded-lg transition-all duration-200", "hover:bg-[var(--color-bg-hover)] active:scale-95", mode === "smart" ? "text-purple-600 dark:text-purple-400 bg-purple-500/10" : "text-[var(--color-text-secondary)]", (disabled || loading) && "opacity-50 cursor-not-allowed"),
        title: "Modo inteligente",
        children: jsx(Sparkles, {
          size: 20
        })
      }), webSearchEnabled && jsx("button", {
        type: "button",
        onClick: () => setModeAndNotify("web"),
        disabled: disabled || loading,
        className: cn("flex-shrink-0 p-2 rounded-lg transition-all duration-200", "hover:bg-[var(--color-bg-hover)] active:scale-95", mode === "web" ? "text-blue-600 dark:text-blue-400 bg-blue-500/10" : "text-[var(--color-text-secondary)]", (disabled || loading) && "opacity-50 cursor-not-allowed"),
        title: "Búsqueda web",
        children: jsx(Globe, {
          size: 20
        })
      }), jsx("button", {
        type: "button",
        onClick: () => setModeAndNotify("local"),
        disabled: disabled || loading,
        className: cn("flex-shrink-0 p-2 rounded-lg transition-all duration-200", "hover:bg-[var(--color-bg-hover)] active:scale-95", mode === "local" ? "text-green-600 dark:text-green-400 bg-green-500/10" : "text-[var(--color-text-secondary)]", (disabled || loading) && "opacity-50 cursor-not-allowed"),
        title: "Búsqueda en documentos",
        children: jsx("span", {
          className: "text-lg",
          children: jsx(FileSearchCorner, {
            size: 20
          })
        })
      }), jsx("textarea", {
        ref: textareaRef,
        value: message,
        onInput: (e) => setMessage(e.target.value),
        onKeyDown: handleKeyDown,
        disabled: disabled || loading,
        placeholder,
        rows: 1,
        className: cn("flex-1 bg-transparent text-[var(--color-text)]", "resize-none outline-none border-none", "text-sm leading-relaxed", "min-h-[24px] max-h-[200px]"),
        style: {
          scrollbarWidth: "thin"
        }
      }), jsx(Button, {
        type: "submit",
        size: "icon",
        variant: "primary",
        disabled: !message.trim() || disabled || loading,
        className: "flex-shrink-0",
        children: loading ? jsx(Loader2, {
          size: 18,
          className: "animate-spin"
        }) : jsx(Send, {
          size: 18
        })
      })]
    })]
  });
}

const STEP_INFO = {
  query_generation: {
    icon: Sparkles,
    label: "Generando consulta",
    color: "text-purple-500"
  },
  web_search: {
    icon: Search,
    label: "Buscando en web",
    color: "text-blue-500"
  },
  url_selection: {
    icon: FileText,
    label: "Seleccionando fuentes",
    color: "text-indigo-500"
  },
  page_fetch: {
    icon: Globe,
    label: "Descargando páginas",
    color: "text-cyan-500"
  },
  content_extraction: {
    icon: FileText,
    label: "Extrayendo contenido",
    color: "text-teal-500"
  },
  chunking: {
    icon: Cpu,
    label: "Procesando documentos",
    color: "text-green-500"
  },
  embedding: {
    icon: Cpu,
    label: "Generando embeddings",
    color: "text-emerald-500"
  },
  vector_search: {
    icon: Search,
    label: "Buscando relevancia",
    color: "text-lime-500"
  },
  answer_generation: {
    icon: Sparkles,
    label: "Generando respuesta",
    color: "text-amber-500"
  },
  completed: {
    icon: Sparkles,
    label: "Completado",
    color: "text-green-600"
  },
  error: {
    icon: Sparkles,
    label: "Error",
    color: "text-red-500"
  }
};
function WebSearchProgress({
  step,
  progress,
  message
}) {
  const stepInfo = STEP_INFO[step] || STEP_INFO.web_search;
  const Icon = stepInfo.icon;
  return jsxs("div", {
    className: "py-3 px-4 bg-[var(--color-bg-secondary)] rounded-lg",
    children: [jsxs("div", {
      className: "flex items-center gap-3 mb-2",
      children: [jsx("div", {
        className: cn("flex-shrink-0", stepInfo.color),
        children: jsx(Icon, {
          size: 18,
          className: "animate-pulse"
        })
      }), jsxs("div", {
        className: "flex-1 min-w-0",
        children: [jsx("div", {
          className: "text-sm font-medium text-[var(--color-text)]",
          children: stepInfo.label
        }), message && jsx("div", {
          className: "text-xs text-[var(--color-text-secondary)] truncate",
          children: message
        })]
      }), jsxs("div", {
        className: "text-xs font-mono text-[var(--color-text-secondary)]",
        children: [Math.round(progress), "%"]
      })]
    }), jsx("div", {
      className: "w-full h-1.5 bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden",
      children: jsx("div", {
        className: cn("h-full transition-all duration-300 ease-out rounded-full", stepInfo.color.replace("text-", "bg-")),
        style: {
          width: `${Math.min(100, Math.max(0, progress))}%`
        }
      })
    })]
  });
}

function Card({
  children,
  hover = false,
  padding = "md",
  className = ""
}) {
  const paddingStyles = {
    none: "",
    sm: "p-3",
    md: "p-4",
    lg: "p-6"
  };
  return jsx("div", {
    className: cn("bg-[var(--color-bg)] rounded-xl", "border border-[var(--color-border)]", "shadow-sm transition-all duration-200", "animate-fadeIn", hover && "hover:-translate-y-0.5 hover:shadow-lg", paddingStyles[padding], className),
    children
  });
}

function DocumentCanvas({
  initialContent = "",
  onClose
}) {
  const editorRef = useRef(null);
  const quillRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);
  useEffect(() => {
    if (editorRef.current && !quillRef.current) {
      const quill = new Quill(editorRef.current, {
        theme: "snow",
        modules: {
          toolbar: [[{
            header: [1, 2, 3, 4, 5, 6, false]
          }], ["bold", "italic", "underline", "strike"], [{
            list: "ordered"
          }, {
            list: "bullet"
          }], [{
            indent: "-1"
          }, {
            indent: "+1"
          }], [{
            align: []
          }], ["blockquote", "code-block"], [{
            color: []
          }, {
            background: []
          }], ["link"], ["clean"]]
        },
        placeholder: "El contenido generado aparecerá aquí..."
      });
      if (initialContent) {
        quill.clipboard.dangerouslyPasteHTML(initialContent);
      }
      quillRef.current = quill;
    }
    return () => {
      if (quillRef.current) {
        quillRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (quillRef.current && initialContent) {
      const currentContent = quillRef.current.root.innerHTML;
      if (currentContent === "<p><br></p>" || currentContent === "") {
        quillRef.current.clipboard.dangerouslyPasteHTML(initialContent);
      }
    }
  }, [initialContent]);
  function exportAsMarkdown() {
    if (!quillRef.current) return;
    const html = quillRef.current.root.innerHTML;
    const markdown = htmlToMarkdown(html);
    const blob = new Blob([markdown], {
      type: "text/markdown;charset=utf-8"
    });
    saveAs(blob, `documento-${Date.now()}.md`);
  }
  async function exportAsWord() {
    if (!quillRef.current) return;
    setIsExporting(true);
    try {
      const html = quillRef.current.root.innerHTML;
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
      const converted = htmlDocx.asBlob(fullHtml);
      saveAs(converted, `documento-${Date.now()}.docx`);
    } catch (error) {
      console.error("Error exporting to Word:", error);
      alert("Error al exportar a Word");
    } finally {
      setIsExporting(false);
    }
  }
  function exportAsPDF() {
    if (!quillRef.current) return;
    const html = quillRef.current.root.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Por favor, permite ventanas emergentes para exportar PDF");
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
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
  function htmlToMarkdown(html) {
    let markdown = html;
    markdown = markdown.replace(/<p[^>]*><br><\/p>/g, "\n");
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/g, "# $1\n");
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/g, "## $1\n");
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/g, "### $1\n");
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/g, "#### $1\n");
    markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/g, "##### $1\n");
    markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/g, "###### $1\n");
    markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/g, "**$1**");
    markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/g, "**$1**");
    markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/g, "*$1*");
    markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/g, "*$1*");
    markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/g, "- $1\n");
    markdown = markdown.replace(/<\/ul>/g, "\n");
    markdown = markdown.replace(/<ul[^>]*>/g, "");
    markdown = markdown.replace(/<\/ol>/g, "\n");
    markdown = markdown.replace(/<ol[^>]*>/g, "");
    markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/g, "> $1\n");
    markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/g, "`$1`");
    markdown = markdown.replace(/<pre[^>]*>(.*?)<\/pre>/g, "```\n$1\n```\n");
    markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, "[$2]($1)");
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/g, "$1\n\n");
    markdown = markdown.replace(/<br\s*\/?>/g, "\n");
    markdown = markdown.replace(/<[^>]+>/g, "");
    markdown = markdown.replace(/\n{3,}/g, "\n\n");
    return markdown.trim();
  }
  return jsxs(Card, {
    className: "h-full flex flex-col",
    children: [jsxs("div", {
      className: "flex items-center justify-between p-4 border-b border-[var(--color-border)]",
      children: [jsxs("div", {
        className: "flex items-center gap-2",
        children: [jsx(FileText, {
          size: 20,
          className: "text-[var(--color-primary)]"
        }), jsx("h3", {
          className: "font-semibold",
          children: "Editor de Documentos"
        })]
      }), jsxs("div", {
        className: "flex items-center gap-2",
        children: [jsxs(Button, {
          variant: "outline",
          size: "sm",
          onClick: exportAsMarkdown,
          disabled: isExporting,
          children: [jsx(Download, {
            size: 16,
            className: "mr-1"
          }), "MD"]
        }), jsxs(Button, {
          variant: "outline",
          size: "sm",
          onClick: exportAsWord,
          disabled: isExporting,
          children: [jsx(Download, {
            size: 16,
            className: "mr-1"
          }), isExporting ? "Exportando..." : "DOCX"]
        }), jsxs(Button, {
          variant: "outline",
          size: "sm",
          onClick: exportAsPDF,
          disabled: isExporting,
          children: [jsx(Download, {
            size: 16,
            className: "mr-1"
          }), "PDF"]
        }), onClose && jsx(Button, {
          variant: "ghost",
          size: "icon",
          onClick: onClose,
          children: jsx(X, {
            size: 20
          })
        })]
      })]
    }), jsx("div", {
      className: "flex-1 overflow-hidden",
      children: jsx("div", {
        ref: editorRef,
        className: "h-full",
        style: {
          "--quill-border-color": "var(--color-border)"
        }
      })
    })]
  });
}

function semanticChunkText(text, targetSize = 800, minSize = 400) {
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter((p) => p.length > 0);
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const paragraphSize = paragraph.length;
    detectParagraphType(paragraph);
    if (paragraphSize > targetSize * 1.5) {
      if (currentChunk.length > 0) {
        chunks.push(createChunk(currentChunk, chunks.length));
        currentChunk = [];
        currentSize = 0;
      }
      const sentences = splitIntoSentences(paragraph);
      let sentenceChunk = [];
      let sentenceSize = 0;
      for (const sentence of sentences) {
        if (sentenceSize + sentence.length > targetSize && sentenceChunk.length > 0) {
          chunks.push(createChunk(sentenceChunk, chunks.length));
          sentenceChunk = [sentenceChunk[sentenceChunk.length - 1], sentence];
          sentenceSize = sentenceChunk[0].length + sentence.length;
        } else {
          sentenceChunk.push(sentence);
          sentenceSize += sentence.length;
        }
      }
      if (sentenceChunk.length > 0) {
        chunks.push(createChunk(sentenceChunk, chunks.length));
      }
      continue;
    }
    if (currentSize + paragraphSize > targetSize && currentChunk.length > 0) {
      chunks.push(createChunk(currentChunk, chunks.length));
      if (currentChunk.length > 0) {
        currentChunk = [currentChunk[currentChunk.length - 1], paragraph];
        currentSize = currentChunk[0].length + paragraphSize;
      } else {
        currentChunk = [paragraph];
        currentSize = paragraphSize;
      }
    } else {
      currentChunk.push(paragraph);
      currentSize += paragraphSize;
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(createChunk(currentChunk, chunks.length));
  }
  return chunks.map((chunk, i) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      totalChunks: chunks.length,
      prevContext: i > 0 ? getLastSentence(chunks[i - 1].content) : void 0,
      nextContext: i < chunks.length - 1 ? getFirstSentence(chunks[i + 1].content) : void 0
    }
  }));
}
function createChunk(paragraphs, index) {
  const content = paragraphs.join("\n\n");
  const type = detectParagraphType(content);
  return {
    content,
    metadata: {
      type,
      index,
      totalChunks: 0
      // Will be set later
    }
  };
}
function detectParagraphType(text) {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 1 && lines[0].length < 100 && !lines[0].endsWith(".")) {
    return "heading";
  }
  const listLines = lines.filter((l) => /^[\-\*\•\d]+[\.\)]\s/.test(l.trim()));
  if (listLines.length > 0) {
    return listLines.length === lines.length ? "list" : "mixed";
  }
  return "paragraph";
}
function splitIntoSentences(text) {
  return text.split(/([.!?]+[\s\n]+)/).reduce((acc, part, i, arr) => {
    if (i % 2 === 0 && part.trim()) {
      const sentence = part + (arr[i + 1] || "");
      acc.push(sentence.trim());
    }
    return acc;
  }, []).filter((s) => s.length > 0);
}
function getFirstSentence(text) {
  const sentences = splitIntoSentences(text);
  return sentences[0] || text.substring(0, 150);
}
function getLastSentence(text) {
  const sentences = splitIntoSentences(text);
  return sentences[sentences.length - 1] || text.substring(Math.max(0, text.length - 150));
}

async function createChunksBatch(chunks) {
  const db = await getDB();
  const tx = db.transaction("chunks", "readwrite");
  const created = [];
  for (const chunk of chunks) {
    const newChunk = {
      ...chunk,
      id: generateUUID()
    };
    await tx.store.add(newChunk);
    created.push(newChunk);
  }
  await tx.done;
  return created;
}
async function getChunk(id) {
  const db = await getDB();
  return db.get("chunks", id);
}

async function chunkAndStoreDocument(documentId, text, chunkSize = 800, overlap = 50) {
  console.log(`📄 Chunking document ${documentId}...`);
  const semanticChunks = semanticChunkText(text, chunkSize);
  console.log(`✂️ Created ${semanticChunks.length} semantic chunks`);
  const dbChunks = semanticChunks.map((sc, index) => ({
    documentId,
    content: sc.content,
    index,
    tokens: estimateTokens(sc.content),
    metadata: {
      startChar: sc.metadata.startChar,
      endChar: sc.metadata.endChar,
      type: sc.metadata.type,
      prevContext: sc.metadata.prevContext,
      nextContext: sc.metadata.nextContext
    }
  }));
  const storedChunks = await createChunksBatch(dbChunks);
  console.log(`✅ Stored ${storedChunks.length} chunks in IndexedDB`);
  return storedChunks;
}
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function serializeEmbedding(embedding) {
  return {
    ...embedding,
    vector: Array.from(embedding.vector)
  };
}
function deserializeEmbedding(stored) {
  return {
    ...stored,
    vector: new Float32Array(stored.vector)
  };
}
async function createEmbeddingsBatch(embeddings) {
  const db = await getDB();
  const tx = db.transaction("embeddings", "readwrite");
  const created = [];
  for (const emb of embeddings) {
    const embedding = {
      id: generateUUID(),
      chunkId: emb.chunkId,
      documentId: emb.documentId,
      vector: emb.vector,
      model: emb.model,
      createdAt: Date.now()
    };
    await tx.store.add(serializeEmbedding(embedding));
    created.push(embedding);
  }
  await tx.done;
  return created;
}
async function getAllEmbeddings() {
  const db = await getDB();
  const stored = await db.getAll("embeddings");
  return stored.map(deserializeEmbedding);
}

async function createDocument(document) {
  const db = await getDB();
  const newDoc = {
    ...document,
    id: generateUUID(),
    uploadedAt: Date.now(),
    status: "pending"
  };
  await db.add("documents", newDoc);
  return newDoc;
}
async function getDocument(id) {
  const db = await getDB();
  return db.get("documents", id);
}
async function updateDocument(id, updates) {
  const db = await getDB();
  const doc = await db.get("documents", id);
  if (!doc) {
    throw new Error(`Document ${id} not found`);
  }
  const updatedDoc = {
    ...doc,
    ...updates
  };
  await db.put("documents", updatedDoc);
}
async function updateDocumentStatus(id, status, errorMessage) {
  await updateDocument(id, {
    status,
    errorMessage,
    processedAt: status === "ready" ? Date.now() : void 0
  });
}
async function deleteDocument(id) {
  const db = await getDB();
  const tx = db.transaction(["documents", "chunks", "embeddings"], "readwrite");
  try {
    await tx.objectStore("documents").delete(id);
    const chunksStore = tx.objectStore("chunks");
    const chunkKeys = await chunksStore.index("by-document").getAllKeys(id);
    for (const key of chunkKeys) {
      await chunksStore.delete(key);
    }
    const embeddingsStore = tx.objectStore("embeddings");
    const embeddingKeys = await embeddingsStore.index("by-document").getAllKeys(id);
    for (const key of embeddingKeys) {
      await embeddingsStore.delete(key);
    }
    await tx.done;
  } catch (error) {
    console.error("Failed to delete document:", error);
    throw error;
  }
}

const documents = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  createDocument,
  deleteDocument,
  getDocument,
  updateDocument,
  updateDocumentStatus
}, Symbol.toStringTag, { value: 'Module' }));

function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) {
    return 0;
  }
  return dotProduct / magnitude;
}
async function searchSimilarChunks(queryEmbedding, topK = 5, documentIds) {
  const startTime = Date.now();
  console.log(`🔍 Searching for top ${topK} similar chunks...`);
  let embeddings = await getAllEmbeddings();
  console.log(`📊 Searching across ${embeddings.length} embeddings`);
  const similarities = embeddings.map((embedding) => ({
    embedding,
    score: cosineSimilarity(queryEmbedding, embedding.vector)
  }));
  similarities.sort((a, b) => b.score - a.score);
  const topResults = similarities.slice(0, topK);
  const retrievedChunks = [];
  for (const result of topResults) {
    const chunk = await getChunk(result.embedding.chunkId);
    const document = chunk ? await getDocument(chunk.documentId) : null;
    if (chunk && document) {
      retrievedChunks.push({
        chunk,
        document,
        score: result.score,
        embedding: result.embedding
      });
    }
  }
  const searchTime = Date.now() - startTime;
  console.log(`✅ Found ${retrievedChunks.length} chunks in ${searchTime}ms`);
  return retrievedChunks;
}
function createRAGContext(chunks) {
  if (chunks.length === 0) {
    return "";
  }
  const contextParts = chunks.map((rc, index) => {
    const docName = rc.document.name;
    const score = (rc.score * 100).toFixed(1);
    return `[Documento ${index + 1}: ${docName} (${score}% relevancia)]
${rc.chunk.content}`;
  });
  return contextParts.join("\n\n---\n\n");
}

async function processDocument(documentId, text, embeddingEngine, chunkSize = 800, onProgress) {
  try {
    console.log(`🚀 Processing document ${documentId}...`);
    await updateDocumentStatus(documentId, "processing");
    onProgress?.({
      documentId,
      stage: "chunking",
      progress: 10,
      message: "Dividiendo documento en fragmentos..."
    });
    const chunks = await chunkAndStoreDocument(documentId, text, chunkSize);
    console.log(`✅ Created ${chunks.length} chunks`);
    onProgress?.({
      documentId,
      stage: "embedding",
      progress: 30,
      message: `Generando embeddings (0/${chunks.length})...`
    });
    const texts = chunks.map((c) => c.content);
    const embeddings = await embeddingEngine.generateEmbeddingsBatch(
      texts,
      4,
      // Max 4 concurrent
      (progress, status) => {
        onProgress?.({
          documentId,
          stage: "embedding",
          progress: 30 + progress * 0.6,
          // 30-90%
          message: status
        });
      }
    );
    console.log(`✅ Generated ${embeddings.length} embeddings`);
    onProgress?.({
      documentId,
      stage: "embedding",
      progress: 95,
      message: "Guardando embeddings..."
    });
    const embeddingsToStore = chunks.map((chunk, i) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      vector: embeddings[i],
      model: "wllama-embedding"
      // Track which model was used
    }));
    await createEmbeddingsBatch(embeddingsToStore);
    await updateDocumentStatus(documentId, "ready");
    onProgress?.({
      documentId,
      stage: "complete",
      progress: 100,
      message: "Documento procesado correctamente"
    });
    console.log(`✅ Document ${documentId} processed successfully`);
  } catch (error) {
    console.error(`❌ Failed to process document ${documentId}:`, error);
    await updateDocumentStatus(documentId, "error", error instanceof Error ? error.message : "Unknown error");
    onProgress?.({
      documentId,
      stage: "error",
      progress: 0,
      message: "Error al procesar documento",
      error: error instanceof Error ? error.message : "Unknown error"
    });
    throw error;
  }
}
async function queryWithRAG(query, embeddingEngine, topK = 5, documentIds) {
  const startTime = Date.now();
  console.log(`🔍 RAG Query: "${query}"`);
  console.log("🔢 Generating query embedding...");
  const queryEmbedding = await embeddingEngine.generateEmbedding(query);
  const chunks = await searchSimilarChunks(queryEmbedding, topK);
  const searchTime = Date.now() - startTime;
  return {
    query,
    chunks,
    totalSearched: chunks.length,
    searchTime
  };
}
async function generateRAGAnswer(query, ragResult, chatEngine, conversationHistory, onStream) {
  const context = createRAGContext(ragResult.chunks);
  const prompt = buildRAGPrompt(query, context, conversationHistory);
  console.log("💬 Generating answer with context and history...");
  const answer = await chatEngine.generateText(prompt, {
    temperature: 0.7,
    maxTokens: 1024,
    onStream
  });
  return answer;
}
function buildRAGPrompt(query, context, conversationHistory) {
  if (!context) {
    return `Pregunta: ${query}

Responde de forma clara y concisa.`;
  }
  let historyText = "";
  if (conversationHistory && conversationHistory.length > 0) {
    historyText = "\n\nHISTORIAL DE CONVERSACIÓN:\n";
    conversationHistory.forEach((msg) => {
      if (msg.role === "user") {
        historyText += `Usuario: ${msg.content}
`;
      } else if (msg.role === "assistant") {
        historyText += `Asistente: ${msg.content}
`;
      }
    });
    historyText += "\n";
  }
  return `Eres un asistente útil que responde preguntas basándote en el contexto proporcionado. Mantén coherencia con las conversaciones anteriores.

CONTEXTO DE DOCUMENTOS:
${context}${historyText}
PREGUNTA ACTUAL: ${query}

Responde la pregunta usando la información del contexto. Si necesitas referirte a algo mencionado antes, usa el historial de conversación. Si el contexto no contiene información suficiente, di "No tengo suficiente información en los documentos para responder esta pregunta."

RESPUESTA:`;
}
async function completeRAGFlow(query, embeddingEngine, chatEngine, topK = 5, documentIds, conversationHistory, onStream) {
  const ragResult = await queryWithRAG(query, embeddingEngine, topK);
  console.log(`📊 Retrieved ${ragResult.chunks.length} chunks in ${ragResult.searchTime}ms`);
  const answer = await generateRAGAnswer(query, ragResult, chatEngine, conversationHistory, onStream);
  return {
    answer,
    ragResult
  };
}

async function probeActualLimits() {
  try {
    if (!navigator.gpu) {
      console.log("❌ WebGPU not available");
      return null;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      console.log("❌ WebGPU adapter not available");
      return null;
    }
    const limits = adapter.limits;
    const maxBufferSize = limits.maxBufferSize;
    console.log("🔍 Detected GPU limits:", {
      maxBufferSize: `${Math.round(maxBufferSize / 1024 / 1024)}MB`,
      maxStorageBufferBinding: `${Math.round(limits.maxStorageBufferBindingSize / 1024 / 1024)}MB`,
      maxComputeWorkgroupSizeX: limits.maxComputeWorkgroupSizeX
    });
    let tier;
    if (maxBufferSize >= 2e9) {
      tier = "discrete";
    } else if (maxBufferSize >= 8e8) {
      tier = "integrated";
    } else {
      tier = "mobile";
    }
    const config = {
      maxBufferSize: limits.maxBufferSize,
      maxStorageBufferBinding: limits.maxStorageBufferBindingSize,
      maxUniformBufferBinding: limits.maxUniformBufferBindingSize,
      recommendedModelSize: Math.floor(maxBufferSize * 0.7),
      // 70% safety margin
      tier
    };
    console.log(`✅ GPU Tier: ${tier.toUpperCase()}`);
    return config;
  } catch (error) {
    console.warn("⚠️ Failed to probe GPU limits:", error);
    return null;
  }
}
function getWebGPUConfig(tier) {
  const configs = {
    mobile: {
      max_batch_size: 32,
      max_window_size: 1024,
      recommended_context: 512
    },
    integrated: {
      max_batch_size: 64,
      max_window_size: 2048,
      recommended_context: 1024
    },
    discrete: {
      max_batch_size: 128,
      max_window_size: 4096,
      recommended_context: 2048
    }
  };
  return configs[tier];
}

class WebLLMEngine {
  engine = null;
  modelName = "";
  isInitialized = false;
  backend = "webgpu";
  constructor() {
    console.log("🤖 WebLLM Engine created");
  }
  /**
   * Initialize the WebLLM engine with a specific model
   * REQUIRES WebGPU - throws error if not available
   */
  async initialize(modelName, onProgress) {
    if (this.isInitialized && this.modelName === modelName) {
      console.log("✅ WebLLM already initialized with", modelName);
      return;
    }
    try {
      console.log("🚀 Initializing WebLLM with model:", modelName);
      onProgress?.(0, "Inicializando WebLLM...");
      const gpuLimits = await probeActualLimits();
      if (!gpuLimits) {
        throw new Error("WebGPU is required for WebLLM but is not available");
      }
      console.log("✅ WebGPU available, using GPU backend");
      console.log(`🎯 GPU Tier: ${gpuLimits.tier.toUpperCase()}`);
      onProgress?.(10, "Usando backend: GPU (WebGPU)");
      const webgpuConfig = getWebGPUConfig(gpuLimits.tier);
      console.log("⚙️ WebGPU config:", webgpuConfig);
      this.engine = new webllm.MLCEngine();
      onProgress?.(20, `Cargando modelo ${modelName}...`);
      console.log(`📥 Downloading WebLLM model: ${modelName}`);
      await this.engine.reload(modelName, {
        context_window_size: webgpuConfig.max_window_size,
        // @ts-ignore - advanced options
        max_batch_size: webgpuConfig.max_batch_size,
        // @ts-ignore - initProgressCallback exists but might not be in types
        initProgressCallback: (report) => {
          const progress = Math.round(report.progress * 70) + 20;
          const status = report.text || "Cargando...";
          onProgress?.(progress, status);
          console.log(`[WebLLM] ${Math.round(report.progress * 100)}% - ${status}`);
        }
      });
      console.log("✅ WebLLM model loaded successfully");
      console.log("🔥 Warming up GPU pipeline...");
      onProgress?.(95, "Calentando modelo...");
      await this.engine.chat.completions.create({
        messages: [{
          role: "user",
          content: "Hi"
        }],
        max_tokens: 1,
        temperature: 0.7
      });
      console.log("✅ Model warmed up, ready for inference");
      this.modelName = modelName;
      this.isInitialized = true;
      console.log(`✅ WebLLM initialized successfully with ${this.backend.toUpperCase()}`);
      onProgress?.(100, "Modelo listo (GPU)");
    } catch (error) {
      console.error("❌ Failed to initialize WebLLM:", error);
      this.isInitialized = false;
      throw new Error(`Failed to initialize WebLLM: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  /**
   * Generate embeddings for a text (for semantic search)
   * NOTE: WebLLM doesn't support embeddings
   * This method should NOT be called - use WllamaEngine instead
   */
  async generateEmbedding(text) {
    throw new Error("WebLLM does not support embeddings. Use WllamaEngine for embeddings instead.");
  }
  /**
   * Generate text response using WebLLM
   * Supports streaming for better UX
   */
  async generateText(prompt, options = {}) {
    if (!this.isInitialized || !this.engine) {
      throw new Error("WebLLM engine not initialized");
    }
    const {
      temperature = 0.7,
      maxTokens = 512,
      topP = 0.95,
      onStream
    } = options;
    try {
      console.log("💬 Generating text with WebLLM...");
      if (onStream) {
        let fullResponse = "";
        const completion = await this.engine.chat.completions.create({
          messages: [{
            role: "user",
            content: prompt
          }],
          temperature,
          max_tokens: maxTokens,
          top_p: topP,
          stream: true
        });
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullResponse += content;
            onStream(content);
          }
        }
        console.log("✅ Generated", fullResponse.length, "characters");
        return fullResponse;
      } else {
        const response = await this.engine.chat.completions.create({
          messages: [{
            role: "user",
            content: prompt
          }],
          temperature,
          max_tokens: maxTokens,
          top_p: topP,
          stream: false
        });
        const generatedText = response.choices[0]?.message?.content || "";
        console.log("✅ Generated", generatedText.length, "characters");
        return generatedText;
      }
    } catch (error) {
      console.error("❌ Text generation failed:", error);
      throw new Error(`Failed to generate text: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  /**
   * Get the current backend being used
   */
  getBackend() {
    return this.backend;
  }
  /**
   * Check if the engine is initialized
   */
  isReady() {
    return this.isInitialized && this.engine !== null;
  }
  /**
   * Get the current model name
   */
  getModelName() {
    return this.modelName;
  }
  /**
   * Reset/unload the model (free memory)
   */
  async reset() {
    if (this.engine) {
      console.log("🔄 Resetting WebLLM engine...");
      this.engine = null;
      this.isInitialized = false;
      this.modelName = "";
      console.log("✅ WebLLM engine reset");
    }
  }
  /**
   * Get runtime statistics (if available)
   */
  async getRuntimeStats() {
    if (!this.engine) return null;
    try {
      const stats = await this.engine.runtimeStatsText?.();
      return stats;
    } catch (error) {
      console.warn("Could not get runtime stats:", error);
      return null;
    }
  }
}

const joinBuffers = (buffers) => {
  const totalSize = buffers.reduce((acc, buf) => acc + buf.length, 0);
  const output = new Uint8Array(totalSize);
  output.set(buffers[0], 0);
  for (let i = 1; i < buffers.length; i++) {
    output.set(buffers[i], buffers[i - 1].length);
  }
  return output;
};
const textDecoder = new TextDecoder();
const bufToText = (buffer) => {
  return textDecoder.decode(buffer);
};
const maybeSortFileByName = (blobs) => {
  const isFiles = blobs.every((b) => !!b.name);
  if (isFiles) {
    const files = blobs;
    files.sort((a, b) => a.name.localeCompare(b.name));
  }
};
const absoluteUrl = (relativePath) => new URL(relativePath, document.baseURI).href;
const padDigits = (number, digits) => {
  return Array(Math.max(digits - String(number).length + 1, 0)).join("0") + number;
};
const isSupportMultiThread = () => (async (e) => {
  try {
    return "undefined" != typeof MessageChannel && new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)), WebAssembly.validate(e);
  } catch (e2) {
    return false;
  }
})(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    4,
    1,
    96,
    0,
    0,
    3,
    2,
    1,
    0,
    5,
    4,
    1,
    3,
    1,
    1,
    10,
    11,
    1,
    9,
    0,
    65,
    0,
    254,
    16,
    2,
    0,
    26,
    11
  ])
);
const isSupportExceptions = async () => WebAssembly.validate(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    4,
    1,
    96,
    0,
    0,
    3,
    2,
    1,
    0,
    10,
    8,
    1,
    6,
    0,
    6,
    64,
    25,
    11,
    11
  ])
);
const isSupportSIMD = async () => WebAssembly.validate(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    5,
    1,
    96,
    0,
    1,
    123,
    3,
    2,
    1,
    0,
    10,
    10,
    1,
    8,
    0,
    65,
    0,
    253,
    15,
    253,
    98,
    11
  ])
);
const checkEnvironmentCompatible = async () => {
  if (!await isSupportExceptions()) {
    throw new Error("WebAssembly runtime does not support exception handling");
  }
  if (!await isSupportSIMD()) {
    throw new Error("WebAssembly runtime does not support SIMD");
  }
};
const isSafari = () => {
  return isSafariMobile() || !!navigator.userAgent.match(/Version\/([0-9\._]+).*Safari/);
};
const isSafariMobile = () => {
  return !!navigator.userAgent.match(/Version\/([0-9\._]+).*Mobile.*Safari.*/);
};

const MEMFS_PATCH_TO_HEAPFS = `
const fsNameToFile = {};  // map Name => File
const fsIdToFile = {};    // map ID => File
let currFileId = 0;

// Patch and redirect memfs calls to wllama
const patchMEMFS = () => {
  const m = wModule;
  // save functions
  m.MEMFS.stream_ops._read = m.MEMFS.stream_ops.read;
  m.MEMFS.stream_ops._write = m.MEMFS.stream_ops.write;
  m.MEMFS.stream_ops._llseek = m.MEMFS.stream_ops.llseek;
  m.MEMFS.stream_ops._allocate = m.MEMFS.stream_ops.allocate;
  m.MEMFS.stream_ops._mmap = m.MEMFS.stream_ops.mmap;
  m.MEMFS.stream_ops._msync = m.MEMFS.stream_ops.msync;

  const patchStream = (stream) => {
    const name = stream.node.name;
    if (fsNameToFile[name]) {
      const f = fsNameToFile[name];
      stream.node.contents = m.HEAPU8.subarray(f.ptr, f.ptr + f.size);
      stream.node.usedBytes = f.size;
    }
  };

  // replace "read" functions
  m.MEMFS.stream_ops.read = function (stream, buffer, offset, length, position) {
    patchStream(stream);
    return m.MEMFS.stream_ops._read(stream, buffer, offset, length, position);
  };
  m.MEMFS.ops_table.file.stream.read = m.MEMFS.stream_ops.read;

  // replace "llseek" functions
  m.MEMFS.stream_ops.llseek = function (stream, offset, whence) {
    patchStream(stream);
    return m.MEMFS.stream_ops._llseek(stream, offset, whence);
  };
  m.MEMFS.ops_table.file.stream.llseek = m.MEMFS.stream_ops.llseek;

  // replace "mmap" functions
  m.MEMFS.stream_ops.mmap = function (stream, length, position, prot, flags) {
    patchStream(stream);
    const name = stream.node.name;
    if (fsNameToFile[name]) {
      const f = fsNameToFile[name];
      return {
        ptr: f.ptr + position,
        allocated: false,
      };
    } else {
      return m.MEMFS.stream_ops._mmap(stream, length, position, prot, flags);
    }
  };
  m.MEMFS.ops_table.file.stream.mmap = m.MEMFS.stream_ops.mmap;

  // mount FS
  m.FS.mkdir('/models');
  m.FS.mount(m.MEMFS, { root: '.' }, '/models');
};

// Allocate a new file in wllama heapfs, returns file ID
const heapfsAlloc = (name, size) => {
  if (size < 1) {
    throw new Error('File size must be bigger than 0');
  }
  const m = wModule;
  const ptr = m.mmapAlloc(size);
  const file = {
    ptr: ptr,
    size: size,
    id: currFileId++,
  };
  fsIdToFile[file.id] = file;
  fsNameToFile[name] = file;
  return file.id;
};

// Add new file to wllama heapfs, return number of written bytes
const heapfsWrite = (id, buffer, offset) => {
  const m = wModule;
  if (fsIdToFile[id]) {
    const { ptr, size } = fsIdToFile[id];
    const afterWriteByte = offset + buffer.byteLength;
    if (afterWriteByte > size) {
      throw new Error(\`File ID \${id} write out of bound, afterWriteByte = \${afterWriteByte} while size = \${size}\`);
    }
    m.HEAPU8.set(buffer, ptr + offset);
    return buffer.byteLength;
  } else {
    throw new Error(\`File ID \${id} not found in heapfs\`);
  }
};
`;
const WORKER_UTILS = `
// send message back to main thread
const msg = (data) => postMessage(data);

// Convert CPP log into JS log
const cppLogToJSLog = (line) => {
  const matched = line.match(/@@(DEBUG|INFO|WARN|ERROR)@@(.*)/);
  return !!matched
    ? {
      level: (matched[1] === 'INFO' ? 'debug' : matched[1]).toLowerCase(),
      text: matched[2],
    }
    : { level: 'log', text: line };
};

// Get module config that forwards stdout/err to main thread
const getWModuleConfig = (pathConfig, pthreadPoolSize) => {
  if (!pathConfig['wllama.js']) {
    throw new Error('"wllama.js" is missing in pathConfig');
  }
  return {
    noInitialRun: true,
    print: function (text) {
      if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
      msg({ verb: 'console.log', args: [text] });
    },
    printErr: function (text) {
      if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(' ');
      const logLine = cppLogToJSLog(text);
      msg({ verb: 'console.' + logLine.level, args: [logLine.text] });
    },
    locateFile: function (filename, basePath) {
      const p = pathConfig[filename];
      const truncate = (str) => str.length > 128 ? \`\${str.substr(0, 128)}...\` : str;
      msg({ verb: 'console.debug', args: [\`Loading "\${filename}" from "\${truncate(p)}"\`] });
      return p;
    },
    mainScriptUrlOrBlob: pathConfig['wllama.js'],
    pthreadPoolSize,
    wasmMemory: pthreadPoolSize > 1 ? getWasmMemory() : null,
    onAbort: function (text) {
      msg({ verb: 'signal.abort', args: [text] });
    },
  };
};

// Get the memory to be used by wasm. (Only used in multi-thread mode)
// Because we have a weird OOM issue on iOS, we need to try some values
// See: https://github.com/emscripten-core/emscripten/issues/19144
//      https://github.com/godotengine/godot/issues/70621
const getWasmMemory = () => {
  let minBytes = 128 * 1024 * 1024;
  let maxBytes = 4096 * 1024 * 1024;
  let stepBytes = 128 * 1024 * 1024;
  while (maxBytes > minBytes) {
    try {
      const wasmMemory = new WebAssembly.Memory({
        initial: minBytes / 65536,
        maximum: maxBytes / 65536,
        shared: true,
      });
      return wasmMemory;
    } catch (e) {
      maxBytes -= stepBytes;
      continue; // retry
    }
  }
  throw new Error('Cannot allocate WebAssembly.Memory');
};
`;
const WORKER_CODE$1 = `
// Start the main llama.cpp
let wModule;
let wllamaStart;
let wllamaAction;
let wllamaExit;
let wllamaDebug;

${WORKER_UTILS}

${MEMFS_PATCH_TO_HEAPFS}

const callWrapper = (name, ret, args) => {
  const fn = wModule.cwrap(name, ret, args);
  return async (action, req) => {
    let result;
    try {
      if (args.length === 2) {
        result = await fn(action, req);
      } else {
        result = fn();
      }
    } catch (ex) {
      console.error(ex);
      throw ex;
    }
    return result;
  };
}

onmessage = async (e) => {
  if (!e.data) return;
  const { verb, args, callbackId } = e.data;

  if (!callbackId) {
    msg({ verb: 'console.error', args: ['callbackId is required', e.data] });
    return;
  }

  if (verb === 'module.init') {
    const argPathConfig      = args[0];
    const argPThreadPoolSize = args[1];
    try {
      const Module = ModuleWrapper();
      wModule = await Module(getWModuleConfig(
        argPathConfig,
        argPThreadPoolSize,
      ));

      // init FS
      patchMEMFS();

      // init cwrap
      wllamaStart  = callWrapper('wllama_start' , 'string', []);
      wllamaAction = callWrapper('wllama_action', 'string', ['string', 'string']);
      wllamaExit   = callWrapper('wllama_exit'  , 'string', []);
      wllamaDebug  = callWrapper('wllama_debug' , 'string', []);
      msg({ callbackId, result: null });

    } catch (err) {
      msg({ callbackId, err });
    }
    return;
  }

  if (verb === 'fs.alloc') {
    const argFilename = args[0];
    const argSize     = args[1];
    try {
      // create blank file
      const emptyBuffer = new ArrayBuffer(0);
      wModule['FS_createDataFile']('/models', argFilename, emptyBuffer, true, true, true);
      // alloc data on heap
      const fileId = heapfsAlloc(argFilename, argSize);
      msg({ callbackId, result: { fileId } });
    } catch (err) {
      msg({ callbackId, err });
    }
    return;
  }

  if (verb === 'fs.write') {
    const argFileId = args[0];
    const argBuffer = args[1];
    const argOffset = args[2];
    try {
      const writtenBytes = heapfsWrite(argFileId, argBuffer, argOffset);
      msg({ callbackId, result: { writtenBytes } });
    } catch (err) {
      msg({ callbackId, err });
    }
    return;
  }

  if (verb === 'wllama.start') {
    try {
      const result = await wllamaStart();
      msg({ callbackId, result });
    } catch (err) {
      msg({ callbackId, err });
    }
    return;
  }

  if (verb === 'wllama.action') {
    const argAction = args[0];
    const argBody = args[1];
    try {
      const result = await wllamaAction(argAction, argBody);
      msg({ callbackId, result });
    } catch (err) {
      msg({ callbackId, err });
    }
    return;
  }

  if (verb === 'wllama.exit') {
    try {
      const result = await wllamaExit();
      msg({ callbackId, result });
    } catch (err) {
      msg({ callbackId, err });
    }
    return;
  }

  if (verb === 'wllama.debug') {
    try {
      const result = await wllamaDebug();
      msg({ callbackId, result });
    } catch (err) {
      msg({ callbackId, err });
    }
    return;
  }
};
`;
class ProxyToWorker {
  constructor(pathConfig, nbThread = 1, suppressNativeLog, logger) {
    this.taskQueue = [];
    this.taskId = 1;
    this.resultQueue = [];
    this.busy = false;
    this.pathConfig = pathConfig;
    this.nbThread = nbThread;
    this.multiThread = nbThread > 1;
    this.logger = logger;
    this.suppressNativeLog = suppressNativeLog;
  }
  async moduleInit(ggufFiles) {
    if (!this.pathConfig["wllama.js"]) {
      throw new Error(
        '"single-thread/wllama.js" or "multi-thread/wllama.js" is missing from pathConfig'
      );
    }
    const Module = await import(this.pathConfig["wllama.js"]);
    let moduleCode = Module.default.toString();
    moduleCode = moduleCode.replace(/import\.meta/g, "importMeta");
    const completeCode = [
      "const importMeta = {}",
      `function ModuleWrapper() {
        const _scriptDir = ${JSON.stringify(window.location.href)};
        return ${moduleCode};
      }`,
      WORKER_CODE$1
    ].join(";\n\n");
    const workerURL = window.URL.createObjectURL(
      new Blob([completeCode], { type: "text/javascript" })
    );
    this.worker = new Worker(workerURL);
    this.worker.onmessage = this.onRecvMsg.bind(this);
    this.worker.onerror = this.logger.error;
    const res = await this.pushTask({
      verb: "module.init",
      args: [this.pathConfig, this.nbThread],
      callbackId: this.taskId++
    });
    const nativeFiles = [];
    for (const file of ggufFiles) {
      const id = await this.fileAlloc(file.name, file.blob.size);
      nativeFiles.push({ id, ...file });
    }
    await Promise.all(
      nativeFiles.map((file) => {
        return this.fileWrite(file.id, file.blob);
      })
    );
    return res;
  }
  async wllamaStart() {
    const result = await this.pushTask({
      verb: "wllama.start",
      args: [],
      callbackId: this.taskId++
    });
    const parsedResult = this.parseResult(result);
    return parsedResult;
  }
  async wllamaAction(name, body) {
    const result = await this.pushTask({
      verb: "wllama.action",
      args: [name, JSON.stringify(body)],
      callbackId: this.taskId++
    });
    const parsedResult = this.parseResult(result);
    return parsedResult;
  }
  async wllamaExit() {
    if (this.worker) {
      const result = await this.pushTask({
        verb: "wllama.exit",
        args: [],
        callbackId: this.taskId++
      });
      this.parseResult(result);
      this.worker.terminate();
    }
  }
  async wllamaDebug() {
    const result = await this.pushTask({
      verb: "wllama.debug",
      args: [],
      callbackId: this.taskId++
    });
    return JSON.parse(result);
  }
  ///////////////////////////////////////
  /**
   * Allocate a new file in heapfs
   * @returns fileId, to be used by fileWrite()
   */
  async fileAlloc(fileName, size) {
    const result = await this.pushTask({
      verb: "fs.alloc",
      args: [fileName, size],
      callbackId: this.taskId++
    });
    return result.fileId;
  }
  /**
   * Write a Blob to heapfs
   */
  async fileWrite(fileId, blob) {
    const reader = blob.stream().getReader();
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const size = value.byteLength;
      await this.pushTask(
        {
          verb: "fs.write",
          args: [fileId, value, offset],
          callbackId: this.taskId++
        },
        [value.buffer]
      );
      offset += size;
    }
  }
  /**
   * Parse JSON result returned by cpp code.
   * Throw new Error if "__exception" is present in the response
   */
  parseResult(result) {
    const parsedResult = JSON.parse(result);
    if (parsedResult && parsedResult["__exception"]) {
      throw new Error(parsedResult["__exception"]);
    }
    return parsedResult;
  }
  /**
   * Push a new task to taskQueue
   */
  pushTask(param, buffers) {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ resolve, reject, param, buffers });
      this.runTaskLoop();
    });
  }
  /**
   * Main loop for processing tasks
   */
  async runTaskLoop() {
    if (this.busy) {
      return;
    }
    this.busy = true;
    while (true) {
      const task = this.taskQueue.shift();
      if (!task) break;
      this.resultQueue.push(task);
      this.worker.postMessage(
        task.param,
        isSafariMobile() ? void 0 : {
          transfer: task.buffers ?? []
        }
      );
    }
    this.busy = false;
  }
  /**
   * Handle messages from worker
   */
  onRecvMsg(e) {
    if (!e.data) return;
    const { verb, args } = e.data;
    if (verb && verb.startsWith("console.")) {
      if (this.suppressNativeLog) {
        return;
      }
      if (verb.endsWith("debug")) this.logger.debug(...args);
      if (verb.endsWith("log")) this.logger.log(...args);
      if (verb.endsWith("warn")) this.logger.warn(...args);
      if (verb.endsWith("error")) this.logger.error(...args);
      return;
    } else if (verb === "signal.abort") {
      this.abort(args[0]);
    }
    const { callbackId, result, err } = e.data;
    if (callbackId) {
      const idx = this.resultQueue.findIndex(
        (t) => t.param.callbackId === callbackId
      );
      if (idx !== -1) {
        const waitingTask = this.resultQueue.splice(idx, 1)[0];
        if (err) waitingTask.reject(err);
        else waitingTask.resolve(result);
      } else {
        this.logger.error(
          `Cannot find waiting task with callbackId = ${callbackId}`
        );
      }
    }
  }
  abort(text) {
    while (this.resultQueue.length > 0) {
      const waitingTask = this.resultQueue.pop();
      if (!waitingTask) break;
      waitingTask.reject(
        new Error(
          `Received abort signal from llama.cpp; Message: ${text || "(empty)"}`
        )
      );
    }
  }
}

const PREFIX_METADATA = "__metadata__";
const POLYFILL_ETAG = "polyfill_for_older_version";
class CacheManager {
  /**
   * Convert a given URL into file name in cache.
   *
   * Format of the file name: `${hashSHA1(fullURL)}_${fileName}`
   */
  async getNameFromURL(url) {
    return await toFileName(url, "");
  }
  /**
   * Write a new file to cache. This will overwrite existing file.
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   */
  async write(name, stream, metadata) {
    this.writeMetadata(name, metadata);
    return await opfsWrite(name, stream);
  }
  /**
   * Open a file in cache for reading
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   * @returns ReadableStream, or null if file does not exist
   */
  async open(name) {
    return await opfsOpen(name);
  }
  /**
   * Get the size of a file in stored cache
   *
   * NOTE: in case the download is stopped mid-way (i.e. user close browser tab), the file maybe corrupted, size maybe different from `metadata.originalSize`
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   * @returns number of bytes, or -1 if file does not exist
   */
  async getSize(name) {
    return await opfsFileSize(name);
  }
  /**
   * Get metadata of a cached file
   */
  async getMetadata(name) {
    const stream = await opfsOpen(name, PREFIX_METADATA);
    const cachedSize = await this.getSize(name);
    if (!stream) {
      return cachedSize > 0 ? (
        // files created by older version of wllama doesn't have metadata, we will try to polyfill it
        {
          etag: POLYFILL_ETAG,
          originalSize: cachedSize,
          originalURL: ""
        }
      ) : (
        // if cached file not found, we don't have metadata at all
        null
      );
    }
    try {
      const meta = await new Response(stream).json();
      return meta;
    } catch (e) {
      return null;
    }
  }
  /**
   * List all files currently in cache
   */
  async list() {
    const cacheDir = await getCacheDir();
    const result = [];
    const metadataMap = {};
    for await (let [name, handler] of cacheDir.entries()) {
      if (handler.kind === "file" && name.startsWith(PREFIX_METADATA)) {
        const stream = (await handler.getFile()).stream();
        const meta = await new Response(stream).json().catch((_) => null);
        metadataMap[name.replace(PREFIX_METADATA, "")] = meta;
      }
    }
    for await (let [name, handler] of cacheDir.entries()) {
      if (handler.kind === "file" && !name.startsWith(PREFIX_METADATA)) {
        result.push({
          name,
          size: await handler.getFile().then((f) => f.size),
          metadata: metadataMap[name] || {
            // try to polyfill for old versions
            originalSize: (await handler.getFile()).size,
            originalURL: "",
            etag: ""
          }
        });
      }
    }
    return result;
  }
  /**
   * Clear all files currently in cache
   */
  async clear() {
    await this.deleteMany(() => true);
  }
  /**
   * Delete a single file in cache
   *
   * @param nameOrURL Can be either an URL or a name returned by `getNameFromURL()` or `list()`
   */
  async delete(nameOrURL) {
    const name2 = await this.getNameFromURL(nameOrURL);
    await this.deleteMany(
      (entry) => entry.name === nameOrURL || entry.name === name2
    );
  }
  /**
   * Delete multiple files in cache.
   *
   * @param predicate A predicate like `array.filter(item => boolean)`
   */
  async deleteMany(predicate) {
    const cacheDir = await getCacheDir();
    const list = await this.list();
    for (const item of list) {
      if (predicate(item)) {
        cacheDir.removeEntry(item.name);
      }
    }
  }
  /**
   * Write the metadata of the file to disk.
   *
   * This function is separated from `write()` for compatibility reason. In older version of wllama, there was no metadata for cached file, so when newer version of wllama loads a file created by older version, it will try to polyfill the metadata.
   */
  async writeMetadata(name, metadata) {
    const blob = new Blob([JSON.stringify(metadata)], { type: "text/plain" });
    await opfsWrite(name, blob.stream(), PREFIX_METADATA);
  }
}
async function opfsWrite(key, stream, prefix = "") {
  try {
    const cacheDir = await getCacheDir();
    const fileName = await toFileName(key, prefix);
    const writable = isSafari() ? await opfsWriteViaWorker(fileName) : await cacheDir.getFileHandle(fileName, { create: true }).then((h) => h.createWritable());
    await writable.truncate(0);
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
    }
    await writable.close();
  } catch (e) {
    console.error("opfsWrite", e);
  }
}
async function opfsOpen(key, prefix = "") {
  try {
    const cacheDir = await getCacheDir();
    const fileName = await toFileName(key, prefix);
    const fileHandler = await cacheDir.getFileHandle(fileName);
    const file = await fileHandler.getFile();
    return file.stream();
  } catch (e) {
    return null;
  }
}
async function opfsFileSize(key, prefix = "") {
  try {
    const cacheDir = await getCacheDir();
    const fileName = await toFileName(key, prefix);
    const fileHandler = await cacheDir.getFileHandle(fileName);
    const file = await fileHandler.getFile();
    return file.size;
  } catch (e) {
    return -1;
  }
}
async function toFileName(str, prefix) {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(str)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}${hashHex}_${str.split("/").pop()}`;
}
async function getCacheDir() {
  const opfsRoot = await navigator.storage.getDirectory();
  const cacheDir = await opfsRoot.getDirectoryHandle("cache", { create: true });
  return cacheDir;
}
const WORKER_CODE = `
const msg = (data) => postMessage(data);
let accessHandle;

onmessage = async (e) => {
  try {
    if (!e.data) return;
    const {
      open,  // name of file to open
      value, // value to be written
      done,  // indicates when to close the file
    } = e.data;

    if (open) {
      const opfsRoot = await navigator.storage.getDirectory();
      const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: true });
      const fileHandler = await cacheDir.getFileHandle(open, { create: true });
      accessHandle = await fileHandler.createSyncAccessHandle();
      accessHandle.truncate(0); // clear file content
      return msg({ ok: true });

    } else if (value) {
      accessHandle.write(value);
      return msg({ ok: true });

    } else if (done) {
      accessHandle.flush();
      accessHandle.close();
      return msg({ ok: true });
    }

    throw new Error('OPFS Worker: Invalid state');
  } catch (err) {
    return msg({ err });
  }
};
`;
async function opfsWriteViaWorker(fileName) {
  const workerURL = window.URL.createObjectURL(
    new Blob([WORKER_CODE], { type: "text/javascript" })
  );
  const worker = new Worker(workerURL);
  let pResolve;
  let pReject;
  worker.onmessage = (e) => {
    if (e.data.ok) pResolve(null);
    else if (e.data.err) pReject(e.data.err);
  };
  const workerExec = (data) => new Promise((resolve, reject) => {
    pResolve = resolve;
    pReject = reject;
    worker.postMessage(
      data,
      isSafariMobile() ? void 0 : {
        transfer: data.value ? [data.value.buffer] : []
      }
    );
  });
  await workerExec({ open: fileName });
  return {
    truncate: async () => {
    },
    write: (value) => workerExec({ value }),
    close: async () => {
      await workerExec({ done: true });
      worker.terminate();
    }
  };
}

class GGUFRemoteBlob extends Blob {
  constructor(url, start, end, full, customFetch, additionals) {
    super([]);
    this.contentType = "";
    if (start !== 0) {
      throw new Error("start range must be 0");
    }
    this.url = url;
    this.start = start;
    this.end = end;
    this.contentType = "";
    this.full = full;
    this.fetch = customFetch;
    this.cachedStream = additionals.cachedStream;
    this.progressCallback = additionals.progressCallback;
    this.startSignal = additionals.startSignal;
    this.etag = additionals.etag;
    this.noTEE = additionals.noTEE;
    this.cacheManager = additionals.cacheManager;
  }
  static async create(url, opts) {
    const { cacheManager } = opts;
    const customFetch = opts?.fetch ?? fetch;
    const cacheKey = url;
    let remoteFile;
    try {
      const response = await customFetch(url, { method: "HEAD" });
      remoteFile = {
        originalURL: url,
        originalSize: Number(response.headers.get("content-length")),
        etag: (response.headers.get("etag") || "").replace(/[^A-Za-z0-9]/g, "")
        // supportRange: response.headers.get('accept-ranges') === 'bytes';
      };
    } catch (err) {
      if (opts.allowOffline) {
        const cachedMeta = await cacheManager.getMetadata(cacheKey);
        if (cachedMeta) {
          remoteFile = cachedMeta;
        } else {
          throw new Error(
            "Network error, cannot find requested model in cache for using offline"
          );
        }
      } else {
        throw err;
      }
    }
    const cachedFileSize = await cacheManager.getSize(cacheKey);
    const cachedFile = await cacheManager.getMetadata(cacheKey);
    const skipCache = opts?.useCache === false;
    const metadataPolyfilled = cachedFile?.etag === POLYFILL_ETAG;
    if (metadataPolyfilled) {
      await cacheManager.writeMetadata(cacheKey, remoteFile);
    }
    const cachedFileValid = metadataPolyfilled || cachedFile && remoteFile.etag === cachedFile.etag && remoteFile.originalSize === cachedFileSize;
    if (cachedFileValid && !skipCache) {
      opts?.logger?.debug(`Using cached file ${cacheKey}`);
      const cachedFile2 = await cacheManager.open(cacheKey);
      (opts?.startSignal ?? Promise.resolve()).then(() => {
        opts?.progressCallback?.({
          loaded: cachedFileSize,
          total: cachedFileSize
        });
      });
      return new GGUFRemoteBlob(
        url,
        0,
        remoteFile.originalSize,
        true,
        customFetch,
        {
          cachedStream: cachedFile2,
          progressCallback: () => {
          },
          // unused
          etag: remoteFile.etag,
          noTEE: opts.noTEE,
          cacheManager
        }
      );
    } else {
      if (remoteFile.originalSize !== cachedFileSize) {
        opts?.logger?.debug(
          `Cache file is present, but size mismatch (cache = ${cachedFileSize} bytes, remote = ${remoteFile.originalSize} bytes)`
        );
      }
      if (cachedFile && remoteFile.etag !== cachedFile.etag) {
        opts?.logger?.debug(
          `Cache file is present, but ETag mismatch (cache = "${cachedFile.etag}", remote = "${remoteFile.etag}")`
        );
      }
      opts?.logger?.debug(`NOT using cache for ${cacheKey}`);
      return new GGUFRemoteBlob(
        url,
        0,
        remoteFile.originalSize,
        true,
        customFetch,
        {
          progressCallback: opts?.progressCallback ?? (() => {
          }),
          startSignal: opts?.startSignal,
          etag: remoteFile.etag,
          noTEE: opts.noTEE,
          cacheManager
        }
      );
    }
  }
  get size() {
    return this.end - this.start;
  }
  get type() {
    return this.contentType;
  }
  slice() {
    throw new Error("Unsupported operation");
  }
  async arrayBuffer() {
    throw new Error("Unsupported operation");
  }
  async text() {
    throw new Error("Unsupported operation");
  }
  stream() {
    if (this.cachedStream) {
      return this.cachedStream;
    }
    const self = this;
    let loaded = 0;
    const stream = new TransformStream({
      transform(chunk, controller) {
        if (!self.noTEE) {
          controller.enqueue(chunk);
        }
        loaded += chunk.byteLength;
        self.progressCallback({
          loaded,
          total: self.size
        });
      },
      // @ts-ignore unused variable
      flush(controller) {
        self.progressCallback({
          loaded: self.size,
          total: self.size
        });
      }
    });
    (async () => {
      if (this.startSignal) {
        await this.startSignal;
      }
      this.fetchRange().then((response) => {
        const [src0, src1] = response.body.tee();
        src0.pipeThrough(stream);
        this.cacheManager.write(this.url, src1, {
          originalSize: this.end,
          originalURL: this.url,
          etag: this.etag
        });
      }).catch((error) => stream.writable.abort(error.message));
    })();
    return stream.readable;
  }
  fetchRange() {
    const fetch2 = this.fetch;
    if (this.full) {
      return fetch2(this.url);
    }
    return fetch2(this.url, {
      headers: {
        Range: `bytes=${this.start}-${this.end - 1}`
      }
    });
  }
}

class MultiDownloads {
  constructor(logger, urls, maxParallel, cacheManager, opts) {
    this.totalBytes = 0;
    this.tasks = urls.map((url) => {
      const task = {
        url,
        state: 0 /* READY */,
        loaded: 0
      };
      task.signalStart = new Promise((resolve) => task.fireStart = resolve);
      task.signalEnd = new Promise((resolve) => task.fireEnd = resolve);
      return task;
    });
    this.logger = logger;
    this.maxParallel = maxParallel;
    this.progressCallback = opts.progressCallback;
    this.useCache = opts.useCache;
    this.allowOffline = opts.allowOffline;
    this.noTEE = !!opts.noTEE;
    this.cacheManager = cacheManager;
  }
  async run() {
    await Promise.all(
      this.tasks.map(async (task) => {
        task.blob = await GGUFRemoteBlob.create(task.url, {
          logger: this.logger,
          useCache: this.useCache,
          startSignal: task.signalStart,
          allowOffline: this.allowOffline,
          noTEE: this.noTEE,
          cacheManager: this.cacheManager,
          progressCallback: ({ loaded }) => {
            task.loaded = loaded;
            this.updateProgress(task);
          }
        });
      })
    );
    this.totalBytes = this.tasks.reduce((n, task) => n + task.blob.size, 0);
    for (let i = 0; i < this.maxParallel; i++) {
      this.dispatcher();
    }
    return this.tasks.map((t) => t.blob);
  }
  updateProgress(task) {
    const progress = {
      loaded: this.tasks.reduce((n, task2) => n + task2.loaded, 0),
      total: this.totalBytes
    };
    this.progressCallback?.(progress);
    if (task.loaded === task.blob.size) {
      task.state = 2 /* FINISHED */;
      task.fireEnd();
    }
  }
  async dispatcher() {
    while (true) {
      const task = this.tasks.find((t) => t.state === 0 /* READY */);
      if (!task) return;
      task.state = 1 /* WORKING */;
      task.fireStart();
      await task.signalEnd;
    }
  }
}

class WllamaError extends Error {
  constructor(message, type = "unknown_error") {
    super(message);
    this.type = type;
  }
}
class Wllama {
  constructor(pathConfig, wllamaConfig = {}) {
    this.proxy = null;
    this.useMultiThread = false;
    this.useEmbeddings = false;
    // available when loaded
    this.loadedContextInfo = null;
    this.bosToken = -1;
    this.eosToken = -1;
    this.eotToken = -1;
    this.addBosToken = false;
    this.addEosToken = false;
    this.samplingConfig = {};
    this.hasEncoder = false;
    this.decoderStartToken = -1;
    this.nCachedTokens = 0;
    checkEnvironmentCompatible();
    if (!pathConfig) throw new WllamaError("AssetsPathConfig is required");
    this.pathConfig = pathConfig;
    this.config = wllamaConfig;
    this.cacheManager = wllamaConfig.cacheManager ?? new CacheManager();
  }
  logger() {
    return this.config.logger ?? console;
  }
  checkModelLoaded() {
    if (!this.isModelLoaded()) {
      throw new WllamaError(
        "loadModel() is not yet called",
        "model_not_loaded"
      );
    }
  }
  /**
   * Check if the model is loaded via `loadModel()`
   */
  isModelLoaded() {
    return !!this.proxy && !!this.metadata;
  }
  /**
   * Get token ID associated to BOS (begin of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getBOS() {
    return this.bosToken;
  }
  /**
   * Get token ID associated to EOS (end of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOS() {
    return this.eosToken;
  }
  /**
   * Get token ID associated to EOT (end of turn) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOT() {
    return this.eotToken;
  }
  /**
   * Get token ID associated to token used by decoder, to start generating output sequence(only usable for encoder-decoder architecture). In other words, encoder uses normal BOS and decoder uses this token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getDecoderStartToken() {
    return this.decoderStartToken;
  }
  /**
   * Get model hyper-parameters and metadata
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns ModelMetadata
   */
  getModelMetadata() {
    this.checkModelLoaded();
    return this.metadata;
  }
  /**
   * Check if we're currently using multi-thread build.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isMultithread() {
    this.checkModelLoaded();
    return this.useMultiThread;
  }
  /**
   * Check if the current model uses encoder-decoder architecture
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isEncoderDecoderArchitecture() {
    this.checkModelLoaded();
    return this.hasEncoder;
  }
  /**
   * Must we add BOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if BOS token must be added to the sequence
   */
  mustAddBosToken() {
    this.checkModelLoaded();
    return this.addBosToken;
  }
  /**
   * Must we add EOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if EOS token must be added to the sequence
   */
  mustAddEosToken() {
    this.checkModelLoaded();
    return this.addEosToken;
  }
  /**
   * Get the jinja chat template comes with the model. It only available if the original model (before converting to gguf) has the template in `tokenizer_config.json`
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns the jinja template. null if there is no template in gguf
   */
  getChatTemplate() {
    this.checkModelLoaded();
    return this.chatTemplate ?? null;
  }
  /**
   * Parses a model URL and returns an array of URLs based on the following patterns:
   * - If the input URL is an array, it returns the array itself.
   * - If the input URL is a string in the `gguf-split` format, it returns an array containing the URL of each shard in ascending order.
   * - Otherwise, it returns an array containing the input URL as a single element array.
   * @param modelUrl URL or list of URLs
   */
  parseModelUrl(modelUrl) {
    if (Array.isArray(modelUrl)) {
      return modelUrl;
    }
    const urlPartsRegex = /(?<baseURL>.*)-(?<current>\d{5})-of-(?<total>\d{5})\.gguf$/;
    const matches = modelUrl.match(urlPartsRegex);
    if (!matches || !matches.groups || Object.keys(matches.groups).length !== 3) {
      return [modelUrl];
    }
    const { baseURL, total } = matches.groups;
    const paddedShardIds = Array.from(
      { length: Number(total) },
      (_, index) => (index + 1).toString().padStart(5, "0")
    );
    return paddedShardIds.map(
      (current) => `${baseURL}-${current}-of-${total}.gguf`
    );
  }
  /**
   * Download a model to cache, without loading it
   * @param modelUrl URL or list of URLs (in the correct order)
   * @param config
   */
  async downloadModel(modelUrl, config = {}) {
    if (modelUrl.length === 0) {
      throw new WllamaError(
        "modelUrl must be an URL or a list of URLs (in the correct order)",
        "download_error"
      );
    }
    if (config.useCache === false) {
      throw new WllamaError("useCache must not be false", "download_error");
    }
    const multiDownloads = new MultiDownloads(
      this.logger(),
      this.parseModelUrl(modelUrl),
      config.parallelDownloads ?? 3,
      this.cacheManager,
      {
        progressCallback: config.progressCallback,
        useCache: true,
        allowOffline: !!config.allowOffline,
        noTEE: true
      }
    );
    const blobs = await multiDownloads.run();
    await Promise.all(
      blobs.map(async (blob) => {
        const reader = blob.stream().getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) return;
        }
      })
    );
  }
  /**
   * Load model from a given URL (or a list of URLs, in case the model is splitted into smaller files)
   * - If the model already been downloaded (via `downloadModel()`), then we will use the cached model
   * - Else, we download the model from internet
   * @param modelUrl URL or list of URLs (in the correct order)
   * @param config
   */
  async loadModelFromUrl(modelUrl, config = {}) {
    if (modelUrl.length === 0) {
      throw new WllamaError(
        "modelUrl must be an URL or a list of URLs (in the correct order)",
        "load_error"
      );
    }
    const skipCache = config.useCache === false;
    const multiDownloads = new MultiDownloads(
      this.logger(),
      this.parseModelUrl(modelUrl),
      config.parallelDownloads ?? 3,
      this.cacheManager,
      {
        progressCallback: config.progressCallback,
        useCache: !skipCache,
        allowOffline: !!config.allowOffline
      }
    );
    const blobs = await multiDownloads.run();
    return await this.loadModel(blobs, config);
  }
  /**
   * Load model from a given list of Blob.
   *
   * You can pass multiple buffers into the function (in case the model contains multiple shards).
   *
   * @param ggufBlobs List of Blob that holds data of gguf file.
   * @param config LoadModelConfig
   */
  async loadModel(ggufBlobs, config = {}) {
    const blobs = [...ggufBlobs];
    if (blobs.some((b) => b.size === 0)) {
      throw new WllamaError(
        "Input model (or splits) must be non-empty Blob or File",
        "load_error"
      );
    }
    maybeSortFileByName(blobs);
    const hasMultipleBuffers = blobs.length > 1;
    if (this.proxy) {
      throw new WllamaError("Module is already initialized", "load_error");
    }
    const supportMultiThread = await isSupportMultiThread();
    if (!supportMultiThread) {
      this.logger().warn(
        "Multi-threads are not supported in this environment, falling back to single-thread"
      );
    }
    const hasPathMultiThread = !!this.pathConfig["multi-thread/wllama.js"] && !!this.pathConfig["multi-thread/wllama.wasm"] && !!this.pathConfig["multi-thread/wllama.worker.mjs"];
    if (!hasPathMultiThread) {
      this.logger().warn(
        'Missing paths to "wllama.js", "wllama.wasm" or "wllama.worker.mjs", falling back to single-thread'
      );
    }
    const hwConccurency = Math.floor((navigator.hardwareConcurrency || 1) / 2);
    const nbThreads = config.n_threads ?? hwConccurency;
    this.useMultiThread = supportMultiThread && hasPathMultiThread && nbThreads > 1;
    const mPathConfig = this.useMultiThread ? {
      "wllama.js": absoluteUrl(this.pathConfig["multi-thread/wllama.js"]),
      "wllama.wasm": absoluteUrl(
        this.pathConfig["multi-thread/wllama.wasm"]
      ),
      "wllama.worker.mjs": absoluteUrl(
        this.pathConfig["multi-thread/wllama.worker.mjs"]
      )
    } : {
      "wllama.js": absoluteUrl(this.pathConfig["single-thread/wllama.js"]),
      "wllama.wasm": absoluteUrl(
        this.pathConfig["single-thread/wllama.wasm"]
      )
    };
    this.proxy = new ProxyToWorker(
      mPathConfig,
      this.useMultiThread ? nbThreads : 1,
      this.config.suppressNativeLog ?? false,
      this.logger()
    );
    await this.proxy.moduleInit(
      blobs.map((blob, i) => ({
        name: hasMultipleBuffers ? `model-${padDigits(i + 1, 5)}-of-${padDigits(blobs.length, 5)}.gguf` : "model.gguf",
        blob
      }))
    );
    const startResult = await this.proxy.wllamaStart();
    if (!startResult.success) {
      throw new WllamaError(
        `Error while calling start function, result = ${startResult}`
      );
    }
    const loadResult = await this.proxy.wllamaAction(
      "load",
      {
        ...config,
        use_mmap: true,
        use_mlock: true,
        seed: config.seed || Math.floor(Math.random() * 1e5),
        n_ctx: config.n_ctx || 1024,
        n_threads: this.useMultiThread ? nbThreads : 1,
        model_path: hasMultipleBuffers ? `/models/model-00001-of-${padDigits(blobs.length, 5)}.gguf` : "/models/model.gguf"
      }
    );
    this.bosToken = loadResult.token_bos;
    this.eosToken = loadResult.token_eos;
    this.eotToken = loadResult.token_eot;
    this.useEmbeddings = !!config.embeddings;
    this.metadata = {
      hparams: {
        nVocab: loadResult.n_vocab,
        nCtxTrain: loadResult.n_ctx_train,
        nEmbd: loadResult.n_embd,
        nLayer: loadResult.n_layer
      },
      meta: loadResult.metadata
    };
    this.hasEncoder = !!loadResult.has_encoder;
    this.decoderStartToken = loadResult.token_decoder_start;
    this.addBosToken = loadResult.add_bos_token;
    this.addEosToken = loadResult.add_eos_token;
    this.chatTemplate = loadResult.metadata["tokenizer.chat_template"];
    this.loadedContextInfo = loadResult;
    this.logger().debug({ loadResult });
  }
  getLoadedContextInfo() {
    this.checkModelLoaded();
    if (!this.loadedContextInfo) {
      throw new WllamaError("Loaded context info is not available");
    }
    return { ...this.loadedContextInfo };
  }
  //////////////////////////////////////////////
  // High level API
  /**
   * Calculate embedding vector for a given text.
   * By default, BOS and EOS tokens will be added automatically. You can use the "skipBOS" and "skipEOS" option to disable it.
   * @param text Input text
   * @returns An embedding vector
   */
  async createEmbedding(text, options = {}) {
    this.checkModelLoaded();
    const opt = {
      skipBOS: false,
      skipEOS: false,
      ...options
    };
    await this.samplingInit(this.samplingConfig);
    await this.kvClear();
    const tokens = await this.tokenize(text);
    if (this.bosToken && !opt.skipBOS) {
      tokens.unshift(this.bosToken);
    }
    if (this.eosToken && !opt.skipEOS) {
      tokens.push(this.eosToken);
    }
    const result = await this.embeddings(tokens);
    return result;
  }
  /**
   * Make completion for a given text.
   * @param prompt Input text
   * @param options
   * @returns Output completion text (only the completion part)
   */
  async createCompletion(prompt, options) {
    this.checkModelLoaded();
    this.samplingConfig = options.sampling ?? {};
    await this.samplingInit(this.samplingConfig);
    const stopTokens = [
      this.eosToken,
      this.eotToken,
      ...options.stopTokens ?? []
    ];
    let tokens = await this.tokenize(prompt, true);
    if (this.addBosToken && tokens[0] !== this.bosToken) {
      tokens.unshift(this.bosToken);
    }
    if (options.useCache) {
      tokens = await this.computeNonCachedTokens(tokens);
    } else {
      await this.kvClear();
    }
    await this.samplingAccept(tokens);
    if (this.isEncoderDecoderArchitecture()) {
      await this.encode(tokens);
      await this.decode([this.getDecoderStartToken()], {});
    } else {
      await this.decode(tokens, {});
    }
    let outBuf = new Uint8Array();
    let abort = false;
    const abortSignal = () => {
      abort = true;
    };
    for (let i = 0; i < (options.nPredict ?? Infinity); i++) {
      const sampled = await this.samplingSample();
      if (stopTokens.includes(sampled.token)) {
        break;
      }
      outBuf = joinBuffers([outBuf, sampled.piece]);
      if (options.onNewToken) {
        options.onNewToken(sampled.token, sampled.piece, bufToText(outBuf), {
          abortSignal
        });
      }
      if (abort) {
        break;
      }
      await this.samplingAccept([sampled.token]);
      await this.decode([sampled.token], {});
    }
    return bufToText(outBuf);
  }
  //////////////////////////////////////////////
  // Low level API
  /**
   * Create or reset the ctx_sampling
   * @param config
   * @param pastTokens In case re-initializing the ctx_sampling, you can re-import past tokens into the new context
   */
  async samplingInit(config, pastTokens = []) {
    this.checkModelLoaded();
    this.samplingConfig = config;
    const result = await this.proxy.wllamaAction("sampling_init", {
      ...config,
      tokens: pastTokens
    });
    if (!result.success) {
      throw new WllamaError("Failed to initialize sampling");
    }
  }
  /**
   * Get a list of pieces in vocab.
   * NOTE: This function is slow, should only be used once.
   * @returns A list of Uint8Array. The nth element in the list associated to nth token in vocab
   */
  async getVocab() {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("get_vocab", {});
    return result.vocab.map((arr) => new Uint8Array(arr));
  }
  /**
   * Lookup to see if a token exist in vocab or not. Useful for searching special tokens like "<|im_start|>"
   * NOTE: It will match the whole token, so do not use it as a replacement for tokenize()
   * @param piece
   * @returns Token ID associated to the given piece. Returns -1 if cannot find the token.
   */
  async lookupToken(piece) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("lookup_token", { piece });
    if (!result.success) {
      return -1;
    } else {
      return result.token;
    }
  }
  /**
   * Convert a given text to list of tokens
   * @param text
   * @param special Should split special tokens?
   * @returns List of token ID
   */
  async tokenize(text, special = true) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction(
      "tokenize",
      special ? { text, special: true } : { text }
    );
    return result.tokens;
  }
  /**
   * Convert a list of tokens to text
   * @param tokens
   * @returns Uint8Array, which maybe an unfinished unicode
   */
  async detokenize(tokens) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("detokenize", { tokens });
    return new Uint8Array(result.buffer);
  }
  /**
   * Run llama_decode()
   * @param tokens A list of tokens to be decoded
   * @param options
   * @returns n_past (number of tokens so far in the sequence)
   */
  async decode(tokens, options) {
    this.checkModelLoaded();
    if (this.useEmbeddings) {
      throw new WllamaError(
        "embeddings is enabled. Use wllama.setOptions({ embeddings: false }) to disable it."
      );
    }
    if (tokens.length === 0) {
      return {
        nPast: this.nCachedTokens
      };
    }
    if (this.nCachedTokens + tokens.length > this.loadedContextInfo.n_ctx) {
      throw new WllamaError(
        "Running out of context cache. Please increase n_ctx when loading the model",
        "kv_cache_full"
      );
    }
    const batches = this.breakTokensIntoBatches(
      tokens,
      this.loadedContextInfo.n_batch
    );
    let result;
    for (let i = 0; i < batches.length; i++) {
      const isNotLast = batches.length > 1 && i < batches.length - 1;
      result = await this.proxy.wllamaAction("decode", {
        tokens: batches[i],
        skip_logits: options.skipLogits || isNotLast
      });
      if (result.error) {
        throw new WllamaError(result.error);
      } else if (!result.success) {
        throw new WllamaError("Cannot encode, unknown error");
      }
    }
    this.nCachedTokens = result.n_past;
    return { nPast: result.n_past };
  }
  /**
   * Run llama_encode()
   * @param tokens A list of tokens to be encoded
   * @param options Unused for now
   * @returns n_past (number of tokens so far in the sequence)
   */
  async encode(tokens, options) {
    this.checkModelLoaded();
    if (!this.hasEncoder) {
      throw new WllamaError(
        "This model does not use encoder-decoder architecture.",
        "inference_error"
      );
    }
    if (this.useEmbeddings) {
      throw new WllamaError(
        "embeddings is enabled. Use wllama.setOptions({ embeddings: false }) to disable it.",
        "inference_error"
      );
    }
    if (tokens.length === 0) {
      return {
        nPast: this.nCachedTokens
      };
    }
    if (this.nCachedTokens + tokens.length > this.loadedContextInfo.n_ctx) {
      throw new WllamaError(
        "Running out of context cache. Please increase n_ctx when loading the model",
        "kv_cache_full"
      );
    }
    const batches = this.breakTokensIntoBatches(
      tokens,
      this.loadedContextInfo.n_batch
    );
    let result;
    for (let i = 0; i < batches.length; i++) {
      result = await this.proxy.wllamaAction("encode", { tokens: batches[i] });
      if (result.error) {
        throw new WllamaError(result.error);
      } else if (!result.success) {
        throw new WllamaError("Cannot encode, unknown error");
      }
    }
    this.nCachedTokens = result.n_past;
    return { nPast: result.n_past };
  }
  breakTokensIntoBatches(tokens, maxBatchSize) {
    const batches = [];
    for (let i = 0; i < tokens.length; i += maxBatchSize) {
      batches.push(tokens.slice(i, i + maxBatchSize));
    }
    return batches;
  }
  /**
   * Sample a new token (remember to samplingInit() at least once before calling this function)
   * @returns the token ID and its detokenized value (which maybe an unfinished unicode)
   */
  async samplingSample() {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("sampling_sample", {});
    return {
      piece: new Uint8Array(result.piece),
      token: result.token
    };
  }
  /**
   * Accept and save a new token to ctx_sampling
   * @param tokens
   */
  async samplingAccept(tokens) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("sampling_accept", { tokens });
    if (!result.success) {
      throw new WllamaError("samplingAccept unknown error");
    }
  }
  /**
   * Get softmax-ed probability of logits, can be used for custom sampling
   * @param topK Get top K tokens having highest logits value. If topK == -1, we return all n_vocab logits, but this is not recommended because it's slow.
   */
  async getLogits(topK = 40) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("get_logits", { top_k: topK });
    const logits = result.logits;
    return logits.map(([token, p]) => ({ token, p }));
  }
  /**
   * Calculate embeddings for a given list of tokens. Output vector is always normalized
   * @param tokens
   * @returns A list of number represents an embedding vector of N dimensions
   */
  async embeddings(tokens) {
    this.checkModelLoaded();
    if (!this.useEmbeddings) {
      throw new WllamaError(
        "embeddings is disabled. Use wllama.setOptions({ embeddings: true }) to enable it.",
        "inference_error"
      );
    }
    if (this.nCachedTokens > 0) {
      this.logger().warn(
        "Embeddings: KV cache is not empty, this may produce incorrect results"
      );
    }
    if (this.nCachedTokens + tokens.length > this.loadedContextInfo.n_ctx) {
      throw new WllamaError(
        "Running out of context cache. Please increase n_ctx when loading the model",
        "kv_cache_full"
      );
    }
    if (tokens.length > this.loadedContextInfo.n_batch) {
      throw new WllamaError(
        "Embedding tokens does not fit into batch. Please increase n_batch when loading the model",
        "inference_error"
      );
    }
    if (tokens.length > this.loadedContextInfo.n_ubatch) {
      throw new WllamaError(
        "Embedding tokens does not fit into physical batch. Please increase n_ubatch when loading the model",
        "inference_error"
      );
    }
    const result = await this.proxy.wllamaAction("embeddings", { tokens });
    if (result.error) {
      throw new WllamaError(result.error);
    } else if (!result.success) {
      throw new WllamaError("embeddings unknown error");
    } else {
      return result.embeddings;
    }
  }
  /**
   * Remove and shift some tokens from KV cache.
   * Keep n_keep, remove n_discard then shift the rest
   * @param nKeep
   * @param nDiscard
   */
  async kvRemove(nKeep, nDiscard) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("kv_remove", {
      n_keep: nKeep,
      n_discard: nDiscard
    });
    if (!result.success) {
      throw new WllamaError("kvRemove unknown error");
    }
    this.nCachedTokens -= nDiscard;
  }
  /**
   * Clear all tokens in KV cache
   */
  async kvClear() {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("kv_clear", {});
    if (!result.success) {
      throw new WllamaError("kvClear unknown error");
    }
    this.nCachedTokens = 0;
  }
  /**
   * Save session to file (virtual file system)
   * TODO: add ability to download the file
   * @param filePath
   * @returns List of tokens saved to the file
   */
  async sessionSave(filePath) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("session_save", {
      session_path: filePath
    });
    return result;
  }
  /**
   * Load session from file (virtual file system)
   * TODO: add ability to download the file
   * @param filePath
   *
   */
  async sessionLoad(filePath) {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("session_load", {
      session_path: filePath
    });
    if (result.error) {
      throw new WllamaError(result.error);
    } else if (!result.success) {
      throw new WllamaError("sessionLoad unknown error");
    }
    const cachedTokens = await this.getCachedTokens();
    this.nCachedTokens = cachedTokens.length;
  }
  /**
   * Set options for underlaying llama_context
   */
  async setOptions(opt) {
    this.checkModelLoaded();
    await this.proxy.wllamaAction("set_options", opt);
    this.useEmbeddings = opt.embeddings;
  }
  /**
   * Unload the model and free all memory.
   *
   * Note: This function will NOT crash if model is not yet loaded
   */
  async exit() {
    await this.proxy?.wllamaExit();
  }
  /**
   * get debug info
   */
  async _getDebugInfo() {
    this.checkModelLoaded();
    return await this.proxy.wllamaDebug();
  }
  ///// Prompt cache utils /////
  async getCachedTokens() {
    this.checkModelLoaded();
    const result = await this.proxy.wllamaAction("current_status", {});
    return result.tokens;
  }
  /**
   * Compare the input sequence and cachedToken, then return the part that is not in cache.
   * This function also remove mismatch part in cache (via kvRemove)
   */
  async computeNonCachedTokens(seq) {
    const cachedTokens = await this.getCachedTokens();
    let nKeep = 0;
    for (; nKeep < Math.min(cachedTokens.length, seq.length); nKeep++) {
      if (cachedTokens[nKeep] !== seq[nKeep]) {
        break;
      }
    }
    const nDiscard = cachedTokens.length - nKeep;
    this.logger().debug(`Cache nKeep=${nKeep} nDiscard=${nDiscard}`);
    if (nDiscard > 0) {
      await this.kvRemove(nKeep, nDiscard);
    }
    return seq.slice(nKeep, seq.length);
  }
  // TODO: add current_status
}

async function detectWasmFeatures() {
  try {
    const simd = await WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    const threads = typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined" && crossOriginIsolated;
    const bulkMemory = await WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5, 3, 1, 0, 1, 10, 14, 1, 12, 0, 65, 0, 65, 0, 65, 0, 252, 10, 0, 11]));
    console.log("🔍 WASM Features detected:", {
      simd: simd ? "✅" : "❌",
      threads: threads ? "✅" : "❌",
      bulkMemory: bulkMemory ? "✅" : "❌"
    });
    if (!threads && typeof SharedArrayBuffer !== "undefined") {
      console.warn("⚠️ SharedArrayBuffer available but crossOriginIsolated=false. Add COOP/COEP headers to enable threads:\nCross-Origin-Opener-Policy: same-origin\nCross-Origin-Embedder-Policy: require-corp");
    }
    return {
      simd,
      threads,
      bulkMemory
    };
  } catch (error) {
    console.error("❌ Failed to detect WASM features:", error);
    return {
      simd: false,
      threads: false,
      bulkMemory: false
    };
  }
}
function getRecommendedWllamaBuild(features) {
  if (features.threads && features.simd) {
    return {
      path: "multi-thread/wllama.wasm",
      description: "Multi-threaded + SIMD (fastest)",
      speedMultiplier: 3
    };
  }
  if (features.simd) {
    return {
      path: "single-thread/wllama.wasm",
      description: "Single-threaded + SIMD",
      speedMultiplier: 2
    };
  }
  return {
    path: "single-thread/wllama.wasm",
    description: "Basic (no SIMD)",
    speedMultiplier: 1
  };
}
function getOptimalThreadCount(features) {
  if (!features.threads) return 1;
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(2, Math.min(8, Math.floor(cores * 0.75)));
}

class WllamaEngine {
  wllama = null;
  modelUrl = "";
  isInitialized = false;
  constructor() {
    console.log("🤖 Wllama Engine created (Pure WASM CPU backend)");
  }
  /**
   * Initialize the Wllama engine with a GGUF model
   * Uses small quantized models optimized for CPU
   */
  async initialize(modelUrl, onProgress) {
    if (this.isInitialized && this.modelUrl === modelUrl) {
      console.log("✅ Wllama already initialized");
      return;
    }
    try {
      console.log("🚀 Initializing Wllama (WebAssembly CPU)...");
      onProgress?.(0, "Inicializando motor WASM...");
      const wasmFeatures = await detectWasmFeatures();
      const recommendedBuild = getRecommendedWllamaBuild(wasmFeatures);
      const optimalThreads = getOptimalThreadCount(wasmFeatures);
      console.log(`🎯 Using ${recommendedBuild.description} (${recommendedBuild.speedMultiplier}x speed)`);
      console.log(`🧵 Using ${optimalThreads} threads`);
      const defaultModelUrl = modelUrl || "https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf";
      this.modelUrl = defaultModelUrl;
      const isMultiThread = recommendedBuild.path.includes("multi-thread");
      const basePath = isMultiThread ? "/wllama/multi-thread/wllama" : "/wllama/single-thread/wllama";
      const config = {
        "single-thread/wllama.wasm": basePath + ".wasm",
        "single-thread/wllama.js": basePath + ".js"
      };
      if (isMultiThread) {
        config["multi-thread/wllama.wasm"] = basePath + ".wasm";
        config["multi-thread/wllama.js"] = basePath + ".js";
        config["multi-thread/wllama.worker.mjs"] = "/wllama/multi-thread/wllama.worker.mjs";
      }
      this.wllama = new Wllama(config);
      onProgress?.(10, "Descargando modelo (se guardará en caché)...");
      await this.wllama.loadModelFromUrl(this.modelUrl, {
        n_ctx: 2048,
        embeddings: true,
        // Enable embeddings support
        n_threads: optimalThreads,
        // Use optimal thread count
        progressCallback: ({
          loaded,
          total
        }) => {
          if (total > 0) {
            const percent = Math.round(loaded / total * 70);
            const loadedMB = Math.round(loaded / 1024 / 1024);
            const totalMB = Math.round(total / 1024 / 1024);
            onProgress?.(10 + percent, `Descargando: ${loadedMB}MB / ${totalMB}MB`);
          }
        }
      });
      onProgress?.(95, "Modelo procesado...");
      this.isInitialized = true;
      console.log("✅ Wllama initialized successfully (WASM/CPU)");
      onProgress?.(100, "Modelo cargado (CPU)");
    } catch (error) {
      console.error("❌ Failed to initialize Wllama:", error);
      this.isInitialized = false;
      throw new Error(`Failed to initialize Wllama: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  /**
   * Generate embeddings for a text (for semantic search)
   * Wllama supports embeddings natively
   */
  async generateEmbedding(text) {
    if (!this.isInitialized || !this.wllama) {
      throw new Error("Wllama engine not initialized");
    }
    try {
      const maxLength = 256;
      const truncatedText = text.length > maxLength ? text.substring(0, maxLength) : text;
      if (text.length > maxLength) {
        console.log(`⚠️ Truncating text from ${text.length} to ${maxLength} chars for embedding`);
      }
      console.log(`🔢 Generating embedding for ${truncatedText.length} chars...`);
      const startTime = Date.now();
      const result = await this.wllama.createEmbedding(truncatedText);
      const elapsed = Date.now() - startTime;
      console.log(`✅ Embedding generated in ${elapsed}ms`);
      return result;
    } catch (error) {
      console.error("❌ Wllama embedding failed:", error);
      throw error;
    }
  }
  /**
   * Generate text response using Wllama
   * Supports streaming for better UX
   */
  async generateText(prompt, options = {}) {
    if (!this.isInitialized || !this.wllama) {
      throw new Error("Wllama engine not initialized");
    }
    const {
      temperature = 0.7,
      maxTokens = 512,
      onStream
    } = options;
    try {
      console.log("💬 Generating text with Wllama (CPU)...");
      await this.wllama.setOptions({
        embeddings: false
      });
      let fullResponse = "";
      if (onStream) {
        await this.wllama.createCompletion(prompt, {
          nPredict: maxTokens,
          temp: temperature,
          onNewToken: (_token, _piece, currentText) => {
            const newChunk = currentText.slice(fullResponse.length);
            if (newChunk) {
              fullResponse = currentText;
              onStream(newChunk);
            }
          }
        });
      } else {
        const result = await this.wllama.createCompletion(prompt, {
          nPredict: maxTokens,
          temp: temperature
        });
        fullResponse = result;
      }
      await this.wllama.setOptions({
        embeddings: true
      });
      console.log("✅ Generated", fullResponse.length, "characters (CPU)");
      return fullResponse;
    } catch (error) {
      console.error("❌ Text generation failed:", error);
      throw new Error(`Failed to generate text: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  /**
   * Generate embeddings in batch (parallel processing with concurrency limit)
   */
  async generateEmbeddingsBatch(texts, maxConcurrent = 4, onProgress) {
    if (!this.isInitialized || !this.wllama) {
      throw new Error("Wllama engine not initialized");
    }
    console.log(`🔢 Generating ${texts.length} embeddings in batch (concurrency=${maxConcurrent})...`);
    const results = new Array(texts.length);
    const queue = texts.map((text, idx) => ({
      text,
      idx
    }));
    let completed = 0;
    const workers = Array(maxConcurrent).fill(null).map(async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const {
          text,
          idx
        } = item;
        const truncated = text.substring(0, 256);
        try {
          const embedding = await this.wllama.createEmbedding(truncated);
          results[idx] = embedding;
        } catch (error) {
          console.warn(`⚠️ Failed to generate embedding for text ${idx}:`, error);
          results[idx] = new Float32Array(384);
        }
        completed++;
        if (completed % 5 === 0 || completed === texts.length) {
          const progress = Math.round(completed / texts.length * 100);
          onProgress?.(progress, `Embeddings: ${completed}/${texts.length}`);
        }
      }
    });
    await Promise.all(workers);
    console.log(`✅ Generated ${texts.length} embeddings in batch`);
    return results;
  }
  /**
   * Get the current backend being used
   */
  getBackend() {
    return "wasm";
  }
  /**
   * Check if the engine is initialized
   */
  isReady() {
    return this.isInitialized && this.wllama !== null;
  }
  /**
   * Get the current model URL
   */
  getModelUrl() {
    return this.modelUrl;
  }
  /**
   * Reset/unload the model (free memory)
   */
  async reset() {
    if (this.wllama) {
      console.log("🔄 Resetting Wllama engine...");
      try {
        await this.wllama.exit();
      } catch (error) {
        console.warn("Error during Wllama exit:", error);
      }
      this.wllama = null;
      this.isInitialized = false;
      this.modelUrl = "";
      console.log("✅ Wllama engine reset");
    }
  }
}

class EngineManager {
  static chatEngineInstance = null;
  static embeddingEngineInstance = null;
  static chatModelName = "";
  static embeddingModelName = "";
  /**
   * Initialize or get the chat engine (WebLLM)
   * Returns existing instance if already initialized with same model
   */
  static async getChatEngine(modelName, onProgress) {
    if (!this.chatEngineInstance) {
      console.log("🆕 Creating new WebLLM chat engine instance");
      this.chatEngineInstance = new WebLLMEngine();
    }
    if (modelName && modelName !== this.chatModelName) {
      console.log(`🔄 Initializing chat engine with model: ${modelName}`);
      await this.chatEngineInstance.initialize(modelName, onProgress);
      this.chatModelName = modelName;
    }
    if (!this.chatEngineInstance.isReady()) {
      throw new Error("Chat engine not initialized. Please load the chat model first from Model Selector.");
    }
    return this.chatEngineInstance;
  }
  /**
   * Initialize or get the embedding engine (Wllama)
   * Returns existing instance if already initialized
   */
  static async getEmbeddingEngine(modelName, onProgress) {
    if (!this.embeddingEngineInstance) {
      console.log("🆕 Creating new Wllama embedding engine instance");
      this.embeddingEngineInstance = new WllamaEngine();
    }
    if (modelName && modelName !== this.embeddingModelName) {
      console.log(`🔄 Initializing embedding engine with model: ${modelName || "default"}`);
      await this.embeddingEngineInstance.initialize(modelName, onProgress);
      this.embeddingModelName = modelName || "default";
    }
    if (!this.embeddingEngineInstance.isReady()) {
      throw new Error("Embedding engine not initialized. Please load the embedding model first from Model Selector.");
    }
    return this.embeddingEngineInstance;
  }
  /**
   * Check if chat engine is ready
   */
  static isChatEngineReady() {
    return this.chatEngineInstance?.isReady() ?? false;
  }
  /**
   * Check if embedding engine is ready
   */
  static isEmbeddingEngineReady() {
    return this.embeddingEngineInstance?.isReady() ?? false;
  }
  /**
   * Set the chat engine instance (called by ModelSelector after initialization)
   */
  static setChatEngine(engine, modelName) {
    this.chatEngineInstance = engine;
    this.chatModelName = modelName;
    console.log("✅ Chat engine instance registered:", modelName);
  }
  /**
   * Set the embedding engine instance (called by ModelSelector after initialization)
   */
  static setEmbeddingEngine(engine, modelName) {
    this.embeddingEngineInstance = engine;
    this.embeddingModelName = modelName;
    console.log("✅ Embedding engine instance registered:", modelName);
  }
  /**
   * Reset chat engine (free memory)
   */
  static async resetChatEngine() {
    if (this.chatEngineInstance) {
      await this.chatEngineInstance.reset();
      this.chatEngineInstance = null;
      this.chatModelName = "";
      console.log("🔄 Chat engine reset");
    }
  }
  /**
   * Reset embedding engine (free memory)
   */
  static async resetEmbeddingEngine() {
    if (this.embeddingEngineInstance) {
      await this.embeddingEngineInstance.reset();
      this.embeddingEngineInstance = null;
      this.embeddingModelName = "";
      console.log("🔄 Embedding engine reset");
    }
  }
  /**
   * Reset all engines
   */
  static async resetAll() {
    await Promise.all([this.resetChatEngine(), this.resetEmbeddingEngine()]);
    console.log("🔄 All engines reset");
  }
  /**
   * Get current model names
   */
  static getModelNames() {
    return {
      chat: this.chatModelName,
      embedding: this.embeddingModelName
    };
  }
}

const DEFAULT_SETTINGS = {
  chunkSize: 512,
  chunkOverlap: 50,
  topK: 5,
  temperature: 0.7,
  maxTokens: 2048,
  theme: "auto",
  // Web search defaults
  enableWebSearch: true,
  // Enabled by default - show the toggle
  webSearchSources: ["wikipedia", "duckduckgo"],
  // Both providers
  webSearchMaxUrls: 3
  // Max 3 URLs to fetch
};
async function getSetting(key) {
  const db = await getDB();
  const value = await db.get("settings", key);
  return value !== void 0 ? value : DEFAULT_SETTINGS[key];
}
async function getRAGSettings() {
  const [chunkSize, chunkOverlap, topK] = await Promise.all([getSetting("chunkSize"), getSetting("chunkOverlap"), getSetting("topK")]);
  return {
    chunkSize,
    chunkOverlap,
    topK
  };
}
async function getWebSearchSettings() {
  const [enableWebSearch, webSearchSources, webSearchMaxUrls] = await Promise.all([getSetting("enableWebSearch"), getSetting("webSearchSources"), getSetting("webSearchMaxUrls")]);
  return {
    enableWebSearch: enableWebSearch ?? false,
    webSearchSources: webSearchSources ?? ["wikipedia"],
    webSearchMaxUrls: webSearchMaxUrls ?? 3
  };
}

class WikipediaSearchProvider {
  name = "wikipedia";
  baseUrls = {
    es: "https://es.wikipedia.org/w/api.php",
    en: "https://en.wikipedia.org/w/api.php"
  };
  defaultLanguage = "es";
  timeout = 1e4;
  // 10 segundos
  /**
   * Detecta si estamos en localhost (solo en cliente)
   */
  isLocalhost() {
    if (typeof window === "undefined") return false;
    return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  }
  /**
   * Obtiene el proxy CORS si es necesario
   */
  getCorsProxy() {
    return "https://aiproxy.inled.es/?url=";
  }
  /**
   * Realiza búsqueda en Wikipedia
   */
  async search(query, options = {}) {
    const {
      maxResults = 10,
      language = this.defaultLanguage,
      timeout = this.timeout
    } = options;
    const baseUrl = this.baseUrls[language] || this.baseUrls.es;
    const params = new URLSearchParams({
      action: "opensearch",
      search: query,
      limit: String(Math.min(maxResults, 10)),
      // Wikipedia limita a 10
      namespace: "0",
      // Solo artículos
      format: "json",
      origin: "*"
      // Habilitar CORS
    });
    const fullUrl = `${baseUrl}?${params}`;
    const corsProxy = this.getCorsProxy();
    const url = `${corsProxy}${encodeURIComponent(fullUrl)}`;
    console.log(`[Wikipedia] Using proxy, target: ${fullUrl.substring(0, 80)}...`);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "Accept": "application/json"
        }
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`Wikipedia API returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      if (!Array.isArray(data) || data.length < 4) {
        throw new Error("Invalid Wikipedia API response format");
      }
      const [, titles, snippets, urls] = data;
      const results = titles.map((title, i) => ({
        title: title || "Sin título",
        snippet: snippets[i] || "",
        url: urls[i] || "",
        source: "wikipedia",
        fetchedAt: Date.now()
      }));
      return results;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Wikipedia search timed out");
      }
      throw error;
    }
  }
  /**
   * Verifica si Wikipedia está disponible
   */
  async isAvailable() {
    return true;
  }
}
class DuckDuckGoSearchProvider {
  name = "duckduckgo";
  timeout = 1e4;
  // 10 segundos
  /**
   * Detecta si estamos en localhost (solo en cliente)
   */
  isLocalhost() {
    if (typeof window === "undefined") return false;
    return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  }
  /**
   * Obtiene el proxy CORS si es necesario
   */
  getCorsProxy() {
    return "https://aiproxy.inled.es/?url=";
  }
  /**
   * Realiza búsqueda en DuckDuckGo
   *
   * Usa la versión Lite de DuckDuckGo que soporta GET
   */
  async search(query, options = {}) {
    const {
      maxResults = 10,
      timeout = this.timeout
    } = options;
    const params = new URLSearchParams({
      q: query,
      kl: "wt-wt"
      // Región (wt-wt = mundial)
    });
    const fullUrl = `https://lite.duckduckgo.com/lite/?${params}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const corsProxy = this.getCorsProxy();
      const url = `${corsProxy}${encodeURIComponent(fullUrl)}`;
      console.log(`[DuckDuckGo] Using proxy, target: ${fullUrl.substring(0, 80)}...`);
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "Accept": "text/html"
        }
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`DuckDuckGo returned ${response.status}: ${response.statusText}`);
      }
      const html = await response.text();
      const results = this.parseResults(html);
      return results.slice(0, maxResults);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error("DuckDuckGo search timed out");
        }
        if (error.message.includes("CORS") || error.message.includes("blocked")) {
          throw new Error("DuckDuckGo blocked by CORS - use Wikipedia instead");
        }
      }
      throw error;
    }
  }
  /**
   * Parse HTML de resultados de DuckDuckGo Lite
   */
  parseResults(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const results = [];
    const rows = doc.querySelectorAll("tr");
    rows.forEach((row) => {
      try {
        const linkElement = row.querySelector("a.result-link");
        if (!linkElement) return;
        const title = linkElement.textContent?.trim() || "";
        const href = linkElement.getAttribute("href") || "";
        const url = this.extractUrl(href);
        const snippetElement = row.querySelector(".result-snippet");
        const snippet = snippetElement?.textContent?.trim() || "";
        if (title && url) {
          results.push({
            title,
            snippet,
            url,
            source: "duckduckgo",
            fetchedAt: Date.now()
          });
        }
      } catch (error) {
        console.warn("Failed to parse DuckDuckGo result:", error);
      }
    });
    return results;
  }
  /**
   * Extrae URL real de un link de DuckDuckGo
   * (DuckDuckGo envuelve URLs en redirects)
   */
  extractUrl(href) {
    if (!href) return "";
    try {
      if (href.includes("//duckduckgo.com/l/") || href.includes("//lite.duckduckgo.com/lite/")) {
        const url = new URL(href.startsWith("//") ? "https:" + href : href);
        const uddg = url.searchParams.get("uddg");
        if (uddg) {
          return decodeURIComponent(uddg);
        }
      }
      if (href.startsWith("http://") || href.startsWith("https://")) {
        return href;
      }
      if (href.startsWith("//")) {
        return "https:" + href;
      }
      return "";
    } catch {
      return "";
    }
  }
  /**
   * Verifica si DuckDuckGo está disponible
   */
  async isAvailable() {
    return true;
  }
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const params = new URLSearchParams(parsed.search);
    const sortedParams = new URLSearchParams(Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)));
    parsed.search = sortedParams.toString();
    return parsed.toString();
  } catch {
    return url;
  }
}
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

class WebSearchService {
  providers = /* @__PURE__ */ new Map();
  searchCache = /* @__PURE__ */ new Map();
  rateLimits = /* @__PURE__ */ new Map();
  // Configuración
  cacheTTL = 5 * 60 * 1e3;
  // 5 minutos
  rateLimitWindow = 60 * 1e3;
  // 1 minuto
  maxRequestsPerWindow = 10;
  // 10 requests/minuto por provider
  constructor(providers) {
    if (providers && providers.length > 0) {
      providers.forEach((p) => this.providers.set(p.name, p));
    } else {
      this.providers.set("wikipedia", new WikipediaSearchProvider());
      this.providers.set("duckduckgo", new DuckDuckGoSearchProvider());
    }
    setInterval(() => this.cleanupCache(), this.cacheTTL);
  }
  /**
   * Realiza búsqueda web coordinando múltiples providers
   */
  async search(query, options = {}) {
    const {
      maxResults = 10,
      sources,
      timeout = 1e4
    } = options;
    if (!query || query.trim().length === 0) {
      throw new Error("Search query cannot be empty");
    }
    const normalizedQuery = query.trim().toLowerCase();
    if (options.timeout !== 0) {
      const cached = this.getCachedResults(normalizedQuery);
      if (cached) {
        console.log(`[WebSearch] Cache hit for query: "${query}"`);
        return cached.slice(0, maxResults);
      }
    }
    const providersToUse = sources ? sources.map((s) => this.providers.get(s)).filter(Boolean) : Array.from(this.providers.values());
    if (providersToUse.length === 0) {
      throw new Error("No search providers available");
    }
    const results = await this.searchParallel(query, providersToUse, {
      ...options,
      maxResults,
      timeout
    });
    const deduplicated = this.deduplicateResults(results);
    this.cacheResults(normalizedQuery, deduplicated);
    return deduplicated.slice(0, maxResults);
  }
  /**
   * Busca en múltiples providers en paralelo
   */
  async searchParallel(query, providers, options) {
    const searchPromises = providers.map(async (provider) => {
      try {
        if (!this.checkRateLimit(provider.name)) {
          console.warn(`[WebSearch] Rate limit exceeded for ${provider.name}`);
          return [];
        }
        const isAvailable = await provider.isAvailable();
        if (!isAvailable) {
          console.warn(`[WebSearch] Provider ${provider.name} is not available`);
          return [];
        }
        console.log(`[WebSearch] Searching with ${provider.name}...`);
        const results = await provider.search(query, options);
        this.recordRequest(provider.name);
        console.log(`[WebSearch] ${provider.name} returned ${results.length} results`);
        return results;
      } catch (error) {
        console.error(`[WebSearch] Provider ${provider.name} failed:`, error);
        return [];
      }
    });
    const resultsArrays = await Promise.all(searchPromises);
    return resultsArrays.flat();
  }
  /**
   * Deduplicar resultados por URL normalizada
   */
  deduplicateResults(results) {
    const seen = /* @__PURE__ */ new Map();
    for (const result of results) {
      try {
        const normalizedUrl = normalizeUrl(result.url);
        if (!seen.has(normalizedUrl)) {
          seen.set(normalizedUrl, result);
        } else {
          const existing = seen.get(normalizedUrl);
          if (result.snippet.length > existing.snippet.length) {
            seen.set(normalizedUrl, result);
          }
        }
      } catch {
        continue;
      }
    }
    return Array.from(seen.values());
  }
  /**
   * Obtiene resultados cacheados si están vigentes
   */
  getCachedResults(query) {
    const cacheKey = this.getCacheKey(query);
    const cached = this.searchCache.get(cacheKey);
    if (!cached) {
      return null;
    }
    const now = Date.now();
    if (now - cached.cachedAt > cached.ttl) {
      this.searchCache.delete(cacheKey);
      return null;
    }
    return cached.results;
  }
  /**
   * Cachea resultados de búsqueda
   */
  cacheResults(query, results) {
    const cacheKey = this.getCacheKey(query);
    this.searchCache.set(cacheKey, {
      query,
      results,
      cachedAt: Date.now(),
      ttl: this.cacheTTL
    });
  }
  /**
   * Genera key de cache para una query
   */
  getCacheKey(query) {
    return `search:${simpleHash(query.toLowerCase())}`;
  }
  /**
   * Limpia cache de búsquedas expiradas
   */
  cleanupCache() {
    const now = Date.now();
    const keysToDelete = [];
    this.searchCache.forEach((cached, key) => {
      if (now - cached.cachedAt > cached.ttl) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => this.searchCache.delete(key));
    if (keysToDelete.length > 0) {
      console.log(`[WebSearch] Cleaned up ${keysToDelete.length} expired cache entries`);
    }
  }
  /**
   * Verifica rate limit para un provider
   */
  checkRateLimit(providerName) {
    const state = this.rateLimits.get(providerName);
    if (!state) {
      return true;
    }
    const now = Date.now();
    const windowStart = now - this.rateLimitWindow;
    const recentRequests = state.requests.filter((t) => t > windowStart);
    return recentRequests.length < this.maxRequestsPerWindow;
  }
  /**
   * Registra un request para rate limiting
   */
  recordRequest(providerName) {
    const now = Date.now();
    const windowStart = now - this.rateLimitWindow;
    let state = this.rateLimits.get(providerName);
    if (!state) {
      state = {
        domain: providerName,
        requests: [],
        nextAllowedAt: now
      };
      this.rateLimits.set(providerName, state);
    }
    state.requests = state.requests.filter((t) => t > windowStart);
    state.requests.push(now);
    if (state.requests.length >= this.maxRequestsPerWindow) {
      const oldestRequest = Math.min(...state.requests);
      state.nextAllowedAt = oldestRequest + this.rateLimitWindow;
    }
  }
  /**
   * Limpia el cache manualmente
   */
  clearCache() {
    this.searchCache.clear();
    console.log("[WebSearch] Cache cleared");
  }
  /**
   * Obtiene estadísticas del servicio
   */
  getStats() {
    return {
      cacheSize: this.searchCache.size,
      providers: Array.from(this.providers.keys()),
      rateLimits: Array.from(this.rateLimits.entries()).map(([provider, state]) => ({
        provider,
        recentRequests: state.requests.length,
        nextAllowedAt: state.nextAllowedAt
      }))
    };
  }
  /**
   * Registra un provider personalizado
   */
  registerProvider(provider) {
    this.providers.set(provider.name, provider);
    console.log(`[WebSearch] Registered provider: ${provider.name}`);
  }
  /**
   * Elimina un provider
   */
  unregisterProvider(name) {
    this.providers.delete(name);
    console.log(`[WebSearch] Unregistered provider: ${name}`);
  }
}
new WebSearchService();

const DEFAULT_SELECTORS_TO_REMOVE = [
  // Scripts y estilos
  "script",
  "style",
  "noscript",
  // Navegación y estructura
  "nav",
  "header",
  "footer",
  "aside",
  "menu",
  // Roles ARIA
  '[role="navigation"]',
  '[role="banner"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
  // Publicidad y tracking
  ".ad",
  ".ads",
  ".advertisement",
  '[class*="advert"]',
  '[id*="advert"]',
  ".sponsored",
  ".social-share",
  ".share-buttons",
  // UI elements
  ".sidebar",
  ".cookie-notice",
  ".cookie-banner",
  ".newsletter",
  ".popup",
  ".modal",
  ".breadcrumb",
  // Comments
  ".comments",
  "#comments",
  ".comment-section",
  // SVG y canvas (no son texto)
  "svg",
  "canvas",
  // Forms (generalmente no relevantes para contenido)
  "form",
  "button"
];
const BLOCK_LEVEL_TAGS = /* @__PURE__ */ new Set(["p", "div", "section", "article", "li", "blockquote", "pre", "hr", "br"]);
const HEADING_TAGS = /* @__PURE__ */ new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
class ContentExtractor {
  /**
   * Extrae contenido limpio de HTML
   */
  extract(html, url, options = {}) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    if (!doc.body) {
      throw new Error("Invalid HTML: no body element");
    }
    this.removeUnwantedElements(doc, options);
    const title = this.extractTitle(doc);
    const metadata = this.extractMetadata(doc);
    const text = this.extractMainContent(doc, options);
    const wordCount = this.countWords(text);
    return {
      text,
      title,
      url,
      extractedAt: Date.now(),
      wordCount,
      metadata
    };
  }
  /**
   * Elimina elementos no deseados del documento
   */
  removeUnwantedElements(doc, options) {
    const selectorsToRemove = [...DEFAULT_SELECTORS_TO_REMOVE, ...options.customSelectorsToRemove || []];
    selectorsToRemove.forEach((selector) => {
      try {
        doc.querySelectorAll(selector).forEach((el) => el.remove());
      } catch (error) {
        console.warn(`Invalid selector: ${selector}`, error);
      }
    });
    doc.querySelectorAll('[hidden], [style*="display:none"], [style*="display: none"]').forEach((el) => el.remove());
    doc.querySelectorAll("[onclick], [onload], [onerror]").forEach((el) => {
      el.removeAttribute("onclick");
      el.removeAttribute("onload");
      el.removeAttribute("onerror");
    });
  }
  /**
   * Extrae el título de la página
   */
  extractTitle(doc) {
    const h1 = doc.querySelector("h1");
    if (h1) {
      const text = h1.textContent?.trim();
      if (text && text.length > 0 && text.length < 200) {
        return text;
      }
    }
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim();
    if (ogTitle && ogTitle.length > 0) {
      return ogTitle;
    }
    const twitterTitle = doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content")?.trim();
    if (twitterTitle && twitterTitle.length > 0) {
      return twitterTitle;
    }
    const title = doc.querySelector("title")?.textContent?.trim();
    if (title && title.length > 0) {
      return title.split(/[|•·]|( - )|( – )/)[0].trim();
    }
    return "Sin título";
  }
  /**
   * Extrae metadata de la página
   */
  extractMetadata(doc) {
    const metadata = {};
    const author = doc.querySelector('meta[name="author"]')?.getAttribute("content") || doc.querySelector('meta[property="article:author"]')?.getAttribute("content") || doc.querySelector('[rel="author"]')?.textContent;
    if (author?.trim()) {
      metadata.author = author.trim();
    }
    const publishedTime = doc.querySelector('meta[property="article:published_time"]')?.getAttribute("content") || doc.querySelector('meta[name="publish-date"]')?.getAttribute("content") || doc.querySelector("time[datetime]")?.getAttribute("datetime");
    if (publishedTime?.trim()) {
      metadata.publishedAt = publishedTime.trim();
    }
    const description = doc.querySelector('meta[name="description"]')?.getAttribute("content") || doc.querySelector('meta[property="og:description"]')?.getAttribute("content") || doc.querySelector('meta[name="twitter:description"]')?.getAttribute("content");
    if (description?.trim()) {
      metadata.description = description.trim();
    }
    return Object.keys(metadata).length > 0 ? metadata : void 0;
  }
  /**
   * Extrae el contenido principal de la página
   */
  extractMainContent(doc, options) {
    const main = this.findMainContent(doc);
    if (!main) {
      throw new Error("Could not find main content in page");
    }
    let text = this.nodeToText(main);
    if (options.maxWords && options.maxWords > 0) {
      text = this.truncateToWords(text, options.maxWords);
    }
    return text;
  }
  /**
   * Encuentra el elemento que contiene el contenido principal
   */
  findMainContent(doc) {
    const mainSelectors = ["main", "article", '[role="main"]', ".main-content", "#main-content", ".content", "#content", ".post-content", ".article-content", ".entry-content"];
    for (const selector of mainSelectors) {
      const element = doc.querySelector(selector);
      if (element && this.hasSignificantContent(element)) {
        return element;
      }
    }
    return this.findElementWithMostText(doc.body);
  }
  /**
   * Verifica si un elemento tiene contenido significativo
   */
  hasSignificantContent(element) {
    const text = element.textContent?.trim() || "";
    const wordCount = this.countWords(text);
    return wordCount >= 50;
  }
  /**
   * Encuentra el elemento con más contenido de texto
   */
  findElementWithMostText(root) {
    let maxWords = 0;
    let bestElement = null;
    const candidates = root.querySelectorAll("div, section, article, main");
    candidates.forEach((element) => {
      const text = this.getDirectText(element);
      const wordCount = this.countWords(text);
      if (wordCount > maxWords) {
        maxWords = wordCount;
        bestElement = element;
      }
    });
    return bestElement || root;
  }
  /**
   * Obtiene el texto directo de un elemento (incluyendo hijos inmediatos de párrafos)
   */
  getDirectText(element) {
    const parts = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node2) => {
        const el = node2;
        const tag = el.tagName.toLowerCase();
        if (["p", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre"].includes(tag)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    });
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent?.trim();
      if (text) {
        parts.push(text);
      }
    }
    return parts.join(" ");
  }
  /**
   * Convierte un nodo DOM a texto plano estructurado
   */
  nodeToText(node) {
    const parts = [];
    let lastWasBlock = false;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node2) => {
        if (node2.nodeType === Node.TEXT_NODE) {
          return NodeFilter.FILTER_ACCEPT;
        }
        if (node2.nodeType === Node.ELEMENT_NODE) {
          const el = node2;
          const tag = el.tagName.toLowerCase();
          if (tag === "script" || tag === "style") {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    });
    let currentNode;
    while (currentNode = walker.nextNode()) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        const text = currentNode.textContent?.trim();
        if (text && text.length > 0) {
          parts.push(text);
          lastWasBlock = false;
        }
      } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
        const el = currentNode;
        const tag = el.tagName.toLowerCase();
        if (HEADING_TAGS.has(tag)) {
          if (!lastWasBlock) {
            parts.push("\n");
          }
          parts.push("\n");
          lastWasBlock = true;
        } else if (BLOCK_LEVEL_TAGS.has(tag)) {
          if (!lastWasBlock) {
            parts.push("\n");
            lastWasBlock = true;
          }
        }
      }
    }
    let result = parts.join(" ");
    result = result.replace(/[ \t]+/g, " ");
    result = result.replace(/\n +/g, "\n");
    result = result.replace(/ +\n/g, "\n");
    result = result.replace(/\n{3,}/g, "\n\n");
    return result.trim();
  }
  /**
   * Cuenta palabras en un texto
   */
  countWords(text) {
    const words = text.match(/\b\w+\b/g);
    return words ? words.length : 0;
  }
  /**
   * Trunca texto a un número máximo de palabras
   */
  truncateToWords(text, maxWords) {
    const words = text.split(/\s+/);
    if (words.length <= maxWords) {
      return text;
    }
    return words.slice(0, maxWords).join(" ") + "...";
  }
}

class WorkerManager {
  constructor(workerPath) {
    this.workerPath = workerPath;
  }
  worker = null;
  pendingRequests = /* @__PURE__ */ new Map();
  messageIdCounter = 0;
  /**
   * Initialize the worker
   */
  async init() {
    if (this.worker) {
      console.warn("Worker already initialized");
      return;
    }
    try {
      const workerUrl = this.workerPath.startsWith("http") || this.workerPath.startsWith("blob:") ? this.workerPath : new URL(this.workerPath, import.meta.url).href;
      this.worker = new Worker(workerUrl, {
        type: "module"
      });
      this.worker.onmessage = (event) => {
        this.handleWorkerMessage(event.data);
      };
      this.worker.onerror = (error) => {
        console.error("Worker error:", error);
        this.pendingRequests.forEach(({
          reject
        }) => {
          reject(new Error(`Worker error: ${error.message}`));
        });
        this.pendingRequests.clear();
      };
      console.log(`✅ Worker initialized: ${this.workerPath}`);
    } catch (error) {
      console.error("Failed to initialize worker:", error);
      throw error;
    }
  }
  /**
   * Send a message to the worker and wait for response
   */
  async sendMessage(type, payload, onProgress) {
    if (!this.worker) {
      throw new Error("Worker not initialized. Call init() first.");
    }
    const id = this.generateMessageId();
    const message = {
      id,
      type,
      payload
    };
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve,
        reject,
        onProgress
      });
      this.worker.postMessage(message);
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Worker request timeout"));
      }, 10 * 60 * 1e3);
      const originalResolve = resolve;
      const originalReject = reject;
      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          originalResolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          originalReject(error);
        },
        onProgress
      });
    });
  }
  /**
   * Handle message from worker
   */
  handleWorkerMessage(response) {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      console.warn("Received response for unknown request:", response.id);
      return;
    }
    switch (response.type) {
      case "success":
        this.pendingRequests.delete(response.id);
        pending.resolve(response.payload);
        break;
      case "error":
        this.pendingRequests.delete(response.id);
        pending.reject(new Error(response.error || "Unknown worker error"));
        break;
      case "progress":
        if (pending.onProgress && response.progress !== void 0) {
          pending.onProgress(response.progress, response.message || "");
        }
        break;
      default:
        console.warn("Unknown response type:", response.type);
    }
  }
  /**
   * Generate unique message ID
   */
  generateMessageId() {
    return `msg-${Date.now()}-${this.messageIdCounter++}`;
  }
  /**
   * Terminate the worker
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.pendingRequests.forEach(({
        reject
      }) => {
        reject(new Error("Worker terminated"));
      });
      this.pendingRequests.clear();
      console.log("✅ Worker terminated");
    }
  }
  /**
   * Check if worker is initialized
   */
  isInitialized() {
    return this.worker !== null;
  }
}

const EmbeddingWorkerUrl = "/_astro/embedding.worker-EhgQhJLB.js";

const ChunkingWorkerUrl = "/_astro/chunking.worker-Gajw2tGw.js";

const WebSearchWorkerUrl = "/_astro/web-search.worker-ygv6mwRH.js";

class EmbeddingWorkerManager {
  manager;
  constructor() {
    this.manager = new WorkerManager(EmbeddingWorkerUrl);
  }
  async init(modelUrl) {
    await this.manager.init();
    await this.manager.sendMessage("init", {
      modelUrl
    });
  }
  async generateEmbedding(text) {
    const result = await this.manager.sendMessage("generate-embedding", {
      text
    });
    return result.embedding;
  }
  async generateEmbeddingsBatch(texts, maxConcurrent = 4, onProgress) {
    const result = await this.manager.sendMessage("generate-embeddings-batch", {
      texts,
      maxConcurrent
    }, onProgress);
    return result.embeddings;
  }
  async reset() {
    await this.manager.sendMessage("reset", {});
  }
  terminate() {
    this.manager.terminate();
  }
  isInitialized() {
    return this.manager.isInitialized();
  }
}
class ChunkingWorkerManager {
  manager;
  constructor() {
    this.manager = new WorkerManager(ChunkingWorkerUrl);
  }
  async init() {
    await this.manager.init();
  }
  async chunkDocument(documentId, text, chunkSize = 800, overlap = 50, onProgress) {
    const result = await this.manager.sendMessage("chunk-document", {
      documentId,
      text,
      chunkSize,
      overlap
    }, onProgress);
    return result.chunks;
  }
  terminate() {
    this.manager.terminate();
  }
  isInitialized() {
    return this.manager.isInitialized();
  }
}
class SearchWorkerManager {
  manager;
  constructor() {
    this.manager = new WorkerManager("./search.worker.ts");
  }
  async init() {
    await this.manager.init();
  }
  async searchSimilar(queryEmbedding, embeddings, topK = 5, onProgress) {
    const result = await this.manager.sendMessage("search-similar", {
      queryEmbedding,
      embeddings,
      topK
    }, onProgress);
    return result.results;
  }
  async calculateSimilarity(embedding1, embedding2) {
    const result = await this.manager.sendMessage("calculate-similarity", {
      embedding1,
      embedding2
    });
    return result.similarity;
  }
  terminate() {
    this.manager.terminate();
  }
  isInitialized() {
    return this.manager.isInitialized();
  }
}
class WebSearchWorkerManager {
  manager;
  constructor() {
    this.manager = new WorkerManager(WebSearchWorkerUrl);
  }
  async init() {
    await this.manager.init();
  }
  async fetchPage(url, options) {
    const result = await this.manager.sendMessage("fetch-page", {
      url,
      options
    });
    return result;
  }
  async fetchPages(urls, options) {
    const result = await this.manager.sendMessage("fetch-pages", {
      urls,
      options
    });
    return result;
  }
  terminate() {
    this.manager.terminate();
  }
  isInitialized() {
    return this.manager.isInitialized();
  }
}
class WorkerPool {
  static instance;
  embeddingWorker = null;
  chunkingWorker = null;
  searchWorker = null;
  webSearchWorker = null;
  constructor() {
  }
  static getInstance() {
    if (!WorkerPool.instance) {
      WorkerPool.instance = new WorkerPool();
    }
    return WorkerPool.instance;
  }
  /**
   * Get or create embedding worker
   */
  async getEmbeddingWorker() {
    if (!this.embeddingWorker) {
      this.embeddingWorker = new EmbeddingWorkerManager();
    }
    return this.embeddingWorker;
  }
  /**
   * Get or create chunking worker
   */
  async getChunkingWorker() {
    if (!this.chunkingWorker) {
      this.chunkingWorker = new ChunkingWorkerManager();
      await this.chunkingWorker.init();
    }
    return this.chunkingWorker;
  }
  /**
   * Get or create search worker
   */
  async getSearchWorker() {
    if (!this.searchWorker) {
      this.searchWorker = new SearchWorkerManager();
      await this.searchWorker.init();
    }
    return this.searchWorker;
  }
  /**
   * Get or create web search worker
   */
  async getWebSearchWorker() {
    if (!this.webSearchWorker) {
      this.webSearchWorker = new WebSearchWorkerManager();
      await this.webSearchWorker.init();
    }
    return this.webSearchWorker;
  }
  /**
   * Terminate all workers
   */
  terminateAll() {
    if (this.embeddingWorker) {
      this.embeddingWorker.terminate();
      this.embeddingWorker = null;
    }
    if (this.chunkingWorker) {
      this.chunkingWorker.terminate();
      this.chunkingWorker = null;
    }
    if (this.searchWorker) {
      this.searchWorker.terminate();
      this.searchWorker = null;
    }
    if (this.webSearchWorker) {
      this.webSearchWorker.terminate();
      this.webSearchWorker = null;
    }
  }
}
function getWorkerPool() {
  return WorkerPool.getInstance();
}

class WebRAGOrchestrator {
  constructor(llmEngine, embeddingEngine, webSearchService) {
    this.llmEngine = llmEngine;
    this.embeddingEngine = embeddingEngine;
    this.webSearchService = webSearchService || new WebSearchService();
    this.contentExtractor = new ContentExtractor();
  }
  webSearchService;
  contentExtractor;
  /**
   * Ejecuta búsqueda web + RAG completo
   */
  async search(userQuery, options = {}) {
    const {
      sources = ["wikipedia"],
      maxSearchResults = 10,
      maxUrlsToFetch = 3,
      topK = 5,
      onProgress
    } = options;
    const startTime = Date.now();
    const timestamps = {};
    try {
      onProgress?.("query_generation", 10, "Generando consulta de búsqueda...");
      const stepStart = Date.now();
      const searchQuery = await this.generateSearchQuery(userQuery);
      timestamps.queryGeneration = Date.now() - stepStart;
      console.log(`[WebRAG] Generated search query: "${searchQuery}"`);
      onProgress?.("web_search", 20, "Buscando en la web...");
      const searchStart = Date.now();
      const searchResults = await this.webSearchService.search(searchQuery, {
        maxResults: maxSearchResults,
        sources
      });
      timestamps.webSearch = Date.now() - searchStart;
      console.log(`[WebRAG] Found ${searchResults.length} search results`);
      if (searchResults.length === 0) {
        throw new Error("No se encontraron resultados de búsqueda");
      }
      onProgress?.("url_selection", 30, "Seleccionando fuentes relevantes...");
      const selectionStart = Date.now();
      const selectedIndices = await this.selectRelevantResults(userQuery, searchResults, maxUrlsToFetch);
      timestamps.urlSelection = Date.now() - selectionStart;
      const selectedUrls = selectedIndices.map((i) => searchResults[i].url);
      console.log(`[WebRAG] Selected ${selectedUrls.length} URLs to fetch`);
      onProgress?.("page_fetch", 40, `Descargando ${selectedUrls.length} páginas...`);
      const fetchStart = Date.now();
      const fetchedPages = await this.fetchPages(selectedUrls);
      timestamps.pageFetch = Date.now() - fetchStart;
      console.log(`[WebRAG] Successfully fetched ${fetchedPages.length} pages`);
      if (fetchedPages.length === 0) {
        throw new Error("No se pudo descargar ninguna página");
      }
      onProgress?.("content_extraction", 50, "Extrayendo contenido limpio...");
      const extractionStart = Date.now();
      const cleanedContents = fetchedPages.map((page) => this.contentExtractor.extract(page.html, page.url, {
        maxWords: 500
        // Limitar a 500 palabras por página (~2000 chars)
      }));
      timestamps.contentExtraction = Date.now() - extractionStart;
      console.log(`[WebRAG] Extracted content from ${cleanedContents.length} pages`);
      onProgress?.("chunking", 60, "Procesando documentos web...");
      const chunkingStart = Date.now();
      const webDocuments = await this.processWebDocuments(cleanedContents, searchQuery, (progress) => {
        onProgress?.("embedding", 60 + progress * 0.2, "Generando embeddings...");
      });
      timestamps.chunking = Date.now() - chunkingStart;
      timestamps.embedding = timestamps.chunking;
      const totalChunks = webDocuments.reduce((sum, doc) => sum + doc.chunks.length, 0);
      console.log(`[WebRAG] Processed ${webDocuments.length} web documents (${totalChunks} chunks)`);
      onProgress?.("vector_search", 80, "Buscando fragmentos relevantes...");
      const searchVectorStart = Date.now();
      const queryEmbedding = await this.embeddingEngine.generateEmbedding(userQuery);
      const retrievedChunks = await this.searchWebDocuments(queryEmbedding, webDocuments, topK);
      timestamps.vectorSearch = Date.now() - searchVectorStart;
      console.log(`[WebRAG] Retrieved ${retrievedChunks.length} relevant chunks`);
      onProgress?.("answer_generation", 90, "Generando respuesta...");
      const answerStart = Date.now();
      const answer = await this.generateAnswer(userQuery, retrievedChunks);
      timestamps.answerGeneration = Date.now() - answerStart;
      console.log(`[WebRAG] Generated answer (${answer.length} characters)`);
      const totalTime = Date.now() - startTime;
      onProgress?.("completed", 100, "Búsqueda completada");
      return {
        query: userQuery,
        searchQuery,
        searchResults,
        selectedUrls,
        cleanedContents,
        webDocuments,
        ragResult: {
          chunks: retrievedChunks,
          totalSearched: totalChunks,
          searchTime: timestamps.vectorSearch
        },
        answer,
        metadata: {
          totalTime,
          sourcesUsed: fetchedPages.length,
          timestamps
        }
      };
    } catch (error) {
      onProgress?.("error", 0, error instanceof Error ? error.message : "Error desconocido");
      throw error;
    }
  }
  // ==========================================================================
  // PASO 1: Generar query de búsqueda
  // ==========================================================================
  async generateSearchQuery(userQuery) {
    const prompt = `Eres un asistente experto en crear consultas de búsqueda web efectivas.

Tu tarea es convertir la pregunta del usuario en una consulta de búsqueda corta y precisa que maximice la probabilidad de encontrar información relevante.

Reglas:
- Máximo 5-7 palabras clave
- Elimina palabras de relleno ("cómo", "qué", "cuál", etc.)
- Incluye el año actual (2025) si la pregunta requiere información reciente
- Usa inglés para contenido técnico, español para contenido general
- NO agregues comillas ni operadores especiales

Pregunta del usuario: ${userQuery}

Responde SOLO con la consulta de búsqueda, sin explicaciones.

Consulta de búsqueda:`;
    const response = await this.generateText(prompt, {
      temperature: 0.3,
      max_tokens: 50
    });
    return response.trim().replace(/["']/g, "").slice(0, 100);
  }
  // ==========================================================================
  // PASO 3: Seleccionar URLs relevantes
  // ==========================================================================
  async selectRelevantResults(userQuery, results, maxUrls) {
    const resultsText = results.map((r, i) => `[${i}] ${r.title}
    ${r.snippet}`).join("\n\n");
    const prompt = `Eres un asistente que selecciona las fuentes web más relevantes para responder una pregunta.

Pregunta del usuario: ${userQuery}

Resultados de búsqueda disponibles:
${resultsText}

Selecciona los ${Math.min(maxUrls, results.length)} resultados MÁS relevantes que ayudarían a responder la pregunta. Prioriza fuentes que:
- Sean directamente relevantes a la pregunta
- Tengan información actualizada
- Sean fuentes confiables

Responde SOLO con un JSON en este formato exacto:
{"indices": [0, 2, 5]}

JSON:`;
    const response = await this.generateText(prompt, {
      temperature: 0.1,
      max_tokens: 100
    });
    try {
      const jsonMatch = response.match(/\{[^}]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      const parsed = JSON.parse(jsonMatch[0]);
      const indices = parsed.indices || [];
      const validIndices = indices.filter((i) => i >= 0 && i < results.length).slice(0, maxUrls);
      if (validIndices.length === 0) {
        return Array.from({
          length: Math.min(maxUrls, results.length)
        }, (_, i) => i);
      }
      return validIndices;
    } catch (error) {
      console.warn("[WebRAG] Failed to parse LLM selection, using first results", error);
      return Array.from({
        length: Math.min(maxUrls, results.length)
      }, (_, i) => i);
    }
  }
  // ==========================================================================
  // PASO 4: Fetch páginas
  // ==========================================================================
  async fetchPages(urls) {
    const workerPool = getWorkerPool();
    const webSearchWorker = await workerPool.getWebSearchWorker();
    const pages = await webSearchWorker.fetchPages(urls, {
      maxSize: 500 * 1024,
      // 500KB
      timeout: 1e4
      // 10s
    });
    return pages;
  }
  // ==========================================================================
  // PASO 6: Procesar documentos web (chunking + embeddings)
  // ==========================================================================
  async processWebDocuments(contents, searchQuery, onProgress) {
    const documents = [];
    for (let i = 0; i < contents.length; i++) {
      const content = contents[i];
      const chunks = await semanticChunkText(content.text, {
        });
      const texts = chunks.map((c) => c.content);
      const embeddings = await this.embeddingEngine.generateEmbeddingsBatch(
        texts,
        4
        // maxConcurrent
      );
      const webChunks = chunks.map((chunk, j) => ({
        content: chunk.content,
        index: chunk.index,
        embedding: new Float32Array(embeddings[j]),
        metadata: {
          startChar: chunk.metadata.startChar,
          endChar: chunk.metadata.endChar,
          type: chunk.metadata.type,
          prevContext: chunk.metadata.prevContext,
          nextContext: chunk.metadata.nextContext
        }
      }));
      const webDoc = {
        id: `web-${Date.now()}-${i}`,
        type: "web",
        url: content.url,
        title: content.title,
        content: content.text,
        chunks: webChunks,
        temporary: true,
        fetchedAt: content.extractedAt,
        ttl: 36e5,
        // 1 hora
        metadata: {
          source: "wikipedia",
          // TODO: obtener del SearchResult
          searchQuery,
          originalSize: content.text.length,
          fetchTime: 0
          // TODO: pasar desde FetchedPage
        }
      };
      documents.push(webDoc);
      onProgress?.((i + 1) / contents.length * 100);
    }
    return documents;
  }
  // ==========================================================================
  // PASO 7: Buscar en documentos web
  // ==========================================================================
  async searchWebDocuments(queryEmbedding, webDocuments, topK) {
    const allChunks = [];
    webDocuments.forEach((doc) => {
      doc.chunks.forEach((chunk) => {
        allChunks.push({
          chunk,
          document: doc
        });
      });
    });
    const similarities = allChunks.map(({
      chunk
    }) => {
      const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      return similarity;
    });
    const indices = Array.from({
      length: allChunks.length
    }, (_, i) => i);
    indices.sort((a, b) => similarities[b] - similarities[a]);
    const topIndices = indices.slice(0, topK);
    const retrieved = topIndices.map((i) => {
      const {
        chunk,
        document
      } = allChunks[i];
      return {
        content: chunk.content,
        score: similarities[i],
        document: {
          id: document.id,
          title: document.title,
          url: document.url,
          type: "web"
        },
        metadata: chunk.metadata
      };
    });
    return retrieved;
  }
  /**
   * Calcula similitud coseno entre dos vectores
   */
  cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  // ==========================================================================
  // PASO 8: Generar respuesta final
  // ==========================================================================
  async generateAnswer(query, chunks) {
    const context = chunks.map((chunk, i) => {
      const score = (chunk.score * 100).toFixed(1);
      return `[Fuente ${i + 1}: ${chunk.document.title} (${score}% relevancia)]
URL: ${chunk.document.url}

${chunk.content}`;
    }).join("\n\n---\n\n");
    const prompt = `Eres un asistente útil que responde preguntas usando información obtenida de la web.

CONTEXTO DE FUENTES WEB:
${context}

PREGUNTA DEL USUARIO: ${query}

Instrucciones:
- Responde SOLO usando la información del contexto proporcionado
- Si el contexto no contiene información suficiente, indícalo claramente
- Cita las fuentes mencionando el título o número de fuente
- Sé conciso y preciso
- NO inventes información que no esté en el contexto

RESPUESTA:`;
    const answer = await this.generateText(prompt, {
      temperature: 0.7,
      max_tokens: 512
    });
    return answer.trim();
  }
  // ==========================================================================
  // UTILIDADES
  // ==========================================================================
  /**
   * Genera texto con el motor LLM (abstrae WebLLM y Wllama)
   */
  async generateText(prompt, options) {
    if ("generateText" in this.llmEngine) {
      return await this.llmEngine.generateText(prompt, {
        ...options,
        stream: false
      });
    }
    if ("createChatCompletion" in this.llmEngine) {
      const response = await this.llmEngine.createChatCompletion([{
        role: "user",
        content: prompt
      }], {
        temperature: options.temperature,
        max_tokens: options.max_tokens
      });
      return response;
    }
    throw new Error("LLM engine does not support text generation");
  }
}

function ChatInterface() {
  const [messages, setMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [webSearchProgress, setWebSearchProgress] = useState(null);
  const [showDocumentCanvas, setShowDocumentCanvas] = useState(false);
  const [documentContent, setDocumentContent] = useState("");
  const messagesEndRef = useRef(null);
  useEffect(() => {
    getWebSearchSettings().then((settings) => {
      setWebSearchEnabled(settings.enableWebSearch);
    });
  }, []);
  function markdownToHTML(markdown) {
    let html = markdown;
    html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");
    html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
    html = html.replace(/_(.+?)_/g, "<em>$1</em>");
    html = html.replace(/^\* (.+)$/gim, "<li>$1</li>");
    html = html.replace(/^- (.+)$/gim, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");
    const lines = html.split("\n");
    html = lines.map((line) => {
      line = line.trim();
      if (line === "") return "";
      if (line.startsWith("<h") || line.startsWith("<ul") || line.startsWith("<li")) {
        return line;
      }
      return `<p>${line}</p>`;
    }).join("");
    return html;
  }
  function isDocumentGenerationRequest(message) {
    const lowerMessage = message.toLowerCase();
    const keywords = ["genera un documento", "crea un documento", "escribe un documento", "redacta un documento", "genera un artículo", "crea un artículo", "escribe un artículo", "redacta un artículo", "genera un informe", "crea un informe", "genera un ensayo", "crea un ensayo", "genera un reporte", "crea un reporte", "genera una carta", "crea una carta", "genera un email", "crea un email", "escribe sobre", "redacta sobre"];
    return keywords.some((keyword) => lowerMessage.includes(keyword));
  }
  async function decideStrategy(userQuestion) {
    try {
      const chatEngine = await EngineManager.getChatEngine();
      const hasDocuments = hasReadyDocuments.value;
      const decisionPrompt = `Eres un asistente inteligente que debe decidir la mejor estrategia para responder una pregunta.

CONTEXTO:
- Documentos locales disponibles: ${hasDocuments ? "SÍ" : "NO"}
- Búsqueda web disponible: SÍ

PREGUNTA DEL USUARIO:
"${userQuestion}"

INSTRUCCIONES:
Analiza la pregunta y decide la mejor estrategia. Responde ÚNICAMENTE con una de estas opciones:

1. "WEB" - Si la pregunta requiere información actualizada, noticias, eventos recientes, datos en tiempo real, o información que probablemente no esté en documentos locales.

2. "LOCAL" - Si la pregunta se puede responder con los documentos locales${!hasDocuments ? " (pero NO HAY documentos disponibles, así que esta opción NO es válida)" : ""}, especialmente si es sobre contenido específico de los documentos.

3. "DIRECT" - Si la pregunta es general, sobre conocimiento común, conceptos básicos, o puede responderse sin necesidad de buscar información específica.

RESPONDE SOLO CON: WEB, LOCAL o DIRECT`;
      console.log("🤔 Asking AI to decide strategy...");
      const decision = await chatEngine.generateText(decisionPrompt, {
        temperature: 0.1,
        // Low temperature for more deterministic decisions
        maxTokens: 10
      });
      const cleanDecision = decision.trim().toUpperCase();
      console.log(`🧠 AI raw decision: "${cleanDecision}"`);
      if (cleanDecision.includes("WEB")) {
        return true;
      } else if (cleanDecision.includes("LOCAL") && hasDocuments) {
        return false;
      } else {
        return false;
      }
    } catch (error) {
      console.error("❌ Failed to decide strategy, defaulting to local RAG:", error);
      return false;
    }
  }
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages, currentResponse]);
  useEffect(() => {
    const activeId = conversationsStore.activeId;
    if (activeId) {
      const conversation = conversationsStore.active;
      if (conversation) {
        setMessages(conversation.messages || []);
      }
    } else {
      setMessages([]);
    }
  }, [conversationsStore.activeId]);
  async function handleSendMessage(content, mode) {
    if (!modelsReady.value) {
      alert("Debes cargar los modelos de IA antes de chatear");
      return;
    }
    let effectiveMode = mode;
    if (mode === "smart") {
      console.log("🧠 Smart mode activated - AI will decide the strategy");
      const useWeb = await decideStrategy(content);
      effectiveMode = useWeb ? "web" : hasReadyDocuments.value ? "local" : "conversation";
      console.log(`🎯 AI decision: ${effectiveMode}`);
    }
    if (effectiveMode === "local" && !hasReadyDocuments.value) {
      alert("No hay documentos cargados. Usa otro modo o sube documentos.");
      return;
    }
    const userMessage = {
      id: generateUUID(),
      role: "user",
      content,
      timestamp: Date.now()
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsGenerating(true);
    setCurrentResponse("");
    setWebSearchProgress(null);
    try {
      const embeddingEngine = await EngineManager.getEmbeddingEngine();
      const chatEngine = await EngineManager.getChatEngine();
      let assistantMessage;
      if (effectiveMode === "web") {
        const webSearchSettings = await getWebSearchSettings();
        const orchestrator = new WebRAGOrchestrator(chatEngine, embeddingEngine);
        const webResult = await orchestrator.search(content, {
          sources: webSearchSettings.webSearchSources,
          maxUrlsToFetch: webSearchSettings.webSearchMaxUrls,
          topK: 3,
          // Reducido para evitar exceder el contexto de 4096 tokens
          onProgress: (step, progress, message) => {
            setWebSearchProgress({
              step,
              progress,
              message
            });
          }
        });
        assistantMessage = {
          id: generateUUID(),
          role: "assistant",
          content: webResult.answer,
          timestamp: Date.now(),
          model: "webllm",
          metadata: {
            webSources: webResult.cleanedContents.map((c) => ({
              title: c.title,
              url: c.url,
              wordCount: c.wordCount
            })),
            searchQuery: webResult.searchQuery,
            totalTime: webResult.metadata.totalTime
          }
        };
      } else if (effectiveMode === "local") {
        const settings = await getRAGSettings();
        const conversationHistory = messages.slice(-5).map((msg) => ({
          role: msg.role,
          content: msg.content
        }));
        let streamedText = "";
        const {
          answer,
          ragResult
        } = await completeRAGFlow(content, embeddingEngine, chatEngine, settings.topK, void 0, conversationHistory, (chunk) => {
          streamedText += chunk;
          setCurrentResponse(streamedText);
        });
        assistantMessage = {
          id: generateUUID(),
          role: "assistant",
          content: answer,
          timestamp: Date.now(),
          sources: ragResult.chunks,
          model: "webllm"
        };
      } else {
        console.log("💬 Conversation mode - pure chat without RAG or web search");
        const conversationHistory = [...messages.slice(-10), userMessage].map((msg) => ({
          role: msg.role,
          content: msg.content
        }));
        let prompt = "Eres un asistente útil y conversacional. Responde de manera natural y coherente basándote en el contexto de la conversación.\n\n";
        prompt += conversationHistory.map((msg) => `${msg.role === "user" ? "Usuario" : "Asistente"}: ${msg.content}`).join("\n\n");
        prompt += "\n\nAsistente:";
        console.log("📝 Conversation history length:", conversationHistory.length, "messages");
        let streamedText = "";
        const answer = await chatEngine.generateText(prompt, {
          temperature: 0.7,
          maxTokens: 2048,
          // Increased for longer responses
          onStream: (chunk) => {
            streamedText += chunk;
            setCurrentResponse(streamedText);
          }
        });
        assistantMessage = {
          id: generateUUID(),
          role: "assistant",
          content: answer,
          timestamp: Date.now(),
          model: "webllm"
        };
      }
      setMessages((prev) => [...prev, assistantMessage]);
      setCurrentResponse("");
      setWebSearchProgress(null);
      const isDocGenRequest = isDocumentGenerationRequest(content);
      console.log("🔍 Checking if document generation:", {
        userMessage: content,
        isDocGen: isDocGenRequest
      });
      if (isDocGenRequest) {
        console.log("📄 Document generation detected - opening editor");
        console.log("📝 Assistant response length:", assistantMessage.content.length);
        const htmlContent = markdownToHTML(assistantMessage.content);
        console.log("🔄 HTML content generated:", htmlContent.substring(0, 100) + "...");
        setDocumentContent(htmlContent);
        setShowDocumentCanvas(true);
        console.log("✅ Canvas state updated - should show now");
      }
      let conversationId = conversationsStore.activeId;
      let isNewConversation = false;
      if (!conversationId) {
        const conversation = await getOrCreateConversation();
        conversationId = conversation.id;
        conversationsStore.setActive(conversationId);
        conversationsStore.add(conversation);
        isNewConversation = true;
      }
      await addMessage(conversationId, userMessage);
      await addMessage(conversationId, assistantMessage);
      const {
        getConversation,
        generateTitle,
        updateConversationTitle
      } = await Promise.resolve().then(() => conversations);
      if (isNewConversation) {
        const title = generateTitle(content);
        await updateConversationTitle(conversationId, title);
      }
      const updatedConv = await getConversation(conversationId);
      if (updatedConv) {
        conversationsStore.update(conversationId, updatedConv);
      }
    } catch (error) {
      console.error("Failed to generate response:", error);
      const errorMessage = {
        id: generateUUID(),
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: Date.now()
      };
      setMessages((prev) => [...prev, errorMessage]);
      setCurrentResponse("");
    } finally {
      setIsGenerating(false);
    }
  }
  const canChat = modelsReady.value && (hasReadyDocuments.value || webSearchEnabled);
  return jsxs("div", {
    className: "flex flex-col h-full",
    children: [showDocumentCanvas && jsx("div", {
      className: "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4",
      children: jsx("div", {
        className: "w-full max-w-5xl h-[90vh] bg-[var(--color-bg)] rounded-lg shadow-2xl overflow-hidden",
        children: jsx(DocumentCanvas, {
          initialContent: documentContent,
          onClose: () => setShowDocumentCanvas(false)
        })
      })
    }), jsx("div", {
      className: "flex-1 overflow-y-auto",
      children: jsx("div", {
        className: "max-w-3xl mx-auto px-4 py-8",
        children: messages.length === 0 ? jsx("div", {
          className: "h-[calc(100vh-12rem)] flex items-center justify-center",
          children: jsxs("div", {
            className: "text-center max-w-md space-y-4",
            children: [jsx("div", {
              className: "w-16 h-16 mx-auto flex items-center justify-center",
              children: jsx("img", {
                src: "/inledai.svg",
                alt: "InLed AI",
                width: 64,
                height: 64
              })
            }), jsx("h3", {
              className: "text-2xl font-semibold",
              children: "Hola, ¿en qué puedo ayudarte?"
            }), jsx("p", {
              className: "text-sm text-[var(--color-text-secondary)]",
              children: "Comencemos una sesión de conversación mútua"
            }), !canChat && jsx("div", {
              className: "mt-6 p-4 bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20 rounded-lg text-left",
              children: jsxs("div", {
                className: "flex gap-2",
                children: [jsx(AlertCircle, {
                  size: 16,
                  className: "text-[var(--color-warning)] flex-shrink-0 mt-0.5"
                }), jsxs("div", {
                  className: "text-sm text-[var(--color-text-secondary)]",
                  children: [jsx("p", {
                    className: "font-medium text-[var(--color-warning)] mb-1",
                    children: "Debes completar estos pasos para poder comenzar:"
                  }), jsxs("ul", {
                    className: "list-disc list-inside space-y-1",
                    children: [!modelsReady.value && jsxs("li", {
                      children: ["Cargar los modelos de IA pulsando en ", jsx("strong", {
                        children: "configurar modelos"
                      })]
                    }), !hasReadyDocuments.value && jsxs("li", {
                      children: ["Sube y procesa al menos un documento pulsando en ", jsx("strong", {
                        children: "subir documentos"
                      })]
                    })]
                  })]
                })]
              })
            })]
          })
        }) : jsxs("div", {
          className: "space-y-6",
          children: [messages.map((message) => jsx(Message, {
            message
          }, message.id)), isGenerating && currentResponse && jsxs("div", {
            className: "flex gap-3 animate-slideUp",
            children: [jsx("div", {
              className: "flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center shadow-[0_0_15px_rgba(40,229,24,0.3)]",
              children: jsx(Sparkles, {
                size: 18,
                color: "black",
                className: "animate-pulse"
              })
            }), jsxs("div", {
              className: "flex-1 rounded-2xl px-4 py-3 text-sm bg-[var(--color-bg-secondary)] border border-[var(--color-border)]",
              children: [jsx(MarkdownRenderer, {
                content: currentResponse,
                className: "leading-relaxed"
              }), jsx("span", {
                className: "inline-block w-1 h-4 bg-[var(--color-primary)] animate-pulse ml-1"
              })]
            })]
          }), isGenerating && webSearchProgress && jsx("div", {
            className: "animate-slideUp",
            children: jsx(WebSearchProgress, {
              step: webSearchProgress.step,
              progress: webSearchProgress.progress,
              message: webSearchProgress.message
            })
          }), isGenerating && !currentResponse && !webSearchProgress && jsxs("div", {
            className: "flex gap-3 animate-slideUp",
            children: [jsx("div", {
              className: "flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center shadow-[0_0_15px_rgba(40,229,24,0.3)]",
              children: jsx(Sparkles, {
                size: 18,
                color: "black",
                className: "animate-pulse"
              })
            }), jsxs("div", {
              className: "flex items-center gap-1 px-4 py-3 rounded-2xl bg-[var(--color-bg-secondary)] border border-[var(--color-border)]",
              children: [jsx("span", {
                className: "w-2 h-2 rounded-full bg-[var(--color-primary)] animate-bounce",
                style: {
                  animationDelay: "0ms"
                }
              }), jsx("span", {
                className: "w-2 h-2 rounded-full bg-[var(--color-primary)] animate-bounce",
                style: {
                  animationDelay: "150ms"
                }
              }), jsx("span", {
                className: "w-2 h-2 rounded-full bg-[var(--color-primary)] animate-bounce",
                style: {
                  animationDelay: "300ms"
                }
              })]
            })]
          }), jsx("div", {
            ref: messagesEndRef
          })]
        })
      })
    }), jsx("div", {
      className: "border-t border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur-sm",
      children: jsxs("div", {
        className: "max-w-3xl mx-auto px-4 py-4",
        children: [jsx(ChatInput, {
          onSend: handleSendMessage,
          disabled: !canChat,
          loading: isGenerating,
          webSearchEnabled,
          placeholder: !canChat ? "Carga modelos primero..." : "Envía un mensaje..."
        }), jsx("p", {
          className: "text-xs text-center text-[var(--color-text-tertiary)] mt-2",
          children: "Edge.AI procesa todo localmente. Tus datos nunca salen del navegador."
        })]
      })
    })]
  });
}

function DocumentViewer({
  documentId,
  onClose
}) {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (documentId) {
      loadDocument(documentId);
    }
  }, [documentId]);
  async function loadDocument(id) {
    setLoading(true);
    try {
      const doc = await getDocument(id);
      setDocument(doc || null);
    } catch (error) {
      console.error("Error loading document:", error);
    } finally {
      setLoading(false);
    }
  }
  async function handleDelete() {
    if (!document) return;
    if (!confirm(`¿Estás seguro de que quieres borrar "${document.name}"?`)) {
      return;
    }
    try {
      await deleteDocument(document.id);
      documentsStore.remove(document.id);
      onClose();
    } catch (error) {
      console.error("Error deleting document:", error);
      alert("Error al borrar el documento");
    }
  }
  function handleDownload() {
    if (!document) return;
    const blob = new Blob([document.content], {
      type: "text/plain"
    });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = document.name;
    a.click();
    URL.revokeObjectURL(url);
  }
  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }
  if (!documentId) return null;
  return jsx("div", {
    className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4",
    children: jsxs("div", {
      className: "w-full max-w-4xl h-[90vh] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl flex flex-col",
      children: [jsxs("div", {
        className: "flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]",
        children: [jsxs("div", {
          className: "flex items-center gap-3 flex-1 min-w-0",
          children: [jsx("div", {
            className: "w-10 h-10 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center",
            children: jsx(FileText, {
              size: 20,
              className: "text-[var(--color-primary)]"
            })
          }), jsxs("div", {
            className: "flex-1 min-w-0",
            children: [jsx("h2", {
              className: "font-semibold text-lg truncate",
              children: document?.name || "Cargando..."
            }), document && jsxs("p", {
              className: "text-xs text-[var(--color-text-secondary)]",
              children: [formatFileSize(document.size), " • ", document.type.toUpperCase(), " • ", new Date(document.uploadedAt).toLocaleDateString("es-ES")]
            })]
          })]
        }), jsxs("div", {
          className: "flex items-center gap-2",
          children: [jsx("button", {
            onClick: handleDownload,
            disabled: !document,
            className: "w-9 h-9 rounded-lg hover:bg-[var(--color-bg-secondary)] flex items-center justify-center transition-colors disabled:opacity-50",
            "aria-label": "Descargar documento",
            title: "Descargar documento",
            children: jsx(Download, {
              size: 18
            })
          }), jsx("button", {
            onClick: handleDelete,
            disabled: !document,
            className: "w-9 h-9 rounded-lg hover:bg-[var(--color-error)]/20 text-[var(--color-error)] flex items-center justify-center transition-colors disabled:opacity-50",
            "aria-label": "Borrar documento",
            title: "Borrar documento",
            children: jsx(Trash2, {
              size: 18
            })
          }), jsx("button", {
            onClick: onClose,
            className: "w-9 h-9 rounded-lg hover:bg-[var(--color-bg-secondary)] flex items-center justify-center transition-colors",
            "aria-label": "Cerrar",
            children: jsx(X, {
              size: 18
            })
          })]
        })]
      }), jsx("div", {
        className: "flex-1 overflow-y-auto px-6 py-4",
        children: loading ? jsx("div", {
          className: "flex items-center justify-center h-full",
          children: jsxs("div", {
            className: "text-center",
            children: [jsx("div", {
              className: "w-12 h-12 border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)] rounded-full animate-spin mx-auto mb-4"
            }), jsx("p", {
              className: "text-sm text-[var(--color-text-secondary)]",
              children: "Cargando documento..."
            })]
          })
        }) : document ? jsx("div", {
          className: "prose prose-invert max-w-none",
          children: document.type === "md" || document.type === "markdown" ? jsx(MarkdownRenderer, {
            content: document.content
          }) : jsx("pre", {
            className: "whitespace-pre-wrap font-mono text-sm bg-[var(--color-bg-secondary)] p-4 rounded-lg border border-[var(--color-border)]",
            children: document.content
          })
        }) : jsx("div", {
          className: "flex items-center justify-center h-full",
          children: jsx("p", {
            className: "text-sm text-[var(--color-text-secondary)]",
            children: "No se pudo cargar el documento"
          })
        })
      })]
    })
  });
}

function ProgressBar({
  progress,
  label,
  showPercentage = true,
  variant = "default",
  size = "md",
  className = ""
}) {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const heightStyles = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3"
  };
  const colorStyles = {
    default: "bg-[var(--color-primary)]",
    success: "bg-[var(--color-success)]",
    warning: "bg-[var(--color-warning)]",
    error: "bg-[var(--color-error)]"
  };
  return jsxs("div", {
    className: `w-full ${className}`,
    children: [(label || showPercentage) && jsxs("div", {
      className: "flex justify-between items-center mb-2 text-sm",
      children: [label && jsx("span", {
        className: "text-[var(--color-text-secondary)]",
        children: label
      }), showPercentage && jsxs("span", {
        className: "font-medium text-[var(--color-text)]",
        children: [Math.round(clampedProgress), "%"]
      })]
    }), jsx("div", {
      className: `
          w-full bg-[var(--color-bg-tertiary)] rounded-full overflow-hidden
          ${heightStyles[size]}
        `,
      children: jsx("div", {
        className: `
            ${heightStyles[size]} ${colorStyles[variant]}
            rounded-full transition-all duration-300 ease-out
          `,
        style: {
          width: `${clampedProgress}%`
        }
      })
    })]
  });
}

function selectOptimalModel(memoryGB, hasWebGPU, gpuConfig) {
  if (memoryGB < 2) {
    return {
      modelName: "SmolLM2-135M-Instruct-q0f16-MLC",
      displayName: "SmolLM2 135M",
      size: "135MB",
      quantization: "Q0_F16",
      reason: "Dispositivo con muy poca RAM (<2GB)"
    };
  }
  if (!hasWebGPU) {
    if (memoryGB >= 4) {
      return {
        modelName: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
        displayName: "Qwen 2.5 0.5B",
        size: "350MB",
        quantization: "Q4_F16",
        reason: "Sin WebGPU, modelo pequeño para CPU"
      };
    }
    return {
      modelName: "SmolLM2-360M-Instruct-q4f16_1-MLC",
      displayName: "SmolLM2 360M",
      size: "200MB",
      quantization: "Q4_F16",
      reason: "Sin WebGPU, RAM limitada"
    };
  }
  return {
    modelName: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    displayName: "Qwen 2.5 0.5B",
    size: "350MB",
    quantization: "Q4_F16",
    reason: "Modelo por defecto, compatible con la mayoría de dispositivos"
  };
}

const chatLoadingState = signal(null);
const embeddingLoadingState = signal(null);
const capabilities = signal(null);
function convertToGGUFModel(mlcModelName) {
  const modelMap = {
    // SmolLM2 models
    "SmolLM2-135M-Instruct-q0f16-MLC": "https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct-GGUF/resolve/main/smollm2-135m-instruct-q4_k_m.gguf",
    "SmolLM2-360M-Instruct-q4f16_1-MLC": "https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q4_k_m.gguf",
    // Qwen models
    "Qwen2.5-0.5B-Instruct-q4f16_1-MLC": "https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf",
    "Qwen2.5-1.5B-Instruct-q4f16_1-MLC": "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
    // TinyLlama
    "TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC": "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
    // Llama models
    "Llama-3.2-1B-Instruct-q4f16_1-MLC": "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    "Llama-3.2-3B-Instruct-q4f16_1-MLC": "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    // Phi models
    "Phi-3.5-mini-instruct-q4f16_1-MLC": "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf"
  };
  if (modelMap[mlcModelName]) {
    return modelMap[mlcModelName];
  }
  console.warn(`⚠️ No GGUF mapping for ${mlcModelName}, using default Qwen2-0.5B`);
  return "https://huggingface.co/Qwen/Qwen2-0.5B-Instruct-GGUF/resolve/main/qwen2-0_5b-instruct-q4_k_m.gguf";
}
function ModelSelector() {
  const [initialized, setInitialized] = useState(false);
  const [autoLoadAttempted, setAutoLoadAttempted] = useState(false);
  useEffect(() => {
    detectCapabilities();
    setInitialized(true);
  }, []);
  useEffect(() => {
    if (initialized && capabilities.value && !autoLoadAttempted) {
      setAutoLoadAttempted(true);
      console.log("🚀 Auto-loading models...");
      loadChatModel().catch((err) => {
        console.error("Failed to auto-load chat model:", err);
      });
      loadEmbeddingModel().catch((err) => {
        console.error("Failed to auto-load embedding model:", err);
      });
    }
  }, [initialized, capabilities.value, autoLoadAttempted]);
  async function detectCapabilities() {
    try {
      const gpuLimits = await probeActualLimits();
      const hasWebGPU = gpuLimits !== null;
      const memoryGB = navigator.deviceMemory || 4;
      capabilities.value = {
        hasWebGPU,
        memoryGB,
        gpuTier: gpuLimits?.tier
      };
      console.log("💻 Capabilities:", capabilities.value);
    } catch (error) {
      console.error("Failed to detect capabilities:", error);
      capabilities.value = {
        hasWebGPU: false,
        memoryGB: 4
      };
    }
  }
  async function loadChatModel() {
    if (!capabilities.value) {
      alert("Capabilities not detected yet");
      return;
    }
    try {
      modelsStore.setChatLoading(true);
      chatLoadingState.value = {
        progress: 0,
        message: "Inicializando..."
      };
      const recommended = selectOptimalModel(
        capabilities.value.memoryGB,
        capabilities.value.hasWebGPU,
        null
        // TODO: pass GPU config
      );
      console.log("🎯 Recommended chat model:", recommended);
      let engine;
      let engineName;
      let modelUrl;
      if (capabilities.value.hasWebGPU) {
        console.log("🚀 Using WebLLM (GPU acceleration)");
        engine = new WebLLMEngine();
        engineName = "webllm";
        modelUrl = recommended.modelName;
        await engine.initialize(modelUrl, (progress, status) => {
          chatLoadingState.value = {
            progress,
            message: status
          };
        });
      } else {
        console.log("🚀 Using Wllama (CPU, no WebGPU available)");
        engine = new WllamaEngine();
        engineName = "wllama";
        modelUrl = convertToGGUFModel(recommended.modelName);
        console.log(`📦 Loading GGUF model: ${modelUrl}`);
        await engine.initialize(modelUrl, (progress, status) => {
          chatLoadingState.value = {
            progress,
            message: status
          };
        });
      }
      EngineManager.setChatEngine(engine, recommended.modelName);
      modelsStore.setChatModel({
        id: recommended.modelName,
        name: recommended.displayName,
        type: "chat",
        engine: engineName,
        contextSize: 2048,
        requiresGPU: capabilities.value.hasWebGPU,
        sizeGB: parseFloat(recommended.size) / 1e3
      });
      chatLoadingState.value = null;
      console.log("✅ Chat model loaded");
    } catch (error) {
      console.error("❌ Failed to load chat model:", error);
      alert(`Error loading model: ${error}`);
      chatLoadingState.value = null;
    } finally {
      modelsStore.setChatLoading(false);
    }
  }
  async function loadEmbeddingModel() {
    try {
      modelsStore.setEmbeddingLoading(true);
      embeddingLoadingState.value = {
        progress: 0,
        message: "Inicializando..."
      };
      const engine = new WllamaEngine();
      await engine.initialize(void 0, (progress, status) => {
        embeddingLoadingState.value = {
          progress,
          message: status
        };
      });
      EngineManager.setEmbeddingEngine(engine, "qwen2-0.5b-embed");
      modelsStore.setEmbeddingModel({
        id: "qwen2-0.5b-embed",
        name: "Qwen2 0.5B (Embeddings)",
        type: "embedding",
        engine: "wllama",
        contextSize: 2048,
        requiresGPU: false,
        sizeGB: 0.35
      });
      embeddingLoadingState.value = null;
      console.log("✅ Embedding model loaded");
    } catch (error) {
      console.error("❌ Failed to load embedding model:", error);
      alert(`Error loading embedding model: ${error}`);
      embeddingLoadingState.value = null;
    } finally {
      modelsStore.setEmbeddingLoading(false);
    }
  }
  if (!initialized) {
    return jsx(Card, {
      children: jsxs("div", {
        className: "text-center py-8",
        children: [jsx("div", {
          className: "spinner text-[var(--color-primary)] mx-auto mb-2"
        }), jsx("p", {
          className: "text-sm text-[var(--color-text-secondary)]",
          children: "Detectando capacidades..."
        })]
      })
    });
  }
  return jsx(Card, {
    children: jsxs("div", {
      className: "space-y-4",
      children: [jsxs("div", {
        children: [jsx("h3", {
          className: "text-lg font-semibold mb-2",
          children: "Modelos de IA"
        }), jsx("p", {
          className: "text-sm text-[var(--color-text-secondary)]",
          children: "Carga los modelos necesarios para el funcionamiento local"
        })]
      }), capabilities.value && jsxs("div", {
        className: "text-xs text-[var(--color-text-tertiary)] space-y-1",
        children: [jsxs("div", {
          className: "flex items-center gap-1.5",
          children: [capabilities.value.hasWebGPU ? jsx(Zap, {
            size: 12,
            className: "text-amber-400"
          }) : jsx(Cpu, {
            size: 12
          }), capabilities.value.hasWebGPU ? "WebGPU disponible" : "Solo CPU"]
        }), capabilities.value.gpuTier && jsxs("div", {
          children: ["Tier: ", capabilities.value.gpuTier]
        }), jsxs("div", {
          children: ["Memoria: ~", capabilities.value.memoryGB, "GB"]
        })]
      }), jsxs("div", {
        className: "border-t border-[var(--color-border)] pt-4",
        children: [jsxs("div", {
          className: "flex items-center justify-between mb-2",
          children: [jsxs("div", {
            children: [jsx("h4", {
              className: "font-medium",
              children: "Modelo de Chat"
            }), jsx("p", {
              className: "text-sm text-[var(--color-text-secondary)]",
              children: "Para generar respuestas"
            })]
          }), jsx("div", {
            children: modelsStore.chat ? jsx("span", {
              className: "text-sm text-[var(--color-success)] font-medium",
              children: "✓ Cargado"
            }) : jsx(Button, {
              onClick: loadChatModel,
              loading: modelsStore.chatLoading,
              disabled: modelsStore.chatLoading,
              size: "sm",
              children: "Cargar"
            })
          })]
        }), chatLoadingState.value && jsx(ProgressBar, {
          progress: chatLoadingState.value.progress,
          label: chatLoadingState.value.message,
          size: "sm"
        }), modelsStore.chat && jsxs("div", {
          className: "mt-2 text-xs text-[var(--color-text-tertiary)]",
          children: [modelsStore.chat.name, " (", modelsStore.chat.engine, ")"]
        })]
      }), jsxs("div", {
        className: "border-t border-[var(--color-border)] pt-4",
        children: [jsxs("div", {
          className: "flex items-center justify-between mb-2",
          children: [jsxs("div", {
            children: [jsx("h4", {
              className: "font-medium",
              children: "Modelo de Embeddings"
            }), jsx("p", {
              className: "text-sm text-[var(--color-text-secondary)]",
              children: "Para búsqueda semántica"
            })]
          }), jsx("div", {
            children: modelsStore.embedding ? jsx("span", {
              className: "text-sm text-[var(--color-success)] font-medium",
              children: "✓ Cargado"
            }) : jsx(Button, {
              onClick: loadEmbeddingModel,
              loading: modelsStore.embeddingLoading,
              disabled: modelsStore.embeddingLoading,
              size: "sm",
              children: "Cargar"
            })
          })]
        }), embeddingLoadingState.value && jsx(ProgressBar, {
          progress: embeddingLoadingState.value.progress,
          label: embeddingLoadingState.value.message,
          size: "sm"
        }), modelsStore.embedding && jsxs("div", {
          className: "mt-2 text-xs text-[var(--color-text-tertiary)]",
          children: [modelsStore.embedding.name, " (", modelsStore.embedding.engine, ")"]
        })]
      }), modelsReady.value && jsxs("div", {
        className: "bg-[var(--color-success)]/10 border border-[var(--color-success)]/20 rounded-lg p-3 flex items-center gap-2",
        children: [jsx(CheckCircle2, {
          size: 16,
          className: "text-[var(--color-success)]"
        }), jsx("p", {
          className: "text-sm text-[var(--color-success)] font-medium",
          children: "Todos los modelos listos"
        })]
      })]
    })
  });
}

async function parseTxtFile(file) {
  try {
    console.log(`📄 Parsing TXT file: ${file.name} (${file.size} bytes)`);
    const text = await file.text();
    const cleaned = cleanText(text);
    console.log(`✅ Parsed ${cleaned.length} characters from TXT`);
    return cleaned;
  } catch (error) {
    console.error("❌ Failed to parse TXT file:", error);
    throw new Error(`Failed to parse TXT file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
function cleanText(text) {
  let cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.split("\n").map((line) => line.trim()).join("\n");
  cleaned = cleaned.trim();
  return cleaned;
}
function isTxtFile(file) {
  const txtExtensions = [".txt", ".text"];
  const fileName = file.name.toLowerCase();
  return txtExtensions.some((ext) => fileName.endsWith(ext)) || file.type === "text/plain";
}

let marked = null;
async function loadMarked() {
  if (marked) return marked;
  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/marked/11.1.1/marked.min.js";
  document.head.appendChild(script);
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });
  marked = window.marked;
  return marked;
}
async function parseMarkdownFile(file, preserveFormatting = true) {
  try {
    console.log(`📝 Parsing Markdown file: ${file.name} (${file.size} bytes)`);
    const markdownText = await file.text();
    let result;
    if (preserveFormatting) {
      result = cleanMarkdown(markdownText);
    } else {
      result = await markdownToPlainText(markdownText);
    }
    console.log(`✅ Parsed ${result.length} characters from Markdown`);
    return result;
  } catch (error) {
    console.error("❌ Failed to parse Markdown file:", error);
    throw new Error(`Failed to parse Markdown file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
function cleanMarkdown(text) {
  let cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.split("\n").map((line) => line.trim()).join("\n");
  return cleaned.trim();
}
async function markdownToPlainText(markdown) {
  const markedLib = await loadMarked();
  markedLib.setOptions({
    renderer: createPlainTextRenderer(),
    breaks: true,
    gfm: true
  });
  const html = await markedLib.parse(markdown);
  const text = htmlToPlainText(html);
  return text;
}
function createPlainTextRenderer() {
  const renderer = {
    // Headings with extra spacing
    heading(text) {
      return `

${text}

`;
    },
    // Paragraphs
    paragraph(text) {
      return `${text}

`;
    },
    // Lists
    list(body) {
      return `${body}
`;
    },
    listitem(text) {
      return `• ${text}
`;
    },
    // Code blocks
    code(code) {
      return `
${code}

`;
    },
    // Inline code
    codespan(code) {
      return code;
    },
    // Links - keep URL in parentheses
    link(href, title, text) {
      return `${text} (${href})`;
    },
    // Images - just the alt text
    image(href, title, text) {
      return text || "";
    },
    // Strong/em - just the text
    strong(text) {
      return text;
    },
    em(text) {
      return text;
    },
    // Line breaks
    br() {
      return "\n";
    },
    // Horizontal rules
    hr() {
      return "\n---\n";
    },
    // Tables - basic formatting
    table(header, body) {
      return `
${header}${body}
`;
    },
    tablerow(content) {
      return `${content}
`;
    },
    tablecell(content) {
      return `${content} `;
    }
  };
  return renderer;
}
function htmlToPlainText(html) {
  let text = html.replace(/<[^>]*>/g, "");
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();
  return text;
}
function isMarkdownFile(file) {
  const mdExtensions = [".md", ".markdown", ".mdown", ".mkd"];
  const fileName = file.name.toLowerCase();
  return mdExtensions.some((ext) => fileName.endsWith(ext)) || file.type === "text/markdown";
}
function extractFrontmatter(markdown) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = markdown.match(frontmatterRegex);
  if (!match) {
    return {
      metadata: {},
      content: markdown
    };
  }
  const [, frontmatter, content] = match;
  const metadata = {};
  frontmatter.split("\n").forEach((line) => {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      metadata[key] = value;
    }
  });
  return {
    metadata,
    content
  };
}

let pdfjsLib = null;
async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  document.head.appendChild(script);
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });
  pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return pdfjsLib;
}
async function parsePdfFile(file, onProgress) {
  try {
    console.log(`📕 Parsing PDF file: ${file.name} (${file.size} bytes)`);
    onProgress?.(0, "Cargando PDF.js...");
    const pdfjs = await loadPdfJs();
    onProgress?.(10, "Cargando PDF...");
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({
      data: arrayBuffer,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true
    });
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    console.log(`📄 PDF has ${pageCount} pages`);
    onProgress?.(10, `PDF cargado: ${pageCount} páginas`);
    const metadata = await pdf.getMetadata();
    const pdfMetadata = {
      title: metadata.info?.Title || file.name,
      author: metadata.info?.Author,
      subject: metadata.info?.Subject,
      pageCount
    };
    const pages = [];
    const textParts = [];
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const progress = 10 + Math.round(pageNum / pageCount * 80);
      onProgress?.(progress, `Procesando página ${pageNum}/${pageCount}...`);
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({
        scale: 1
      });
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => {
        if ("str" in item) {
          return item.str;
        }
        return "";
      }).join(" ");
      const cleanedText = cleanPdfText(pageText);
      if (cleanedText.trim()) {
        pages.push({
          pageNumber: pageNum,
          text: cleanedText,
          metadata: {
            width: viewport.width,
            height: viewport.height
          }
        });
        textParts.push(`[Página ${pageNum}]
${cleanedText}`);
      }
      page.cleanup();
    }
    onProgress?.(95, "Finalizando...");
    const fullText = textParts.join("\n\n");
    onProgress?.(100, "PDF procesado");
    console.log(`✅ Extracted ${fullText.length} characters from ${pageCount} pages`);
    return {
      text: fullText,
      pages,
      metadata: pdfMetadata
    };
  } catch (error) {
    console.error("❌ Failed to parse PDF file:", error);
    throw new Error(`Failed to parse PDF file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}
function cleanPdfText(text) {
  let cleaned = text.replace(/\0/g, "");
  cleaned = cleaned.replace(/\s+/g, " ");
  cleaned = cleaned.replace(/(\w)-\s+(\w)/g, "$1$2").replace(/([a-z])\s+([A-Z])/g, "$1. $2").trim();
  cleaned = cleaned.replace(/([.!?])\s+([A-Z])/g, "$1\n\n$2");
  return cleaned;
}
function isPdfFile(file) {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith(".pdf") || file.type === "application/pdf";
}

async function parseDocument(file, options = {}) {
  const {
    onProgress,
    preserveMarkdownFormatting = true
  } = options;
  console.log(`📄 Parsing document: ${file.name} (${file.type})`);
  const type = detectDocumentType(file);
  if (!type) {
    throw new Error(`Unsupported file type: ${file.name}. Supported types: PDF, TXT, MD`);
  }
  try {
    switch (type) {
      case "pdf": {
        onProgress?.(0, "Procesando PDF...");
        const pdfResult = await parsePdfFile(file, onProgress);
        return {
          text: pdfResult.text,
          type: "pdf",
          metadata: pdfResult.metadata
        };
      }
      case "md": {
        onProgress?.(0, "Procesando Markdown...");
        const text = await parseMarkdownFile(file, preserveMarkdownFormatting);
        const {
          metadata: frontmatter
        } = extractFrontmatter(text);
        onProgress?.(100, "Markdown procesado");
        return {
          text,
          type: "md",
          metadata: {
            frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : void 0
          }
        };
      }
      case "txt": {
        onProgress?.(0, "Procesando texto...");
        const text = await parseTxtFile(file);
        onProgress?.(100, "Texto procesado");
        return {
          text,
          type: "txt"
        };
      }
      default:
        throw new Error(`Unsupported document type: ${type}`);
    }
  } catch (error) {
    console.error(`❌ Failed to parse ${type.toUpperCase()} file:`, error);
    throw error;
  }
}
function detectDocumentType(file) {
  if (isPdfFile(file)) return "pdf";
  if (isMarkdownFile(file)) return "md";
  if (isTxtFile(file)) return "txt";
  return null;
}
function isSupportedDocument(file) {
  return detectDocumentType(file) !== null;
}
function getSupportedExtensions() {
  return [".pdf", ".txt", ".md", ".markdown"];
}
function validateFile(file) {
  if (!isSupportedDocument(file)) {
    return {
      valid: false,
      error: `Tipo de archivo no soportado. Soportados: ${getSupportedExtensions().join(", ")}`
    };
  }
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `Archivo demasiado grande. Máximo: 50MB, actual: ${(file.size / 1024 / 1024).toFixed(1)}MB`
    };
  }
  if (file.size === 0) {
    return {
      valid: false,
      error: "El archivo está vacío"
    };
  }
  return {
    valid: true
  };
}

function DocumentUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  function handleDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }
  function handleDragLeave(e) {
    e.preventDefault();
    setIsDragging(false);
  }
  async function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) {
      await processFiles(files);
    }
  }
  async function handleFileSelect(e) {
    const target = e.target;
    const files = Array.from(target.files || []);
    if (files.length > 0) {
      await processFiles(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }
  async function processFiles(files) {
    for (const file of files) {
      await processFile(file);
    }
  }
  async function processFile(file) {
    try {
      console.log(`📄 Processing file: ${file.name}`);
      if (!modelsReady.value) {
        alert("⚠️ Los modelos de IA aún no están cargados. Por favor, espera a que se completen antes de subir documentos.");
        return;
      }
      const validation = validateFile(file);
      if (!validation.valid) {
        alert(validation.error);
        return;
      }
      processingStore.set({
        documentId: "temp",
        stage: "parsing",
        progress: 0,
        message: "Extrayendo texto..."
      });
      const parsed = await parseDocument(file, {
        onProgress: (progress, message) => {
          processingStore.set({
            documentId: "temp",
            stage: "parsing",
            progress,
            message
          });
        }
      });
      const document = await createDocument({
        name: file.name,
        type: parsed.type,
        content: parsed.text,
        size: file.size,
        metadata: parsed.metadata
      });
      documentsStore.add(document);
      console.log(`✅ Document created: ${document.id}`);
      await processDocumentRAG(document.id, parsed.text);
    } catch (error) {
      console.error("❌ Failed to process file:", error);
      alert(`Error: ${error}`);
      processingStore.clear();
    }
  }
  async function processDocumentRAG(documentId, text) {
    try {
      const settings = await getRAGSettings();
      const embeddingEngine = await EngineManager.getEmbeddingEngine();
      await processDocument(documentId, text, embeddingEngine, settings.chunkSize, (status) => {
        processingStore.set(status);
        documentsStore.update(documentId, {
          status: status.stage === "complete" ? "ready" : "processing"
        });
      });
      processingStore.clear();
      console.log(`✅ Document ${documentId} processed with RAG`);
    } catch (error) {
      console.error("❌ Failed to process document with RAG:", error);
      documentsStore.update(documentId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error"
      });
      processingStore.clear();
    }
  }
  async function deleteDocument(id) {
    if (!confirm("¿Eliminar este documento?")) return;
    try {
      const {
        deleteDocument: dbDeleteDocument
      } = await Promise.resolve().then(() => documents);
      await dbDeleteDocument(id);
      documentsStore.remove(id);
      console.log(`✅ Document ${id} deleted`);
    } catch (error) {
      console.error("Failed to delete document:", error);
      alert(`Error: ${error}`);
    }
  }
  return jsxs(Card, {
    className: "space-y-4",
    children: [jsxs("div", {
      children: [jsx("h3", {
        className: "text-lg font-semibold mb-2",
        children: "Documentos"
      }), jsx("p", {
        className: "text-sm text-[var(--color-text-secondary)]",
        children: "Sube documentos para consultar con IA"
      })]
    }), jsxs("div", {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
      className: `
          border-2 border-dashed rounded-lg p-6 text-center transition-colors
          ${isDragging ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5" : "border-[var(--color-border)] hover:border-[var(--color-primary)]"}
        `,
      children: [jsx("input", {
        ref: fileInputRef,
        type: "file",
        accept: ".pdf,.txt,.md,.markdown",
        multiple: true,
        onChange: handleFileSelect,
        className: "hidden"
      }), jsxs("div", {
        className: "space-y-2",
        children: [jsx("div", {
          className: "text-[var(--color-primary)] flex justify-center",
          children: jsx(UploadCloud, {
            size: 48,
            strokeWidth: 1.5
          })
        }), jsx("p", {
          className: "text-sm font-medium",
          children: "Arrastra archivos aquí o"
        }), jsx(Button, {
          variant: "default",
          size: "sm",
          onClick: () => fileInputRef.current?.click(),
          disabled: !modelsReady.value,
          children: modelsReady.value ? "Seleccionar archivos" : "Esperando modelos..."
        }), jsx("p", {
          className: "text-xs text-[var(--color-text-tertiary)]",
          children: modelsReady.value ? "PDF, TXT, MD (máx. 50MB)" : "⏳ Los modelos deben cargarse primero"
        })]
      })]
    }), processingStore.current && jsx("div", {
      className: "bg-[var(--color-bg-secondary)] rounded-lg p-4",
      children: jsx(ProgressBar, {
        progress: processingStore.current.progress,
        label: processingStore.current.message,
        variant: processingStore.current.stage === "error" ? "error" : "default"
      })
    }), documentsStore.all.length > 0 && jsxs("div", {
      className: "space-y-2",
      children: [jsx("h4", {
        className: "font-medium text-sm",
        children: "Documentos cargados"
      }), documentsStore.all.map((doc) => jsxs("div", {
        className: "flex items-center justify-between p-3 bg-[var(--color-bg-secondary)] rounded-lg",
        children: [jsxs("div", {
          className: "flex-1 min-w-0",
          children: [jsx("p", {
            className: "font-medium text-sm truncate",
            children: doc.name
          }), jsxs("p", {
            className: "text-xs text-[var(--color-text-tertiary)]",
            children: [(doc.size / 1024).toFixed(1), " KB · ", doc.type.toUpperCase()]
          })]
        }), jsxs("div", {
          className: "flex items-center gap-2",
          children: [doc.status === "ready" && jsx("span", {
            className: "text-xs text-[var(--color-success)] font-bold",
            children: "READY"
          }), doc.status === "processing" && jsx("span", {
            className: "spinner text-[var(--color-primary)]"
          }), doc.status === "error" && jsx("span", {
            className: "text-xs text-[var(--color-error)]",
            title: doc.errorMessage,
            children: "✗"
          }), jsx(Button, {
            variant: "ghost",
            size: "sm",
            onClick: () => deleteDocument(doc.id),
            children: jsx(Trash2, {
              size: 16
            })
          })]
        })]
      }, doc.id))]
    })]
  });
}

function AppLayout() {
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  return jsxs(Fragment, {
    children: [jsxs("div", {
      className: "h-screen bg-[var(--color-bg)] flex overflow-hidden",
      children: [jsx(Sidebar, {
        onDocumentClick: (id) => setSelectedDocumentId(id),
        onShowModelSelector: () => setShowModelSelector(true),
        onShowDocumentUpload: () => setShowDocumentUpload(true)
      }), jsx("main", {
        className: "flex-1 flex flex-col lg:ml-64",
        children: jsx(ChatInterface, {})
      })]
    }), selectedDocumentId && jsx(DocumentViewer, {
      documentId: selectedDocumentId,
      onClose: () => setSelectedDocumentId(null)
    }), showModelSelector && jsx("div", {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4",
      children: jsxs("div", {
        className: "w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl",
        children: [jsxs("div", {
          className: "sticky top-0 bg-[var(--color-bg)] border-b border-[var(--color-border)] px-6 py-4 flex items-center justify-between z-10",
          children: [jsx("h2", {
            className: "text-lg font-semibold",
            children: "Configurar Modelos"
          }), jsx("button", {
            onClick: () => setShowModelSelector(false),
            className: "w-8 h-8 rounded-lg hover:bg-[var(--color-bg-secondary)] flex items-center justify-center transition-colors",
            "aria-label": "Cerrar",
            children: jsx("svg", {
              width: "18",
              height: "18",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: jsx("path", {
                d: "M18 6L6 18M6 6l12 12"
              })
            })
          })]
        }), jsx("div", {
          className: "p-6",
          children: jsx(ModelSelector, {})
        })]
      })
    }), showDocumentUpload && jsx("div", {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4",
      children: jsxs("div", {
        className: "w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl",
        children: [jsxs("div", {
          className: "sticky top-0 bg-[var(--color-bg)] border-b border-[var(--color-border)] px-6 py-4 flex items-center justify-between z-10",
          children: [jsx("h2", {
            className: "text-lg font-semibold",
            children: "Subir Documentos"
          }), jsx("button", {
            onClick: () => setShowDocumentUpload(false),
            className: "w-8 h-8 rounded-lg hover:bg-[var(--color-bg-secondary)] flex items-center justify-center transition-colors",
            "aria-label": "Cerrar",
            children: jsx("svg", {
              width: "18",
              height: "18",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
              children: jsx("path", {
                d: "M18 6L6 18M6 6l12 12"
              })
            })
          })]
        }), jsx("div", {
          className: "p-6",
          children: jsx(DocumentUpload, {})
        })]
      })
    })]
  });
}

const $$Index = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`<html lang="es" data-theme="dark"> <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Edge.AI - 100% Local AI Platform</title><meta name="description" content="Plataforma de IA conversacional 100% local - Sin backend, sin cuentas, sin envío de datos"><link rel="icon" href="/inledai.png">${renderHead()}</head> <body> <!-- Main App Layout --> ${renderComponent($$result, "AppLayout", AppLayout, { "client:load": true, "client:component-hydration": "load", "client:component-path": "@/components/AppLayout", "client:component-export": "AppLayout" })} <!-- Initialize stores -->  <!-- Background glow effect --> <div class="fixed inset-0 pointer-events-none overflow-hidden -z-10"> <div class="absolute top-0 left-1/4 w-96 h-96 bg-[var(--color-primary)] opacity-5 blur-[120px] rounded-full"></div> <div class="absolute bottom-0 right-1/4 w-96 h-96 bg-[var(--color-primary)] opacity-5 blur-[120px] rounded-full"></div> </div> </body></html>`;
}, "/Users/dev/Documents/edge.ai/src/pages/index.astro", void 0);

const $$file = "/Users/dev/Documents/edge.ai/src/pages/index.astro";
const $$url = "";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Index,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
