// ExportChatbotModal - Modal para exportar chatbot RAG

import { useState, useEffect } from 'preact/hooks';
import { X, Download, Eye, Loader, AlertCircle, FileText, Cpu, Settings } from 'lucide-preact';
import { uiStore, uiSignal, documentsStore } from '@/lib/stores';
import { i18nStore } from '@/lib/stores/i18n';
import { generateChatbotHTML } from '@/lib/export-chatbot';
import { getRAGSettings, getGenerationSettings } from '@/lib/db/settings';
import { modelsStore } from '@/lib/stores';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

export function ExportChatbotModal() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<'config' | 'preview' | 'exporting'>('config');
  const [chatbotName, setChatbotName] = useState(i18nStore.t('exportChatbot.title'));
  const [chatbotDescription, setChatbotDescription] = useState(i18nStore.t('exportChatbot.defaultDescription'));
  const [selectedModel, setSelectedModel] = useState('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
  const [previewHTML, setPreviewHTML] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');

  // RAG Settings
  const [topK, setTopK] = useState(5);
  const [temperature, setTemperature] = useState(0.3);
  const [maxTokens, setMaxTokens] = useState(512);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.35);
  const [chunkWindowSize, setChunkWindowSize] = useState(1);

  useEffect(() => {
    setShow(uiSignal.value.showExportChatbot);

    if (uiSignal.value.showExportChatbot) {
      // Reset to defaults or translated name if empty
      if (!chatbotName || chatbotName === 'Exportar Chatbot' || chatbotName === 'Export Chatbot') {
        setChatbotName(i18nStore.t('exportChatbot.title'));
      }
      if (!chatbotDescription || chatbotDescription === 'Asistente virtual basado en documentos' || chatbotDescription === 'Document-based virtual assistant') {
        setChatbotDescription(i18nStore.t('exportChatbot.defaultDescription'));
      }
      
      // Load current settings
      Promise.all([
        getRAGSettings(),
        getGenerationSettings()
      ]).then(([rag, gen]) => {
        setTopK(rag.topK ?? 5);
        setTemperature(gen.temperature ?? 0.3);
        setMaxTokens(gen.maxTokens ?? 512);
        setSimilarityThreshold(0.35);
        setChunkWindowSize(rag.chunkWindowSize ?? 1);
      }).catch(console.error);

      // Set default model from current selection
      if (modelsStore.chat?.id) {
        setSelectedModel(modelsStore.chat.id);
      }
    }
  }, [uiSignal.value.showExportChatbot]);

  const handleClose = () => {
    uiStore.toggleExportChatbot();
    setStep('config');
    setPreviewHTML(null);
    setExportProgress(0);
  };

  const handleGeneratePreview = async () => {
    setStep('exporting');
    setExportProgress(0);
    setExportStatus(i18nStore.t('exportChatbot.generatingPreview'));
    
    try {
      const html = await generateChatbotHTML({
        name: chatbotName,
        description: chatbotDescription,
        modelId: selectedModel,
        topK,
        temperature,
        maxTokens,
        similarityThreshold,
        chunkWindowSize
      });

      setPreviewHTML(html);
      setStep('preview');
    } catch (error) {
      console.error('Error generating preview:', error);
      alert(`${i18nStore.t('exportChatbot.errorPreview')}: ` + (error as Error).message);
      setStep('config');
    }
  };

  const handleExport = () => {
    if (!previewHTML) return;
    
    setStep('exporting');
    setExportStatus(i18nStore.t('exportChatbot.preparingDownload'));
    setExportProgress(100);
    
    try {
      const blob = new Blob([previewHTML], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${chatbotName.toLowerCase().replace(/\s+/g, '-')}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setTimeout(() => {
        handleClose();
      }, 1000);
    } catch (error) {
      console.error('Error exporting:', error);
      alert(`${i18nStore.t('exportChatbot.errorExport')}: ` + (error as Error).message);
      setStep('preview');
    }
  };

  const readyDocuments = documentsStore.all.filter(d => d.status === 'ready');
  const hasDocuments = readyDocuments.length > 0;

  if (!show) return null;

  return (
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <Card class="w-full max-w-2xl bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div class="p-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Download size={18} class="text-[var(--color-primary)]" />
            <h3 class="font-bold text-sm uppercase tracking-widest">{i18nStore.t('exportChatbot.title')}</h3>
          </div>
          <button
            onClick={handleClose}
            class="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div class="p-6 overflow-y-auto custom-scrollbar flex-1">
          {step === 'config' && (
            <div class="space-y-6">
              {/* Info Box */}
              <div class="p-4 bg-blue-900/20 border border-blue-800 rounded-lg flex items-start gap-3">
                <AlertCircle size={20} class="text-blue-400 flex-shrink-0 mt-0.5" />
                <div class="text-sm text-blue-200">
                  <p class="font-semibold mb-1">{i18nStore.t('exportChatbot.whatIsExported')}</p>
                  <ul class="list-disc list-inside space-y-1 text-blue-300">
                    <li>{i18nStore.t('exportChatbot.docsProcessed', { count: readyDocuments.length })}</li>
                    <li>{i18nStore.t('exportChatbot.precomputedEmbeddings')}</li>
                    <li>{i18nStore.t('exportChatbot.modelInfo', { model: selectedModel.split('-').slice(0, 3).join(' ') })}</li>
                    <li>{i18nStore.t('exportChatbot.webInterface')}</li>
                  </ul>
                </div>
              </div>

              {/* Chatbot Info */}
              <div class="space-y-4">
                <h4 class="text-sm font-bold text-white uppercase tracking-wider">{i18nStore.t('exportChatbot.chatbotInfo')}</h4>
                
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-2">{i18nStore.t('exportChatbot.name')}</label>
                  <input
                    type="text"
                    value={chatbotName}
                    onChange={(e) => setChatbotName((e.target as HTMLInputElement).value)}
                    class="w-full px-4 py-2.5 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                    placeholder={i18nStore.t('exportChatbot.name')}
                  />
                </div>
                
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-2">{i18nStore.t('exportChatbot.description')}</label>
                  <input
                    type="text"
                    value={chatbotDescription}
                    onChange={(e) => setChatbotDescription((e.target as HTMLInputElement).value)}
                    class="w-full px-4 py-2.5 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                    placeholder={i18nStore.t('exportChatbot.description')}
                  />
                </div>
              </div>

              {/* Model Selection */}
              <div class="space-y-4">
                <h4 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Cpu size={16} />
                  {i18nStore.t('exportChatbot.aiModel')}
                </h4>
                
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel((e.target as HTMLSelectElement).value)}
                  class="w-full px-4 py-2.5 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg text-white focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                >
                  <option value="SmolLM2-135M-Instruct-q0f16-MLC">SmolLM2 135M ({i18nStore.t('exportChatbot.fastest')})</option>
                  <option value="SmolLM2-360M-Instruct-q4f16_1-MLC">SmolLM2 360M ({i18nStore.t('exportChatbot.mobile')})</option>
                  <option value="Qwen2.5-0.5B-Instruct-q4f16_1-MLC">Qwen 2.5 0.5B ({i18nStore.t('exportChatbot.recommended')})</option>
                  <option value="TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC">TinyLlama 1.1B</option>
                  <option value="Llama-3.2-1B-Instruct-q4f16_1-MLC">Llama 3.2 1B</option>
                  <option value="Phi-3.5-mini-instruct-q4f16_1-MLC">Phi-3.5 Mini ({i18nStore.t('exportChatbot.premium')})</option>
                </select>
              </div>

              {/* RAG Settings */}
              <div class="space-y-4">
                <h4 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Settings size={16} />
                  {i18nStore.t('exportChatbot.ragConfig')}
                </h4>
                
                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <label class="text-sm text-gray-300">{i18nStore.t('exportChatbot.topK')}</label>
                    <span class="text-sm font-mono text-[var(--color-primary)]">{topK}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={topK}
                    onInput={(e) => setTopK(parseInt((e.target as HTMLInputElement).value))}
                    class="w-full h-2 bg-[var(--color-bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
                  />
                </div>

                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <label class="text-sm text-gray-300">{i18nStore.t('exportChatbot.temperature')}</label>
                    <span class="text-sm font-mono text-[var(--color-primary)]">{temperature.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={temperature}
                    onInput={(e) => setTemperature(parseFloat((e.target as HTMLInputElement).value))}
                    class="w-full h-2 bg-[var(--color-bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
                  />
                </div>

                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <label class="text-sm text-gray-300">{i18nStore.t('exportChatbot.maxTokens')}</label>
                    <span class="text-sm font-mono text-[var(--color-primary)]">{maxTokens}</span>
                  </div>
                  <input
                    type="range"
                    min="128"
                    max="2048"
                    step="64"
                    value={maxTokens}
                    onInput={(e) => setMaxTokens(parseInt((e.target as HTMLInputElement).value))}
                    class="w-full h-2 bg-[var(--color-bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
                  />
                </div>
              </div>

              {/* Documents Summary */}
              <div class="p-4 bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)]">
                <div class="flex items-center gap-2 mb-2">
                  <FileText size={16} class="text-[var(--color-primary)]" />
                  <span class="text-sm font-medium text-white">{i18nStore.t('exportChatbot.docsToExport')}</span>
                </div>
                <div class="text-xs text-gray-400">
                  {readyDocuments.map(d => d.name).join(', ')}
                </div>
              </div>
            </div>
          )}

          {step === 'preview' && previewHTML && (
            <div class="space-y-4">
              <div class="flex items-center gap-2 text-sm text-gray-400 mb-4">
                <Eye size={16} />
                <span>{i18nStore.t('exportChatbot.previewTitle')}</span>
              </div>
              
              <div class="border border-[var(--color-border)] rounded-lg overflow-hidden" style={{ height: '500px' }}>
                <iframe
                  srcDoc={previewHTML}
                  class="w-full h-full bg-white"
                  title="Vista previa"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          )}

          {step === 'exporting' && (
            <div class="flex flex-col items-center justify-center py-12">
              <Loader class="w-12 h-12 text-[var(--color-primary)] animate-spin mb-4" />
              <h3 class="text-lg font-bold text-white mb-2">{i18nStore.t('exportChatbot.exporting')}</h3>
              <p class="text-sm text-gray-400 mb-4">{exportStatus}</p>
              {exportProgress > 0 && (
                <div class="w-64 bg-[var(--color-bg-tertiary)] rounded-full h-2 overflow-hidden">
                  <div
                    class="h-full bg-[var(--color-primary)] transition-all duration-300"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'exporting' && (
          <div class="p-4 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex justify-between items-center gap-3">
            {step === 'preview' ? (
              <>
                <Button onClick={() => setStep('config')} variant="ghost" size="sm">
                  {i18nStore.t('exportChatbot.back')}
                </Button>
                <Button onClick={handleExport} variant="primary" size="sm" class="flex items-center gap-2">
                  <Download size={16} />
                  {i18nStore.t('exportChatbot.downloadHTML')}
                </Button>
              </>
            ) : (
              <>
                <div></div>
                <Button
                  onClick={handleGeneratePreview}
                  variant="primary"
                  size="sm"
                  disabled={!hasDocuments}
                  class="flex items-center gap-2"
                >
                  <Eye size={16} />
                  {hasDocuments ? i18nStore.t('exportChatbot.generatePreview') : i18nStore.t('exportChatbot.uploadFirst')}
                </Button>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
