// AppLayout - Main application layout with sidebar and modals

import { useState, useEffect } from 'preact/hooks';
import { Sidebar } from './Sidebar';
import { ChatInterface } from './chat/ChatInterface';
import { DocumentViewer } from './DocumentViewer';
import { DocumentUpload } from './DocumentUpload';
import { DocumentCanvas } from './DocumentCanvas';
import { FirstRunWizard } from './FirstRunWizard';
import { ModelLoadingIndicator } from './ModelLoadingIndicator';
import { ExtensionStatus } from './ExtensionStatus';
import LiveMode from './chat/LiveMode';
import { hasCompletedSetup } from '@/lib/ai/model-settings';
import { autoLoadModels } from '@/lib/ai/model-loader';
import { i18nStore } from '@/lib/stores/i18n';
import { canvasSignal, canvasStore } from '@/lib/stores';
import { checkIfMobile } from '@/lib/ai/device-profile';
import { AlertTriangle, X } from 'lucide-preact';

export function AppLayout() {
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  const [showFirstRunWizard, setShowFirstRunWizard] = useState(false);
  const [showMobileWarning, setShowMobileWarning] = useState(false);

  // Initialize: Check first run OR auto-load saved models
  useEffect(() => {
    // Check for mobile
    if (checkIfMobile()) {
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
  }, []);

  const canvasOpen = canvasSignal.value.isOpen;

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
            <ChatInterface />
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

      {/* Mobile Warning Modal */}
      {showMobileWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
          <div className="w-full max-w-sm bg-[var(--color-bg)] border-2 border-amber-500/50 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="bg-amber-500 p-4 flex items-center justify-center">
              <AlertTriangle size={48} className="text-white animate-bounce" />
            </div>
            <div className="p-6 text-center space-y-4">
              <h2 className="text-xl font-bold text-[var(--color-text-primary)] uppercase tracking-wider">
                ⚠️ Soporte Mobile Experimental
              </h2>
              <p className="text-[var(--color-text-secondary)] leading-relaxed">
                El soporte para dispositivos móviles es <span className="font-bold text-amber-500">muy experimental</span> y puede fallar como una escopeta de feria.
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)] italic">
                Se recomienda usar un ordenador para una experiencia estable.
              </p>
              <button
                onClick={() => setShowMobileWarning(false)}
                className="w-full py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-bold rounded-xl transition-all active:scale-95 shadow-lg shadow-[var(--color-primary)]/20"
              >
                ENTENDIDO, SOY UN VALIENTE
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
