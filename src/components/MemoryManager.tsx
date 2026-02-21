import { useState, useEffect } from 'preact/hooks';
import { X, Brain, Trash2, Plus, Save, AlertCircle, Check, Edit2 } from 'lucide-preact';
import { i18nStore } from '@/lib/stores/i18n';
import { getMemories, addMemory, deleteMemory, clearMemories, updateMemory, type Memory } from '@/lib/db/memories';
import { memoryNotificationSignal } from '@/lib/stores';

export function MemoryNotificationContainer() {
  const notification = memoryNotificationSignal.value;
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  if (!notification) return null;

  useEffect(() => {
    setEditContent(notification.content);
    setIsEditing(false);
  }, [notification]);

  const handleClose = () => {
    memoryNotificationSignal.value = null;
  };

  const handleSaveEdit = async () => {
    await updateMemory(notification.memoryId, editContent);
    setIsEditing(false);
    memoryNotificationSignal.value = { ...notification, content: editContent };
    // Mantener un poco más si se editó, luego cerrar
    setTimeout(handleClose, 2000);
  };

  const handleDelete = async () => {
    await deleteMemory(notification.memoryId);
    handleClose();
  };

  return (
    <div className="fixed bottom-24 right-6 z-[60] w-80 bg-[var(--color-bg-secondary)] border border-[var(--color-primary)]/30 rounded-2xl shadow-2xl shadow-[var(--color-primary)]/10 animate-in slide-in-from-right-10 duration-500">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--color-primary)]">
            <Brain size={16} className="animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest">{i18nStore.t('memory.newAdded') || 'Memory Added'}</span>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
            <X size={14} className="text-[var(--color-text-tertiary)]" />
          </button>
        </div>

        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onInput={(e) => setEditContent(e.currentTarget.value)}
              className="w-full p-2 text-xs bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-primary)]/50 min-h-[60px]"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsEditing(false)} className="text-[10px] text-[var(--color-text-tertiary)] hover:underline">
                {i18nStore.t('common.cancel')}
              </button>
              <button onClick={handleSaveEdit} className="flex items-center gap-1 text-[10px] text-[var(--color-primary)] font-bold hover:underline">
                <Check size={10} /> {i18nStore.t('common.save')}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed italic">
            "{notification.content}"
          </p>
        )}

        {!isEditing && (
          <div className="flex items-center justify-end gap-3 pt-1 border-t border-[var(--color-border)]/30">
            <button onClick={() => setIsEditing(true)} className="flex items-center gap-1 text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-colors">
              <Edit2 size={10} /> {i18nStore.t('common.edit')}
            </button>
            <button onClick={handleDelete} className="flex items-center gap-1 text-[10px] text-[var(--color-text-tertiary)] hover:text-red-400 transition-colors">
              <Trash2 size={10} /> {i18nStore.t('common.delete')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface MemoryManagerProps {
  onClose: () => void;
}

export function MemoryManager({ onClose }: MemoryManagerProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newMemory, setNewMemory] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMemories();
  }, []);

  async function loadMemories() {
    setLoading(true);
    try {
      const loaded = await getMemories();
      setMemories(loaded);
    } catch (error) {
      console.error('Failed to load memories:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMemory() {
    if (!newMemory.trim()) return;

    try {
      await addMemory(newMemory.trim(), 'user');
      setNewMemory('');
      setIsAdding(false);
      await loadMemories();
    } catch (error) {
      console.error('Failed to add memory:', error);
    }
  }

  async function handleDeleteMemory(id: string) {
    if (!confirm(i18nStore.t('common.confirmDelete'))) return;

    try {
      await deleteMemory(id);
      await loadMemories();
    } catch (error) {
      console.error('Failed to delete memory:', error);
    }
  }

  async function handleClearAll() {
    if (!confirm(i18nStore.t('common.confirmDeleteAll'))) return;

    try {
      await clearMemories();
      await loadMemories();
    } catch (error) {
      console.error('Failed to clear memories:', error);
    }
  }

  function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center bg-[var(--color-bg-secondary)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <Brain size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--color-text-primary)]">{i18nStore.t('memory.title') || 'AI Memory'}</h3>
              <p className="text-xs text-[var(--color-text-tertiary)]">{i18nStore.t('memory.subtitle') || 'Personalized context for your chats'}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[var(--color-bg)]">
          
          {/* Add New Memory */}
          <div className="mb-8">
             {!isAdding ? (
               <button 
                 onClick={() => setIsAdding(true)}
                 className="flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
               >
                 <Plus size={16} />
                 {i18nStore.t('memory.add') || 'Add new memory'}
               </button>
             ) : (
               <div className="space-y-3 p-4 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)] animate-in slide-in-from-top-2">
                 <textarea
                   value={newMemory}
                   onInput={(e) => setNewMemory(e.currentTarget.value)}
                   placeholder="E.g., My favorite color is blue..."
                   className="w-full p-3 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-sm focus:border-[var(--color-primary)] outline-none min-h-[80px]"
                 />
                 <div className="flex justify-end gap-2">
                   <button
                     onClick={() => setIsAdding(false)}
                     className="px-3 py-1.5 text-sm rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
                   >
                     {i18nStore.t('common.cancel') || 'Cancel'}
                   </button>
                   <button
                     onClick={handleAddMemory}
                     disabled={!newMemory.trim()}
                     className="px-3 py-1.5 text-sm rounded-md bg-[var(--color-primary)] text-black font-medium disabled:opacity-50"
                   >
                     {i18nStore.t('common.save') || 'Save'}
                   </button>
                 </div>
               </div>
             )}
          </div>

          {/* Memory List */}
          <div className="space-y-4">
             <div className="flex items-center justify-between mb-4">
               <h4 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                 {i18nStore.t('memory.savedMemories') || 'Saved Memories'} ({memories.length})
               </h4>
               {memories.length > 0 && (
                 <button 
                   onClick={handleClearAll}
                   className="text-xs text-[var(--color-error)] hover:underline flex items-center gap-1"
                 >
                   <Trash2 size={12} />
                   {i18nStore.t('common.deleteAll') || 'Delete All'}
                 </button>
               )}
             </div>

             {loading ? (
               <div className="text-center py-8 text-[var(--color-text-tertiary)]">Loading...</div>
             ) : memories.length === 0 ? (
               <div className="text-center py-12 border-2 border-dashed border-[var(--color-border)] rounded-xl">
                 <Brain size={32} className="mx-auto mb-3 text-[var(--color-text-tertiary)] opacity-50" />
                 <p className="text-[var(--color-text-secondary)]">{i18nStore.t('memory.empty') || 'No memories saved yet.'}</p>
                 <p className="text-xs text-[var(--color-text-tertiary)] mt-1 max-w-xs mx-auto">
                   {i18nStore.t('memory.emptyHint') || 'The AI will automatically learn from your conversations, or you can add memories manually.'}
                 </p>
               </div>
             ) : (
               <div className="grid gap-3">
                 {memories.map(memory => (
                   <div key={memory.id} className="group relative p-4 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 transition-all">
                     <p className="text-sm text-[var(--color-text-primary)] pr-8">{memory.content}</p>
                     <div className="flex items-center justify-between mt-3">
                       <span className="text-xs text-[var(--color-text-tertiary)] flex items-center gap-1">
                         {memory.source === 'system' ? <Brain size={12} /> : <Save size={12} />}
                         {formatDate(memory.createdAt)}
                       </span>
                     </div>
                     
                     <button
                       onClick={() => handleDeleteMemory(memory.id)}
                       className="absolute top-3 right-3 p-1.5 rounded-md text-[var(--color-text-tertiary)] opacity-0 group-hover:opacity-100 hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] transition-all"
                       aria-label="Delete memory"
                     >
                       <Trash2 size={14} />
                     </button>
                   </div>
                 ))}
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
