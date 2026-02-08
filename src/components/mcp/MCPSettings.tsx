import { useState, useEffect } from 'preact/hooks';
import { X, Plus, Server, CheckCircle, AlertCircle, RefreshCw, Trash2, Power, Globe, Radio, Edit2, Zap, Eye, Code } from 'lucide-preact';
import { Button } from '../ui/Button';
import { i18nStore } from '@/lib/stores/i18n';
import { getMCPServers, addMCPServer, deleteMCPServer, updateMCPServer } from '@/lib/db/mcp';
import { getSetting, setSetting } from '@/lib/db/settings';
import { mcpManager, type MCPTool } from '@/lib/ai/mcp-manager';
import type { MCPServer } from '@/types';
import { cn } from '@/lib/utils';

interface MCPSettingsProps {
  onClose: () => void;
}

export function MCPSettings({ onClose }: MCPSettingsProps) {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [useToolEngine, setUseToolEngine] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewingTools, setViewingTools] = useState<{serverName: string, tools: MCPTool[]} | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newServer, setNewServer] = useState<{
    name: string;
    url: string;
    transport: 'http' | 'websocket';
    headers: { key: string; value: string }[];
  }>({
    name: '',
    url: '',
    transport: 'http',
    headers: []
  });

  useEffect(() => {
    loadServers();
    getSetting('useSpecializedToolModel').then(v => setUseToolEngine(v !== false));
  }, []);

  async function loadServers() {
    setLoading(true);
    try {
      const all = await getMCPServers();
      setServers(all);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleToolEngine() {
    const newValue = !useToolEngine;
    setUseToolEngine(newValue);
    await setSetting('useSpecializedToolModel', newValue);
  }

  async function handleViewTools(server: MCPServer) {
    const tools = await mcpManager.getTools(server.name);
    setViewingTools({ serverName: server.name, tools });
  }

  function startEditing(server: MCPServer) {
    setEditingId(server.id);
    setNewServer({
      name: server.name,
      url: server.url,
      transport: server.transport,
      headers: server.headers 
        ? Object.entries(server.headers).map(([key, value]) => ({ key, value }))
        : []
    });
    setShowAddForm(true);
  }

  async function handleAddServer(e: Event) {
    e.preventDefault();
    if (!newServer.name || !newServer.url) return;

    const headersObj: Record<string, string> = {};
    newServer.headers.forEach(h => {
      if (h.key.trim()) {
        headersObj[h.key.trim()] = h.value;
      }
    });

    try {
      if (editingId) {
        await updateMCPServer(editingId, {
           name: newServer.name,
           url: newServer.url,
           transport: newServer.transport,
           headers: Object.keys(headersObj).length > 0 ? headersObj : undefined,
           status: 'disconnected'
        });
        await mcpManager.disconnect(editingId);
      } else {
        await addMCPServer({
          name: newServer.name,
          url: newServer.url,
          transport: newServer.transport,
          headers: Object.keys(headersObj).length > 0 ? headersObj : undefined,
          enabled: true
        });
      }
      
      setShowAddForm(false);
      setEditingId(null);
      setNewServer({ name: '', url: '', transport: 'http', headers: [] });
      await loadServers();
      await mcpManager.initialize(); 
      await loadServers();
    } catch (err) {
      console.error(err);
      alert('Error adding/updating server');
    }
  }

  function addHeaderRow() {
    setNewServer({
      ...newServer,
      headers: [...newServer.headers, { key: '', value: '' }]
    });
  }

  function updateHeader(index: number, field: 'key' | 'value', value: string) {
    const updated = [...newServer.headers];
    updated[index][field] = value;
    setNewServer({ ...newServer, headers: updated });
  }

  function removeHeader(index: number) {
    setNewServer({
      ...newServer,
      headers: newServer.headers.filter((_, i) => i !== index)
    });
  }

  async function handleDelete(id: string) {
    if (confirm(i18nStore.t('common.confirmDelete'))) {
      await mcpManager.disconnect(id);
      await deleteMCPServer(id);
      await loadServers();
    }
  }

  async function handleToggle(server: MCPServer) {
    const newState = !server.enabled;
    await updateMCPServer(server.id, { enabled: newState });
    if (newState) {
      await mcpManager.connect(server);
    } else {
      await mcpManager.disconnect(server.id);
    }
    await loadServers();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Server className="text-[var(--color-primary)]" />
              {i18nStore.t('mcp.title')}
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {i18nStore.t('mcp.subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* Specialized Engine Toggle */}
          <div className="mb-8 bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 flex items-center justify-between">
            <div className="flex gap-3">
              <div className="p-2 bg-[var(--color-primary)]/10 rounded-lg text-[var(--color-primary)]">
                <Zap size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--color-text)]">{i18nStore.t('mcp.specializedEngine')}</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  {i18nStore.t('mcp.specializedDesc')}
                </p>
              </div>
            </div>
            <button
              onClick={handleToggleToolEngine}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                useToolEngine ? "bg-blue-500" : "bg-gray-600"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  useToolEngine ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>

          {/* Server List */}
          <div className="space-y-4">
            {servers.map(server => (
              <div key={server.id} className="bg-[var(--color-bg-tertiary)]/30 border border-[var(--color-border)] rounded-xl p-4 flex items-center justify-between group">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "p-3 rounded-lg flex items-center justify-center",
                    server.status === 'connected' ? "bg-green-500/20 text-green-500" :
                    server.status === 'error' ? "bg-red-500/20 text-red-500" :
                    "bg-gray-500/20 text-gray-500"
                  )}>
                    {server.transport === 'websocket' ? <RefreshCw size={20} /> : <Globe size={20} />}
                  </div>
                  <div>
                    <h3 className="font-medium text-[var(--color-text)] flex items-center gap-2">
                      {server.name}
                      {server.status === 'connected' && <span className="text-[10px] bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded-full">{i18nStore.t('mcp.active')}</span>}
                      {server.status === 'error' && <span className="text-[10px] bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded-full">{i18nStore.t('mcp.error')}</span>}
                    </h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1 font-mono">{server.url}</p>
                    
                    {server.headers && Object.keys(server.headers).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Object.keys(server.headers).map(key => (
                          <span key={key} className="text-[9px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded-md">
                            {key}: ***
                          </span>
                        ))}
                      </div>
                    )}

                    {server.errorMessage && <p className="text-xs text-red-400 mt-1">{server.errorMessage}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewTools(server)}
                    className="p-2 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-colors"
                    title={i18nStore.t('mcp.viewTools')}
                  >
                    <Eye size={18} />
                  </button>
                  <button
                    onClick={() => handleToggle(server)}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      server.enabled ? "text-green-500 hover:bg-green-500/10" : "text-gray-500 hover:bg-gray-500/10"
                    )}
                  >
                    <Power size={18} />
                  </button>
                  <button
                    onClick={() => startEditing(server)}
                    className="p-2 rounded-lg text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors opacity-0 group-hover:opacity-100"
                    title={i18nStore.t('common.edit')}
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(server.id)}
                    className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title={i18nStore.t('common.delete')}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}

            {servers.length === 0 && !showAddForm && (
              <div className="text-center py-8 text-[var(--color-text-secondary)]">
                <Server size={48} className="mx-auto mb-4 opacity-20" />
                <p>{i18nStore.t('mcp.noServers')}</p>
                <Button variant="ghost" className="mt-2" onClick={() => setShowAddForm(true)}>
                  {i18nStore.t('mcp.connectFirst')}
                </Button>
              </div>
            )}
          </div>

          {/* Add Form */}
          {showAddForm ? (
            <form onSubmit={handleAddServer} className="mt-6 bg-[var(--color-bg-tertiary)]/50 border border-[var(--color-border)] rounded-xl p-4 animate-in fade-in slide-in-from-top-4">
              <h3 className="font-medium mb-4">{editingId ? i18nStore.t('mcp.editServer') : i18nStore.t('mcp.addServer')}</h3>
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">{i18nStore.t('mcp.name')}</label>
                    <input
                      type="text"
                      required
                      placeholder={i18nStore.t('mcp.placeholderName')}
                      value={newServer.name}
                      onChange={(e) => setNewServer({ ...newServer, name: (e.target as HTMLInputElement).value })}
                      className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--color-primary)] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] mb-1">{i18nStore.t('mcp.transport')}</label>
                    <div className="flex items-center gap-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-1">
                      <button
                        type="button"
                        onClick={() => setNewServer({...newServer, transport: 'http'})}
                        className={cn(
                          "flex-1 text-xs py-1.5 rounded-md transition-colors",
                          newServer.transport === 'http' ? "bg-[var(--color-primary)] text-black font-medium" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                        )}
                      >
                        HTTP
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewServer({...newServer, transport: 'websocket'})}
                        className={cn(
                          "flex-1 text-xs py-1.5 rounded-md transition-colors",
                          newServer.transport === 'websocket' ? "bg-[var(--color-primary)] text-black font-medium" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                        )}
                      >
                        WebSocket
                      </button>
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs text-[var(--color-text-secondary)] mb-1">{i18nStore.t('mcp.url')}</label>
                  <input
                    type="url"
                    required
                    placeholder={newServer.transport === 'http' ? "https://mcp.notion.com/sse" : "ws://localhost:3000/ws"}
                    value={newServer.url}
                    onChange={(e) => setNewServer({ ...newServer, url: (e.target as HTMLInputElement).value })}
                    className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--color-primary)] outline-none font-mono"
                  />
                  <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">
                    {i18nStore.t('mcp.tipStreamable')}
                  </p>
                </div>

                {/* Headers Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs text-[var(--color-text-secondary)]">{i18nStore.t('mcp.headers')}</label>
                    <button
                      type="button"
                      onClick={addHeaderRow}
                      className="text-[10px] text-[var(--color-primary)] hover:underline flex items-center gap-1"
                    >
                      <Plus size={10} /> {i18nStore.t('mcp.addHeader')}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {newServer.headers.map((h, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Key"
                          value={h.key}
                          onChange={(e) => updateHeader(i, 'key', (e.target as HTMLInputElement).value)}
                          className="flex-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs focus:border-[var(--color-primary)] outline-none"
                        />
                        <input
                          type="text"
                          placeholder="Value"
                          value={h.value}
                          onChange={(e) => updateHeader(i, 'value', (e.target as HTMLInputElement).value)}
                          className="flex-[1.5] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-xs focus:border-[var(--color-primary)] outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeHeader(i)}
                          className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {newServer.headers.length === 0 && (
                      <p className="text-[10px] text-[var(--color-text-tertiary)] italic">{i18nStore.t('mcp.noHeaders')}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => {
                    setShowAddForm(false);
                    setEditingId(null);
                    setNewServer({ name: '', url: '', transport: 'http', headers: [] });
                  }}>
                    {i18nStore.t('mcp.cancel')}
                  </Button>
                  <Button type="submit" variant="primary" size="sm">
                    {editingId ? i18nStore.t('mcp.update') : i18nStore.t('mcp.connect')}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div className="mt-6 flex justify-center">
              <Button onClick={() => setShowAddForm(true)} variant="outline" className="gap-2">
                <Plus size={16} />
                {i18nStore.t('mcp.addServer')}
              </Button>
            </div>
          )}

        </div>
      </div>

      {/* Viewing Tools Sub-Modal */}
      {viewingTools && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl w-full max-w-xl max-h-[70vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h3 className="font-bold flex items-center gap-2">
                <Code size={18} className="text-blue-500" />
                {i18nStore.t('mcp.toolsFor').replace('{name}', viewingTools.serverName)}
              </h3>
              <button onClick={() => setViewingTools(null)} className="p-1 hover:bg-[var(--color-bg-tertiary)] rounded-md">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {viewingTools.tools.length === 0 ? (
                <p className="text-center text-sm text-[var(--color-text-secondary)] py-8">{i18nStore.t('mcp.noTools')}</p>
              ) : (
                viewingTools.tools.map(tool => (
                  <div key={tool.name} className="p-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg">
                    <div className="text-sm font-bold text-blue-400 mb-1">{tool.name}</div>
                    <p className="text-xs text-[var(--color-text-secondary)] mb-2">{tool.description}</p>
                    <div className="text-[10px] font-mono bg-black/20 p-2 rounded border border-[var(--color-border)] overflow-x-auto">
                      {JSON.stringify(tool.inputSchema || tool.parameters, null, 2)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}