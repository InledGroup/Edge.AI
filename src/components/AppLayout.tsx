// AppLayout - Main application layout with sidebar and modals

import { useState, useEffect } from 'preact/hooks';
import { Sidebar } from './Sidebar';
import { ChatInterface } from './chat/ChatInterface';
import { DocumentViewer } from './DocumentViewer';
import { DocumentUpload } from './DocumentUpload';
import { FirstRunWizard } from './FirstRunWizard';
import { ModelLoadingIndicator } from './ModelLoadingIndicator';
import { ExtensionStatus } from './ExtensionStatus';
import { hasCompletedSetup } from '@/lib/ai/model-settings';
import { autoLoadModels } from '@/lib/ai/model-loader';
import { i18nStore } from '@/lib/stores/i18n';

export function AppLayout() {
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);
  const [showFirstRunWizard, setShowFirstRunWizard] = useState(false);

  // Initialize: Check first run OR auto-load saved models
  useEffect(() => {
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
        <main className="flex-1 flex flex-col lg:ml-64">
          <ChatInterface />
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
    </>
  );
}
