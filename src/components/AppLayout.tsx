// AppLayout - Main application layout with sidebar and modals

import { useState, useEffect } from 'preact/hooks';
import { Sidebar } from './Sidebar';
import { ChatInterface } from './chat/ChatInterface';
import { DocumentViewer } from './DocumentViewer';
import { DocumentUpload } from './DocumentUpload';
import { DocumentCanvas } from './DocumentCanvas';
import { ExtensionsPanel } from './ExtensionsPanel';
import { FirstRunWizard } from './FirstRunWizard';
import { ModelLoadingIndicator } from './ModelLoadingIndicator';
import { ExtensionStatus } from './ExtensionStatus';
import { RAGSettingsPopup } from './RAGSettings';
import { ExportChatbotModal } from './ExportChatbotModal';
import LiveMode from './chat/LiveMode';
import { hasCompletedSetup } from '@/lib/ai/model-settings';
import { autoLoadModels } from '@/lib/ai/model-loader';
import { i18nStore } from '@/lib/stores/i18n';
import { canvasSignal, canvasStore, extensionsSignal, conversationsStore } from '@/lib/stores';
import { checkIfMobile } from '@/lib/ai/device-profile';
import { AlertTriangle, X } from 'lucide-preact';

export function AppLayout() {
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  const [showFirstRunWizard, setShowFirstRunWizard] = useState(false);
  const [showMobileWarning, setShowMobileWarning] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Initialize: Check first run OR auto-load saved models
  useEffect(() => {
    // Listen for PWA installation prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log('✨ PWA install prompt deferred');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check for mobile and if NOT installed as PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    if (checkIfMobile() && !isStandalone) {
      setShowMobileWarning(true);
    }

    async function initialize() {
      const isFirstRun = !hasCompletedSetup();

      if (isFirstRun) {
        // First time: show wizard
        console.log('🆕 First run detected - showing wizard');
        setShowFirstRunWizard(true);
      } else {
        // Subsequent runs: auto-load saved models
        console.log('🔄 Loading saved models...');
        const loaded = await autoLoadModels((type, progress, message) => {
          console.log(`📦 ${type}: ${progress}% - ${message}`);
        });

        if (!loaded) {
          // Models were configured but failed to load
          console.warn('⚠️ Failed to load saved models - showing wizard');
          setShowFirstRunWizard(true);
        }
      }
    }

    initialize();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // Check if it's iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      if (isIOS) {
        alert('Para instalar en iOS: Pulsa el botón "Compartir" (cuadrado con flecha) y selecciona "Añadir a la pantalla de inicio".');
      } else {
        alert('Tu navegador no permite la instalación automática. Busca "Instalar aplicación" en el menú del navegador.');
      }
      setShowMobileWarning(false);
      return;
    }

    // Show the installation prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`👤 PWA install choice: ${outcome}`);
    
    // Clear the deferred prompt
    setDeferredPrompt(null);
    setShowMobileWarning(false);
  };

  const canvasOpen = canvasSignal.value.isOpen;
  const extensionsOpen = extensionsSignal.value.isOpen;

  return (
    <>
      <div className="h-screen bg-[var(--color-bg)] flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          onDocumentClick={(id) => setSelectedDocumentId(id)}
          onShowDocumentUpload={() => setShowDocumentUpload(true)}
          onShowModelWizard={() => setShowFirstRunWizard(true)}
        />

        {/* Main Content Area */}
        <main className="flex-1 flex flex-row lg:ml-64 overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">
            <ChatInterface key={conversationsStore.activeId} />
          </div>

          {/* Right Sidebar (Canvas) */}
          {canvasOpen && (
            <div className="w-1/2 min-w-[400px] max-w-[800px] border-l border-[var(--color-border)] bg-[var(--color-bg)] h-full flex flex-col shadow-xl z-20 transition-all duration-300">
               <DocumentCanvas
                 content={canvasSignal.value.content}
                 onClose={() => canvasStore.close()}
                 onContentChange={(c) => canvasStore.setContent(c)}
               />
            </div>
          )}

          {/* Right Sidebar (Extensions) */}
          {extensionsOpen && <ExtensionsPanel />}
        </main>
      </div>

      {/* Document Viewer Modal */}
      {selectedDocumentId && (
        <DocumentViewer
          documentId={selectedDocumentId}
          onClose={() => setSelectedDocumentId(null)}
        />
      )}


      {/* Document Upload Modal */}
      {showDocumentUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl">
            <div className="sticky top-0 bg-[var(--color-bg)] border-b border-[var(--color-border)] px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-semibold">{i18nStore.t('documents.title')}</h2>
              <button
                onClick={() => setShowDocumentUpload(false)}
                className="w-8 h-8 rounded-lg hover:bg-[var(--color-bg-secondary)] flex items-center justify-center transition-colors"
                aria-label="Cerrar"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <DocumentUpload />
            </div>
          </div>
        </div>
      )}

      {/* First Run Wizard */}
      {showFirstRunWizard && (
        <FirstRunWizard
          onComplete={() => {
            setShowFirstRunWizard(false);
          }}
        />
      )}

      {/* Model Loading Indicator (bottom-right toast) */}
      <ModelLoadingIndicator />

      {/* Extension Status Notification (top-right toast) */}
      <ExtensionStatus />

      {/* Live Mode Overlay */}
      <LiveMode />

      {/* RAG Settings Global Popup */}
      <RAGSettingsPopup />

      {/* Export Chatbot Modal */}
      <ExportChatbotModal />

      {/* Mobile Warning Modal */}
      {showMobileWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
          <div className="w-full max-w-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="bg-[var(--color-bg-secondary)] p-8 flex flex-col items-center justify-center space-y-4">
              {/* App Icon Mockup */}
              <div className="w-20 h-20 bg-white rounded-2xl p-3 shadow-xl flex items-center justify-center border border-gray-100">
                <img src="/inledai.png" alt="Edge.AI Logo" className="w-full h-full object-contain" />
              </div>
              <h2 className="text-xl font-bold text-[var(--color-text-primary)] text-center">
                {i18nStore.t('pwa.title')}
              </h2>
            </div>
            
            <div className="p-6 text-center space-y-4">
              <p className="text-[var(--color-text-secondary)] leading-relaxed">
                {i18nStore.t('pwa.description')}
              </p>
              <p className="text-sm text-[var(--color-text-tertiary)] bg-[var(--color-bg-secondary)] p-3 rounded-xl border border-[var(--color-border)]">
                {i18nStore.t('pwa.note')}
              </p>
              
              <div className="pt-2 flex flex-col space-y-2">
                <button
                  onClick={handleInstallClick}
                  className="w-full py-4 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold rounded-2xl transition-all active:scale-95 shadow-lg shadow-[var(--color-primary)]/20"
                >
                  {i18nStore.t('pwa.install')}
                </button>
                <button
                  onClick={() => setShowMobileWarning(false)}
                  className="w-full py-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors text-sm font-medium"
                >
                  {i18nStore.t('common.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
