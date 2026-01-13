/**
 * First Run Wizard
 * Guides users through initial model setup on first app launch
 */

import { useState, useEffect } from 'preact/hooks';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { ProgressBar } from './ui/ProgressBar';
import { Cpu, Zap, CheckCircle2, Info, Download } from 'lucide-preact';
import {
  detectDeviceProfile,
  getDeviceSummary,
  type DeviceProfile
} from '@/lib/ai/device-profile';
import {
  getChatModels,
  getEmbeddingModels,
  type ModelMetadata
} from '@/lib/ai/model-registry';
import {
  scoreAllModels,
  formatScore,
  getScoreColor,
  getRecommendationEmoji,
  type ModelScore
} from '@/lib/ai/model-scoring';
import {
  markSetupCompleted,
  saveDefaultChatModel,
  saveDefaultEmbeddingModel,
  saveDeviceProfile
} from '@/lib/ai/model-settings';
import { WebLLMEngine } from '@/lib/ai/webllm-engine';
import { WllamaEngine } from '@/lib/ai/wllama-engine';
import EngineManager from '@/lib/ai/engine-manager';
import { modelsStore } from '@/lib/stores';
import { ExtensionSetup } from './ExtensionSetup';
import { i18nStore, languageSignal } from '@/lib/stores/i18n';

interface FirstRunWizardProps {
  onComplete: () => void;
}

type WizardStep = 'welcome' | 'detecting' | 'model-selection' | 'loading' | 'extension-setup' | 'complete';

interface LoadingProgress {
  chat: { progress: number; message: string } | null;
  embedding: { progress: number; message: string } | null;
}

export function FirstRunWizard({ onComplete }: FirstRunWizardProps) {
  const [step, setStep] = useState<WizardStep>('welcome');
  const [deviceProfile, setDeviceProfile] = useState<DeviceProfile | null>(null);
  const [chatScores, setChatScores] = useState<ModelScore[]>([]);
  const [embeddingScores, setEmbeddingScores] = useState<ModelScore[]>([]);
  const [selectedChatModel, setSelectedChatModel] = useState<ModelMetadata | null>(null);
  const [selectedEmbeddingModel, setSelectedEmbeddingModel] = useState<ModelMetadata | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress>({
    chat: null,
    embedding: null
  });
  const [error, setError] = useState<string | null>(null);

  // Subscribe to language changes
  const lang = languageSignal.value;

  // Auto-detect device on mount when step changes to detecting
  useEffect(() => {
    if (step === 'detecting') {
      detectDevice();
    }
  }, [step]);

  async function detectDevice() {
    try {
      setError(null);
      const profile = await detectDeviceProfile();
      setDeviceProfile(profile);

      // Score all models
      const chatModels = getChatModels();
      const embeddingModels = getEmbeddingModels();

      const chatScored = scoreAllModels(chatModels, profile);
      const embeddingScored = scoreAllModels(embeddingModels, profile);

      setChatScores(chatScored);
      setEmbeddingScores(embeddingScored);

      // Pre-select best models
      if (chatScored.length > 0) {
        setSelectedChatModel(chatScored[0].model);
      }
      if (embeddingScored.length > 0) {
        setSelectedEmbeddingModel(embeddingScored[0].model);
      }

      // Save device profile
      saveDeviceProfile({
        hasWebGPU: profile.hasWebGPU,
        memoryGB: profile.memoryGB,
        deviceClass: profile.deviceClass
      });

      // Move to model selection
      setTimeout(() => setStep('model-selection'), 500);
    } catch (err) {
      console.error('Device detection failed:', err);
      setError(i18nStore.t('wizard.errorDetection'));
    }
  }

  async function handleLoadModels() {
    if (!selectedChatModel || !selectedEmbeddingModel) {
      alert(i18nStore.t('wizard.selectBoth'));
      return;
    }

    setStep('loading');
    setError(null);

    try {
      // Load models in parallel
      await Promise.all([
        loadChatModel(selectedChatModel),
        loadEmbeddingModel(selectedEmbeddingModel)
      ]);

      // Save defaults
      saveDefaultChatModel(selectedChatModel.id);
      saveDefaultEmbeddingModel(selectedEmbeddingModel.id);

      // Move to extension setup
      setStep('extension-setup');
    } catch (err) {
      console.error('Failed to load models:', err);
      setError(`${i18nStore.t('wizard.errorLoading')}: ${err instanceof Error ? err.message : 'Error unknown'}`);
      setStep('model-selection'); // Go back
    }
  }

  async function loadChatModel(model: ModelMetadata) {
    modelsStore.setChatLoading(true);

    try {
      let engine: WebLLMEngine | WllamaEngine;
      let engineName: string;
      let modelUrl: string;

      // Try WebLLM first if supported
      if (deviceProfile?.hasWebGPU && model.webllmModelId) {
        try {
          // Use WebLLM
          engine = new WebLLMEngine();
          engineName = 'webllm';
          modelUrl = model.webllmModelId;

          await engine.initialize(modelUrl, (progress, status) => {
            setLoadingProgress(prev => ({
              ...prev,
              chat: { progress, message: status }
            }));
          });
        } catch (webLlmError) {
          console.warn('⚠️ WebLLM initialization failed, trying fallback to Wllama:', webLlmError);
          
          // Fallback to Wllama if GGUF is available
          if (model.ggufUrl) {
            setLoadingProgress(prev => ({
              ...prev,
              chat: { progress: 0, message: 'WebGPU falló, intentando modo CPU...' }
            }));

            engine = new WllamaEngine();
            engineName = 'wllama';
            modelUrl = model.ggufUrl;

            await engine.initialize(modelUrl, (progress, status) => {
              setLoadingProgress(prev => ({
                ...prev,
                chat: { progress, message: status }
              }));
            });
          } else {
            throw webLlmError; // No fallback available
          }
        }
      } else if (model.ggufUrl) {
        // Use Wllama directly
        engine = new WllamaEngine();
        engineName = 'wllama';
        modelUrl = model.ggufUrl;

        await engine.initialize(modelUrl, (progress, status) => {
          setLoadingProgress(prev => ({
            ...prev,
            chat: { progress, message: status }
          }));
        });
      } else {
        throw new Error('No model URL available');
      }

      EngineManager.setChatEngine(engine, model.id);
      modelsStore.setChatModel({
        id: model.id,
        name: model.displayName,
        type: 'chat',
        engine: engineName,
        contextSize: model.contextSize,
        requiresGPU: model.requiresWebGPU,
        sizeGB: model.sizeGB
      });
    } finally {
      modelsStore.setChatLoading(false);
    }
  }

  async function loadEmbeddingModel(model: ModelMetadata) {
    modelsStore.setEmbeddingLoading(true);

    try {
      const engine = new WllamaEngine();
      const modelUrl = model.ggufUrl;

      if (!modelUrl) {
        throw new Error('No GGUF URL for embedding model');
      }

      await engine.initialize(modelUrl, (progress, status) => {
        setLoadingProgress(prev => ({
          ...prev,
          embedding: { progress, message: status }
        }));
      });

      EngineManager.setEmbeddingEngine(engine, model.id);
      modelsStore.setEmbeddingModel({
        id: model.id,
        name: model.displayName,
        type: 'embedding',
        engine: 'wllama',
        contextSize: model.contextSize,
        requiresGPU: false,
        sizeGB: model.sizeGB
      });
    } finally {
      modelsStore.setEmbeddingLoading(false);
    }
  }

  // ========================================================================
  // STEP RENDERING
  // ========================================================================

  if (step === 'welcome') {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full">
          <div className="text-center space-y-6 p-8 relative">
            {/* Language Switcher */}
            <div className="absolute top-6 right-8 flex gap-1 bg-[var(--color-bg-secondary)] p-1 rounded-md border border-[var(--color-border)]">
              <button
                onClick={() => i18nStore.setLanguage('es')}
                className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                  lang === 'es'
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]'
                }`}
              >
                ES
              </button>
              <button
                onClick={() => i18nStore.setLanguage('en')}
                className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                  lang === 'en'
                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)]'
                }`}
              >
                EN
              </button>
            </div>

            <div className="w-20 h-20 mx-auto">
              <img src="/inledai.svg" alt="Edge.AI" width={80} height={80} />
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl font-bold">{i18nStore.t('wizard.welcome')}</h1>
              <p className="text-lg text-[var(--color-text-secondary)]">
                {i18nStore.t('wizard.subtitle')}
              </p>
            </div>

            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-6 text-left space-y-4">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <Info size={20} className="text-[var(--color-primary)]" />
                {i18nStore.t('wizard.configTitle')}
              </h2>
              <ul className="space-y-2 text-sm text-[var(--color-text-secondary)]">
                <li className="flex items-start gap-2">
                  <span className="text-[var(--color-primary)] mt-0.5">•</span>
                  <span>{i18nStore.t('wizard.step1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--color-primary)] mt-0.5">•</span>
                  <span>{i18nStore.t('wizard.step2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--color-primary)] mt-0.5">•</span>
                  <span>{i18nStore.t('wizard.step3')}</span>
                </li>
              </ul>
            </div>

            <Button onClick={() => setStep('detecting')} size="lg" className="w-full">
              {i18nStore.t('wizard.startConfig')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (step === 'detecting') {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <div className="text-center space-y-6 p-8">
            <div className="w-16 h-16 mx-auto flex items-center justify-center">
              <div className="spinner text-[var(--color-primary)]" />
            </div>
            <h2 className="text-2xl font-bold">{i18nStore.t('wizard.detectingTitle')}</h2>
            <p className="text-[var(--color-text-secondary)]">
              {i18nStore.t('wizard.detectingSubtitle')}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (step === 'model-selection') {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
        <Card className="max-w-4xl w-full my-8">
          <div className="space-y-6 p-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">{i18nStore.t('wizard.selectModelsTitle')}</h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {i18nStore.t('wizard.selectModelsSubtitle')}
              </p>
            </div>

            {/* Device Info */}
            {deviceProfile && (
              <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-4">
                <div className="flex items-center gap-3">
                  {deviceProfile.hasWebGPU ? (
                    <Zap size={20} className="text-amber-400" />
                  ) : (
                    <Cpu size={20} className="text-gray-400" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium text-sm">
                      {getDeviceSummary(deviceProfile)}
                    </div>
                    <div className="text-xs text-[var(--color-text-tertiary)]">
                      {i18nStore.t('wizard.deviceClass')}: {deviceProfile.deviceClass}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Chat Models */}
            <div className="space-y-3">
              <h3 className="font-semibold">{i18nStore.t('wizard.chatModel')}</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {chatScores.map(score => (
                  <button
                    key={score.model.id}
                    onClick={() => setSelectedChatModel(score.model)}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      selectedChatModel?.id === score.model.id
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                        : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{score.model.displayName}</span>
                          <span className="text-xs">{getRecommendationEmoji(score.recommendation)}</span>
                        </div>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                          {score.model.description}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-[var(--color-text-tertiary)]">
                          <span>{score.model.sizeGB.toFixed(2)}GB</span>
                          <span>•</span>
                          <span>{score.model.speed}</span>
                          <span>•</span>
                          <span>{score.model.quality}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${getScoreColor(score.score)}`}>
                          {formatScore(score.score)}
                        </div>
                        <div className="text-xs text-[var(--color-text-tertiary)]">
                          {i18nStore.t('wizard.compatibility')}
                        </div>
                      </div>
                    </div>

                    {score.warnings.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {score.warnings.map((warning, i) => (
                          <div key={i} className="text-xs text-orange-500 flex items-start gap-1">
                            <span className="mt-0.5">⚠️</span>
                            <span>{warning}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Embedding Model */}
            <div className="space-y-3">
              <h3 className="font-semibold">{i18nStore.t('wizard.embeddingModel')}</h3>
              <div className="space-y-2">
                {embeddingScores.slice(0, 1).map(score => (
                  <div
                    key={score.model.id}
                    className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{score.model.displayName}</div>
                        <div className="text-xs text-[var(--color-text-secondary)] mt-1">
                          {score.model.sizeGB.toFixed(2)}GB • {i18nStore.t('wizard.semanticSearch')}
                        </div>
                      </div>
                      <div className={`text-lg font-bold ${getScoreColor(score.score)}`}>
                        {formatScore(score.score)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-500">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-[var(--color-border)]">
              <Button
                variant="secondary"
                onClick={() => setStep('welcome')}
                className="flex-1"
              >
                {i18nStore.t('wizard.back')}
              </Button>
              <Button
                onClick={handleLoadModels}
                disabled={!selectedChatModel || !selectedEmbeddingModel}
                className="flex-1"
              >
                <Download size={16} />
                {i18nStore.t('wizard.loadSelected')}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (step === 'loading') {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <div className="space-y-6 p-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">{i18nStore.t('wizard.loadingTitle')}</h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {i18nStore.t('wizard.loadingSubtitle')}
              </p>
            </div>

            {/* Chat Model Progress */}
            {loadingProgress.chat && (
              <div className="space-y-2">
                <div className="text-sm font-medium">{i18nStore.t('wizard.chatModel')}</div>
                <ProgressBar
                  progress={loadingProgress.chat.progress}
                  label={loadingProgress.chat.message}
                  size="md"
                />
              </div>
            )}

            {/* Embedding Model Progress */}
            {loadingProgress.embedding && (
              <div className="space-y-2">
                <div className="text-sm font-medium">{i18nStore.t('wizard.embeddingModel')}</div>
                <ProgressBar
                  progress={loadingProgress.embedding.progress}
                  label={loadingProgress.embedding.message}
                  size="md"
                />
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  if (step === 'extension-setup') {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
        <Card className="max-w-2xl w-full my-8">
          <ExtensionSetup
            onComplete={() => {
              // Mark setup complete
              markSetupCompleted();
              // Move to complete step
              setStep('complete');
            }}
            onSkip={() => {
              // Mark setup complete even if skipping extension
              markSetupCompleted();
              // Move to complete step
              setStep('complete');
            }}
          />
        </Card>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <div className="text-center space-y-6 p-8">
            <div className="w-16 h-16 mx-auto flex items-center justify-center">
              <CheckCircle2 size={64} className="text-[var(--color-success)]" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">{i18nStore.t('wizard.allReady')}</h2>
              <p className="text-[var(--color-text-secondary)]">
                {i18nStore.t('wizard.readySubtitle')}
              </p>
            </div>

            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-6 space-y-4">
              <p className="text-sm text-[var(--color-text-secondary)]">
                {i18nStore.t('wizard.newsletterSubtitle')}
              </p>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => window.open('https://7c0cb458.sibforms.com/serve/MUIFAPqS4aMwyG9eiASS-LRNOT1zsY2xefVUxEuu2jAL8znxvos7hP7gQsASGgyC6FdUHJvi2SOr4NUmxUqmkcBOTRyGUZauKcn6dvP24DSLYDmXnHyIO3ZToBhJ6PGaE5JnYTdECW_d6ezFdrjwEmRihA2TkJsf8HueD3VesU8vkYGa_1iHNFWwq3yvrRD7gVXgiEj2l8rib1CL5A==', '_blank')}
              >
                <Info size={18} />
                {i18nStore.t('wizard.subscribeNewsletter')}
              </Button>
            </div>

            <Button onClick={() => onComplete()} size="lg" className="w-full">
              {i18nStore.t('wizard.startChatting')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return null;
}
