// ============================================================================
// Settings Store - Key-value settings storage
// ============================================================================

import { getDB } from './schema';
import type { Settings } from '../../types';

/**
 * Default settings
 */
const DEFAULT_SETTINGS: Settings = {
  chunkSize: 512,
  chunkOverlap: 50,
  topK: 5,
  temperature: 0.1,
  maxTokens: 2048,
  theme: 'auto',
  language: 'es',
  // Web search defaults
  enableWebSearch: true, // Enabled by default - show the toggle
  webSearchSources: ['extension'], // Use browser extension
  webSearchMaxUrls: 3, // Max 3 URLs to fetch
  webSearchConfirmUrls: true, // Confirm by default for safety
  useSpecializedToolModel: false, // Disabled by default - use only as fallback
  liveModeAudioType: 'system', // Use system TTS by default
  liveModeSttType: 'system', // Use system STT by default
  useAdvancedRAG: false, // Disabled temporarily as requested
  historyWeight: 0.5, // Balanced by default
  historyLimit: 10, // Default limit
  faithfulnessThreshold: 0.45, // Default sensitivity
  chunkWindowSize: 1, // Default Small-to-Big window
};

/**
 * Get advanced RAG setting
 */
export async function getUseAdvancedRAG(): Promise<boolean> {
  return await getSetting('useAdvancedRAG') ?? false;
}

/**
 * Set advanced RAG setting
 */
export async function setUseAdvancedRAG(value: boolean): Promise<void> {
  await setSetting('useAdvancedRAG', value);
}

/**
 * Get a setting value
 */
export async function getSetting<K extends keyof Settings>(
  key: K
): Promise<Settings[K]> {
  const db = await getDB();
  const value = await db.get('settings', key);
  return value !== undefined ? value : DEFAULT_SETTINGS[key];
}

/**
 * Set a setting value
 */
export async function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K]
): Promise<void> {
  const db = await getDB();
  await db.put('settings', value, key);
}

/**
 * Get all settings
 */
export async function getAllSettings(): Promise<Settings> {
  const db = await getDB();
  const keys = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

  const settings: Partial<Settings> = {};

  for (const key of keys) {
    const value = await db.get('settings', key);
    settings[key] = value !== undefined ? value : DEFAULT_SETTINGS[key];
  }

  return settings as Settings;
}

/**
 * Update multiple settings at once
 */
export async function updateSettings(
  updates: Partial<Settings>
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('settings', 'readwrite');

  for (const [key, value] of Object.entries(updates)) {
    await tx.store.put(value, key);
  }

  await tx.done;
}

/**
 * Reset settings to defaults
 */
export async function resetSettings(): Promise<void> {
  await updateSettings(DEFAULT_SETTINGS);
}

/**
 * Reset a specific setting to default
 */
export async function resetSetting<K extends keyof Settings>(
  key: K
): Promise<void> {
  await setSetting(key, DEFAULT_SETTINGS[key]);
}

/**
 * Get selected models
 */
export async function getSelectedModels() {
  const [chatModel, embeddingModel] = await Promise.all([
    getSetting('selectedChatModel'),
    getSetting('selectedEmbeddingModel')
  ]);

  return {
    chatModel,
    embeddingModel
  };
}

/**
 * Set selected models
 */
export async function setSelectedModels(
  chatModel?: string,
  embeddingModel?: string
): Promise<void> {
  const updates: Partial<Settings> = {};

  if (chatModel !== undefined) {
    updates.selectedChatModel = chatModel;
  }

  if (embeddingModel !== undefined) {
    updates.selectedEmbeddingModel = embeddingModel;
  }

  await updateSettings(updates);
}

/**
 * Get RAG settings
 */
export async function getRAGSettings() {
  const [chunkSize, chunkOverlap, topK, chunkWindowSize] = await Promise.all([
    getSetting('chunkSize'),
    getSetting('chunkOverlap'),
    getSetting('topK'),
    getSetting('chunkWindowSize')
  ]);

  return {
    chunkSize,
    chunkOverlap,
    topK,
    chunkWindowSize: chunkWindowSize ?? 1
  };
}

/**
 * Update RAG settings
 */
export async function updateRAGSettings(settings: {
  chunkSize?: number;
  chunkOverlap?: number;
  topK?: number;
  chunkWindowSize?: number;
}): Promise<void> {
  await updateSettings(settings);
}

/**
 * Get generation settings
 */
export async function getGenerationSettings() {
  const [temperature, maxTokens, historyWeight, historyLimit, faithfulnessThreshold] = await Promise.all([
    getSetting('temperature'),
    getSetting('maxTokens'),
    getSetting('historyWeight'),
    getSetting('historyLimit'),
    getSetting('faithfulnessThreshold')
  ]);

  return {
    temperature,
    maxTokens,
    historyWeight: historyWeight ?? 0.5,
    historyLimit: historyLimit ?? 10,
    faithfulnessThreshold: faithfulnessThreshold ?? 0.45
  };
}

/**
 * Update generation settings
 */
export async function updateGenerationSettings(settings: {
  temperature?: number;
  maxTokens?: number;
  historyWeight?: number;
  historyLimit?: number;
  faithfulnessThreshold?: number;
}): Promise<void> {
  await updateSettings(settings);
}

/**
 * Get web search settings
 */
export async function getWebSearchSettings() {
  const [enableWebSearch, webSearchSources, webSearchMaxUrls, webSearchConfirmUrls] = await Promise.all([
    getSetting('enableWebSearch'),
    getSetting('webSearchSources'),
    getSetting('webSearchMaxUrls'),
    getSetting('webSearchConfirmUrls')
  ]);

  return {
    enableWebSearch: enableWebSearch ?? false,
    webSearchSources: webSearchSources ?? ['extension'],
    webSearchMaxUrls: webSearchMaxUrls ?? 3,
    webSearchConfirmUrls: webSearchConfirmUrls ?? true
  };
}

/**
 * Update web search settings
 */
export async function updateWebSearchSettings(settings: {
  enableWebSearch?: boolean;
  webSearchSources?: ('wikipedia' | 'duckduckgo' | 'extension')[];
  webSearchMaxUrls?: number;
  webSearchConfirmUrls?: boolean;
}): Promise<void> {
  await updateSettings(settings);
}

/**
 * Get browser extension settings
 */
export async function getExtensionSettings() {
  const [extensionId, extensionEnabled] = await Promise.all([
    getSetting('extensionId'),
    getSetting('extensionEnabled')
  ]);

  return {
    extensionId: extensionId ?? '',
    enabled: extensionEnabled ?? false
  };
}

/**
 * Save browser extension settings
 */
export async function saveExtensionSettings(settings: {
  extensionId?: string;
  enabled?: boolean;
}): Promise<void> {
  const updates: Partial<Settings> = {};

  if (settings.extensionId !== undefined) {
    updates.extensionId = settings.extensionId;
  }

  if (settings.enabled !== undefined) {
    updates.extensionEnabled = settings.enabled;
  }

  await updateSettings(updates);
}
