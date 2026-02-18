// ConstructorApp - Principal componente para crear chatbots RAG

import { useState, useRef } from 'preact/hooks';
import { Upload, FileText, Settings, Download, CheckCircle, AlertCircle, Loader, X, Trash2, Eye, Cpu } from 'lucide-preact';
import { DocumentUploader } from './DocumentUploader';
import { RAGConfigPanel } from './RAGConfigPanel';
import { ModelSelector } from './ModelSelector';
import { exportChatbotHTML } from '../lib/export-chatbot';
import { processDocumentsWithEmbeddings } from '../lib/process-documents';
import type { DocumentWithEmbeddings, RAGConfig, ChatbotConfig } from '../types/constructor';

export function ConstructorApp() {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [documents, setDocuments] = useState<DocumentWithEmbeddings[]>([]);
  const [ragConfig, setRagConfig] = useState<RAGConfig>({
    topK: 5,
    chunkSize: 512,
    chunkOverlap: 50,
    temperature: 0.3,
    maxTokens: 512,
    similarityThreshold: 0.35,
  });
  const [selectedModel, setSelectedModel] = useState<string>('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
  const [chatbotName, setChatbotName] = useState('Mi Chatbot RAG');
  const [chatbotDescription, setChatbotDescription] = useState('Chatbot asistencial basado en documentos');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [previewHTML, setPreviewHTML] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleDocumentsUploaded = async (newDocs: Array<{ name: string; content: string; file: File }>) => {
    setIsProcessing(true);
    setProcessingStatus('Procesando documentos...');
    
    try {
      // Process documents and generate embeddings
      const processedDocs = await processDocumentsWithEmbeddings(
        newDocs.map(d => ({ content: d.content, metadata: { name: d.name } })),
        (progress, status) => {
          setProcessingProgress(progress);
          setProcessingStatus(status);
        }
      );
      
      setDocuments(prev => [...prev, ...processedDocs]);
      setCurrentStep(2);
    } catch (error) {
      console.error('Error processing documents:', error);
      alert('Error al procesar documentos: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
      setProcessingProgress(0);
      setProcessingStatus('');
    }
  };

  const handleRemoveDocument = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfigChange = (config: RAGConfig) => {
    setRagConfig(config);
  };

  const handleModelSelect = (modelId: string) => {
    setSelectedModel(modelId);
  };

  const handleGeneratePreview = async () => {
    if (documents.length === 0) {
      alert('Sube al menos un documento');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Generando vista previa...');
    
    try {
      const config: ChatbotConfig = {
        name: chatbotName,
        description: chatbotDescription,
        model: selectedModel,
        ragConfig: ragConfig,
        documents: documents,
      };
      
      const html = await exportChatbotHTML(config);
      setPreviewHTML(html);
      setShowPreview(true);
    } catch (error) {
      console.error('Error generating preview:', error);
      alert('Error al generar vista previa: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleExport = async () => {
    if (documents.length === 0) {
      alert('Sube al menos un documento');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Exportando chatbot...');
    
    try {
      const config: ChatbotConfig = {
        name: chatbotName,
        description: chatbotDescription,
        model: selectedModel,
        ragConfig: ragConfig,
        documents: documents,
      };
      
      const html = await exportChatbotHTML(config);
      
      // Download the HTML file
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${chatbotName.toLowerCase().replace(/\s+/g, '-')}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting chatbot:', error);
      alert('Error al exportar chatbot: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const steps = [
    { num: 1, title: 'Documentos', icon: FileText },
    { num: 2, title: 'Configuración RAG', icon: Settings },
    { num: 3, title: 'Modelo IA', icon: Cpu },
    { num: 4, title: 'Exportar', icon: Download },
  ];

  return (
    <div class="max-w-6xl mx-auto">
      {/* Progress Steps */}
      <div class="mb-8">
        <div class="flex items-center justify-between relative">
          {/* Progress Line */}
          <div class="absolute left-0 right-0 top-6 h-0.5 bg-gray-700">
            <div 
              class="h-full bg-[var(--inled-green)] transition-all duration-500"
              style={{ width: `${((currentStep - 1) / 3) * 100}%` }}
            />
          </div>
          
          {steps.map((step) => {
            const Icon = step.icon;
            const isCompleted = currentStep > step.num;
            const isCurrent = currentStep === step.num;
            
            return (
              <div key={step.num} class="relative flex flex-col items-center gap-2">
                <div
                  class={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    isCompleted
                      ? 'bg-[var(--inled-green)] border-[var(--inled-green)] text-black'
                      : isCurrent
                      ? 'bg-transparent border-[var(--inled-green)] text-[var(--inled-green)]'
                      : 'bg-gray-800 border-gray-600 text-gray-400'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle size={20} />
                  ) : (
                    <Icon size={20} />
                  )}
                </div>
                <span
                  class={`text-xs font-medium ${
                    isCurrent ? 'text-[var(--inled-green)]' : 'text-gray-400'
                  }`}
                >
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Processing Overlay */}
      {isProcessing && (
        <div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div class="card-custom rounded-2xl p-8 max-w-md w-full mx-4 text-center">
            <Loader class="w-12 h-12 text-[var(--inled-green)] animate-spin mx-auto mb-4" />
            <h3 class="text-lg font-bold text-white mb-2">Procesando...</h3>
            <p class="text-sm text-gray-400 mb-4">{processingStatus}</p>
            {processingProgress > 0 && (
              <div class="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  class="progress-bar h-full transition-all duration-300"
                  style={{ width: `${processingProgress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && previewHTML && (
        <div class="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-gray-900 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div class="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 class="text-lg font-bold text-white">Vista Previa del Chatbot</h3>
              <button
                onClick={() => setShowPreview(false)}
                class="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <iframe
              srcDoc={previewHTML}
              class="flex-1 w-full bg-white"
              title="Vista previa"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      )}

      {/* Step Content */}
      <div class="card-custom rounded-2xl p-6 md:p-8">
        {currentStep === 1 && (
          <div class="space-y-6">
            <div class="text-center mb-8">
              <h2 class="text-2xl font-bold text-white mb-2">Sube tus Documentos</h2>
              <p class="text-gray-400">PDF, TXT o Markdown. El chatbot responderá basándose en su contenido.</p>
            </div>

            {/* Chatbot Info */}
            <div class="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">Nombre del Chatbot</label>
                <input
                  type="text"
                  value={chatbotName}
                  onChange={(e) => setChatbotName((e.target as HTMLInputElement).value)}
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-[var(--inled-green)] transition-colors"
                  placeholder="Mi Chatbot RAG"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">Descripción</label>
                <input
                  type="text"
                  value={chatbotDescription}
                  onChange={(e) => setChatbotDescription((e.target as HTMLInputElement).value)}
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-[var(--inled-green)] transition-colors"
                  placeholder="Chatbot asistencial..."
                />
              </div>
            </div>

            {/* Document Uploader */}
            <DocumentUploader onDocumentsUploaded={handleDocumentsUploaded} disabled={isProcessing} />

            {/* Documents List */}
            {documents.length > 0 && (
              <div class="mt-6">
                <h3 class="text-lg font-bold text-white mb-4">
                  Documentos ({documents.length})
                </h3>
                <div class="space-y-2 max-h-64 overflow-y-auto">
                  {documents.map((doc, index) => (
                    <div
                      key={index}
                      class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-[var(--inled-green)] transition-colors"
                    >
                      <div class="flex items-center gap-3">
                        <FileText size={18} class="text-[var(--inled-green)]" />
                        <div>
                          <p class="text-sm font-medium text-white">{doc.metadata.name || `Documento ${index + 1}`}</p>
                          <p class="text-xs text-gray-400">
                            {doc.content.length} caracteres • Embedding: {doc.embedding.length} dimensiones
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveDocument(index)}
                        class="p-2 hover:bg-red-900/50 rounded-lg transition-colors text-gray-400 hover:text-red-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {documents.length > 0 && (
              <div class="flex justify-end pt-6">
                <button
                  onClick={() => setCurrentStep(2)}
                  class="btn-primary px-8 py-3 rounded-lg font-semibold"
                >
                  Continuar →
                </button>
              </div>
            )}
          </div>
        )}

        {currentStep === 2 && (
          <div class="space-y-6">
            <div class="text-center mb-8">
              <h2 class="text-2xl font-bold text-white mb-2">Configuración RAG</h2>
              <p class="text-gray-400">Ajusta cómo el chatbot buscará y usará la información.</p>
            </div>

            <RAGConfigPanel config={ragConfig} onChange={handleConfigChange} />

            <div class="flex justify-between pt-6">
              <button
                onClick={() => setCurrentStep(1)}
                class="px-6 py-3 rounded-lg font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              >
                ← Atrás
              </button>
              <button
                onClick={() => setCurrentStep(3)}
                class="btn-primary px-8 py-3 rounded-lg font-semibold"
              >
                Continuar →
              </button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div class="space-y-6">
            <div class="text-center mb-8">
              <h2 class="text-2xl font-bold text-white mb-2">Modelo de IA</h2>
              <p class="text-gray-400">Selecciona el modelo que usará el chatbot para responder.</p>
            </div>

            <ModelSelector selectedModel={selectedModel} onSelect={handleModelSelect} />

            <div class="flex justify-between pt-6">
              <button
                onClick={() => setCurrentStep(2)}
                class="px-6 py-3 rounded-lg font-medium text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              >
                ← Atrás
              </button>
              <button
                onClick={() => setCurrentStep(4)}
                class="btn-primary px-8 py-3 rounded-lg font-semibold"
              >
                Continuar →
              </button>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div class="space-y-6">
            <div class="text-center mb-8">
              <h2 class="text-2xl font-bold text-white mb-2">Exportar Chatbot</h2>
              <p class="text-gray-400">Tu chatbot está listo. Exporta el HTML para usarlo en tu sitio web.</p>
            </div>

            {/* Summary */}
            <div class="grid md:grid-cols-3 gap-4 mb-6">
              <div class="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div class="text-2xl font-bold text-[var(--inled-green)] mb-1">{documents.length}</div>
                <div class="text-sm text-gray-400">Documentos</div>
              </div>
              <div class="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div class="text-sm font-medium text-white mb-1">Modelo</div>
                <div class="text-xs text-gray-400 truncate">{selectedModel}</div>
              </div>
              <div class="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <div class="text-sm font-medium text-white mb-1">Top-K</div>
                <div class="text-xs text-gray-400">{ragConfig.topK} fragmentos</div>
              </div>
            </div>

            {/* Info Box */}
            <div class="p-4 bg-blue-900/20 border border-blue-800 rounded-lg flex items-start gap-3">
              <AlertCircle size={20} class="text-blue-400 flex-shrink-0 mt-0.5" />
              <div class="text-sm text-blue-200">
                <p class="font-semibold mb-1">El HTML exportado incluye:</p>
                <ul class="list-disc list-inside space-y-1 text-blue-300">
                  <li>Embeddings pre-calculados (sin procesamiento en tiempo real)</li>
                  <li>Modelo de IA seleccionado (se descarga la primera vez)</li>
                  <li>Interfaz estilo Zendesk con colores Inledai</li>
                  <li>Todo el código necesario para funcionar offline</li>
                </ul>
              </div>
            </div>

            <div class="flex justify-center gap-4 pt-6">
              <button
                onClick={handleGeneratePreview}
                disabled={isProcessing || documents.length === 0}
                class="px-6 py-3 rounded-lg font-medium border border-[var(--inled-green)] text-[var(--inled-green)] hover:bg-[var(--inled-green)]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Eye size={18} />
                Vista Previa
              </button>
              <button
                onClick={handleExport}
                disabled={isProcessing || documents.length === 0}
                class="btn-primary px-8 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Download size={18} />
                Exportar HTML
              </button>
            </div>

            <div class="text-center pt-6">
              <button
                onClick={() => setCurrentStep(1)}
                class="text-sm text-gray-400 hover:text-white transition-colors"
              >
                ← Volver al inicio
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
