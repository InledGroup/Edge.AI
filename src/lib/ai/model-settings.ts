/**
 * Model Settings Persistence
 * Saves and loads model configuration to localStorage
 */

export interface ModelSettings {
  // First run flag
  hasCompletedSetup: boolean;

  // Selected models
  defaultChatModelId: string | null;
  defaultEmbeddingModelId: string | null;

  // Device profile (cached)
  deviceProfile?: {
    hasWebGPU: boolean;
    memoryGB: number;
    deviceClass: string;
  };

  // Timestamps
  setupCompletedAt?: number;
  lastUpdatedAt: number;
}

const STORAGE_KEY = 'edge-ai-model-settings';

/**
 * Get model settings from localStorage
 */
export function getModelSettings(): ModelSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load model settings:', error);
  }

  // Default settings (first run)
  return {
    hasCompletedSetup: false,
    defaultChatModelId: null,
    defaultEmbeddingModelId: null,
    lastUpdatedAt: Date.now()
  };
}

/**
 * Save model settings to localStorage
 */
export function saveModelSettings(settings: Partial<ModelSettings>): void {
  try {
    const current = getModelSettings();
    const updated: ModelSettings = {
      ...current,
      ...settings,
      lastUpdatedAt: Date.now()
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    console.log('✅ Model settings saved:', updated);
  } catch (error) {
    console.error('Failed to save model settings:', error);
  }
}

/**
 * Mark setup as completed
 */
export function markSetupCompleted(): void {
  saveModelSettings({
    hasCompletedSetup: true,
    setupCompletedAt: Date.now()
  });
}

/**
 * Check if user has completed setup
 */
export function hasCompletedSetup(): boolean {
  return getModelSettings().hasCompletedSetup;
}

/**
 * Save default chat model
 */
export function saveDefaultChatModel(modelId: string): void {
  saveModelSettings({
    defaultChatModelId: modelId
  });
}

/**
 * Save default embedding model
 */
export function saveDefaultEmbeddingModel(modelId: string): void {
  saveModelSettings({
    defaultEmbeddingModelId: modelId
  });
}

/**
 * Get default model IDs
 */
export function getDefaultModelIds(): {
  chatModelId: string | null;
  embeddingModelId: string | null;
} {
  const settings = getModelSettings();
  return {
    chatModelId: settings.defaultChatModelId,
    embeddingModelId: settings.defaultEmbeddingModelId
  };
}

/**
 * Save device profile cache
 */
export function saveDeviceProfile(profile: {
  hasWebGPU: boolean;
  memoryGB: number;
  deviceClass: string;
}): void {
  saveModelSettings({
    deviceProfile: profile
  });
}

/**
 * Clear all settings (reset to first run)
 */
export function clearModelSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('🔄 Model settings cleared');
  } catch (error) {
    console.error('Failed to clear model settings:', error);
  }
}

/**
 * Export settings as JSON (for debugging)
 */
export function exportSettings(): string {
  const settings = getModelSettings();
  return JSON.stringify(settings, null, 2);
}

/**
 * Import settings from JSON (for debugging)
 */
export function importSettings(json: string): void {
  try {
    const settings = JSON.parse(json);
    localStorage.setItem(STORAGE_KEY, json);
    console.log('✅ Settings imported');
  } catch (error) {
    console.error('Failed to import settings:', error);
    throw new Error('Invalid JSON');
  }
}
