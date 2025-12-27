/**
 * Extension Setup Component
 * Checks for browser extension and guides user to install it
 */

import { useState, useEffect } from 'preact/hooks';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Download, CheckCircle2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-preact';
import { getExtensionSettings, saveExtensionSettings } from '@/lib/db/settings';
import { i18nStore, languageSignal } from '@/lib/stores/i18n';

export interface ExtensionSetupProps {
  onComplete: () => void;
  onSkip?: () => void;
}

type SetupStep = 'check' | 'install' | 'configure' | 'complete' | 'skipped';

export function ExtensionSetup({ onComplete, onSkip }: ExtensionSetupProps) {
  const [step, setStep] = useState<SetupStep>('check');
  const [extensionId, setExtensionId] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState('chrome://extensions');
  const [hasDownloaded, setHasDownloaded] = useState(false);

  // Subscribe to language changes
  const lang = languageSignal.value;

  // Check for extension on mount
  useEffect(() => {
    const isEdge = navigator.userAgent.includes('Edg');
    setBrowserUrl(isEdge ? 'edge://extensions' : 'chrome://extensions');
    checkExtension();
  }, []);

  async function checkExtension() {
    setIsChecking(true);
    setError(null);

    try {
      // Try to load saved extension ID
      const settings = await getExtensionSettings();

      if (settings.extensionId) {
        // Test if extension is still available
        const isAvailable = await testExtension(settings.extensionId);

        if (isAvailable) {
          console.log('[ExtensionSetup] Extension found and working');
          setExtensionId(settings.extensionId);
          setStep('complete');
          setTimeout(() => onComplete(), 1000);
          return;
        } else {
          console.log('[ExtensionSetup] Saved extension ID not working');
          setExtensionId('');
        }
      }

      // No extension found
      setStep('install');
    } catch (err) {
      console.error('[ExtensionSetup] Check failed:', err);
      setStep('install');
    } finally {
      setIsChecking(false);
    }
  }

  async function testExtension(extId: string): Promise<boolean> {
    if (!extId) return false;

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          extId,
          { type: 'PING' },
          (response) => {
            if (chrome.runtime.lastError) {
              console.log('[ExtensionSetup] Extension not responding:', chrome.runtime.lastError.message);
              resolve(false);
            } else if (response && response.success) {
              resolve(true);
            } else {
              resolve(false);
            }
          }
        );

        // Timeout after 2 seconds
        setTimeout(() => resolve(false), 2000);
      } catch (error) {
        console.log('[ExtensionSetup] Error testing extension:', error);
        resolve(false);
      }
    });
  }

  async function handleTestExtension() {
    if (!extensionId.trim()) {
      setError(i18nStore.t('extension.errorId'));
      return;
    }

    setIsChecking(true);
    setError(null);

    const isAvailable = await testExtension(extensionId.trim());

    if (isAvailable) {
      // Save extension ID
      await saveExtensionSettings({
        extensionId: extensionId.trim(),
        enabled: true
      });

      setStep('complete');
      setTimeout(() => onComplete(), 1500);
    } else {
      setError(i18nStore.t('extension.errorConnect'));
    }

    setIsChecking(false);
  }

  function handleSkip() {
    setStep('skipped');
    if (onSkip) {
      onSkip();
    } else {
      onComplete();
    }
  }

  // Checking step
  if (step === 'check') {
    return (
      <div className="space-y-6 p-8">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto flex items-center justify-center">
            <div className="spinner text-[var(--color-primary)]" />
          </div>
          <h3 className="text-xl font-bold mt-4">{i18nStore.t('extension.checkTitle')}</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-2">
            {i18nStore.t('extension.checkSubtitle')}
          </p>
        </div>
      </div>
    );
  }

  // Install step
  if (step === 'install') {
    return (
      <div className="space-y-6 p-8">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto flex items-center justify-center rounded-full bg-blue-500/10">
            <Download size={32} className="text-blue-500" />
          </div>
          <h3 className="text-xl font-bold">{i18nStore.t('extension.installTitle')}</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {i18nStore.t('extension.installSubtitle')}
          </p>
        </div>

        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-6 space-y-4">
          <h4 className="font-semibold">{i18nStore.t('extension.featuresTitle')}</h4>
          <ul className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-primary)] mt-0.5">•</span>
              <span>{i18nStore.t('extension.feature1')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-primary)] mt-0.5">•</span>
              <span>{i18nStore.t('extension.feature2')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-primary)] mt-0.5">•</span>
              <span>{i18nStore.t('extension.feature3')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--color-primary)] mt-0.5">•</span>
              <span>{i18nStore.t('extension.feature4')}</span>
            </li>
          </ul>
        </div>

        <div className="space-y-4">
          <Button
            onClick={() => {
              const link = document.createElement('a');
              link.href = 'https://github.com/InledGroup/browser.extension.edge.ai/archive/refs/heads/main.zip';
              link.download = 'edge-ai-extension.zip';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              setHasDownloaded(true);
            }}
            variant="primary"
            className="w-full flex items-center justify-center gap-2 py-6 bg-blue-600 hover:bg-blue-700 text-white shadow-lg transition-all active:scale-[0.98]"
          >
            <Download size={24} />
            <div className="text-left">
              <div className="font-bold">{i18nStore.t('extension.downloadButton')}</div>
              <div className="text-xs opacity-80">{i18nStore.t('extension.downloadNote')}</div>
            </div>
          </Button>

          <div className="space-y-3">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-primary)] text-white text-[10px]">2</span>
              {i18nStore.t('extension.stepsTitle')}
            </h4>
            <ol className="space-y-3 text-sm text-[var(--color-text-secondary)]">
              <li className="flex gap-3 items-start">
                <span className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center rounded-full border border-[var(--color-border)] text-[10px]">A</span>
                <span dangerouslySetInnerHTML={{ __html: i18nStore.t('extension.step1') }} />
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center rounded-full border border-[var(--color-border)] text-[10px]">B</span>
                <span dangerouslySetInnerHTML={{ __html: i18nStore.t('extension.step2').replace('{url}', `<strong class="text-[var(--color-primary)] selection:bg-blue-500/30 font-mono tracking-tight cursor-default">${browserUrl}</strong>`) }} />
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center rounded-full border border-[var(--color-border)] text-[10px]">C</span>
                <span dangerouslySetInnerHTML={{ __html: i18nStore.t('extension.step3') }} />
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center rounded-full border border-[var(--color-border)] text-[10px]">D</span>
                <span dangerouslySetInnerHTML={{ __html: i18nStore.t('extension.step4') }} />
              </li>
            </ol>
          </div>
        </div>

        <Button
          onClick={() => setStep('configure')}
          variant={hasDownloaded ? "primary" : "default"}
          className={`w-full ${hasDownloaded ? 'ring-2 ring-[var(--color-primary)] ring-offset-2' : ''}`}
        >
          {hasDownloaded ? i18nStore.t('extension.downloadedButton') : i18nStore.t('extension.installedButton')}
        </Button>

        <Button
          onClick={handleSkip}
          variant="ghost"
          className="w-full text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
        >
          {i18nStore.t('extension.skip')}
        </Button>
      </div>
    );
  }

  // Configure step
  if (step === 'configure') {
    return (
      <div className="space-y-6 p-8">
        <div className="text-center space-y-2">
          <h3 className="text-xl font-bold">{i18nStore.t('extension.configureTitle')}</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {i18nStore.t('extension.configureSubtitle')}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Extension ID
            </label>
            <input
              type="text"
              value={extensionId}
              onChange={(e) => setExtensionId((e.target as HTMLInputElement).value)}
              placeholder="ej: abcdefghijklmnopqrstuvwxyz123456"
              className="w-full px-4 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
              {i18nStore.t('extension.idPlaceholder')}
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2 text-sm text-red-500">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => setStep('install')}
              variant="outline"
              className="flex-1"
            >
              {i18nStore.t('extension.back')}
            </Button>
            <Button
              onClick={handleTestExtension}
              disabled={!extensionId.trim() || isChecking}
              variant="primary"
              className="flex-1"
            >
              {isChecking ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  {i18nStore.t('extension.verifying')}
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  {i18nStore.t('extension.connect')}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Complete step
  if (step === 'complete') {
    return (
      <div className="space-y-6 p-8">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto flex items-center justify-center">
            <CheckCircle2 size={64} className="text-[var(--color-success)]" />
          </div>
          <div>
            <h3 className="text-xl font-bold">{i18nStore.t('extension.connectedTitle')}</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mt-2">
              {i18nStore.t('extension.connectedSubtitle')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
