import { useEffect } from 'preact/hooks';
import { X, MessageSquare } from 'lucide-preact';

interface FeedbackModalProps {
  onClose: () => void;
}

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  useEffect(() => {
    // Load Typeform script
    const script = document.createElement('script');
    script.src = "//embed.typeform.com/next/embed.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup if necessary, though Typeform script usually stays global
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center bg-[var(--color-bg-secondary)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <MessageSquare size={20} />
            </div>
            <h3 className="font-semibold text-[var(--color-text-primary)]">Feedback</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - Typeform Container */}
        <div className="flex-1 w-full bg-[var(--color-bg)] relative">
            <div data-tf-live="01KFBC2T1SZPAR1Y5509HJ7RN6" className="w-full h-full"></div>
        </div>
      </div>
    </div>
  );
}
