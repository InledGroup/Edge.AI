import { signal, computed } from '@preact/signals';
import { translations, type Language } from '../i18n/translations';
import { setSetting, getSetting } from '../db/settings';

// Default language
const DEFAULT_LANG: Language = 'es';

// Helper to get browser language
function getBrowserLanguage(): Language {
  if (typeof navigator === 'undefined') return DEFAULT_LANG;
  const lang = navigator.language.split('-')[0];
  return (lang === 'en' || lang === 'es') ? lang : DEFAULT_LANG;
}

// Current language signal
export const languageSignal = signal<Language>(DEFAULT_LANG);

export const i18nStore = {
  get current() {
    return languageSignal.value;
  },

  /**
   * Initialize language from settings or browser
   */
  async init() {
    try {
      // 1. Check URL first (overrides everything)
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');
        if (urlLang && (urlLang === 'es' || urlLang === 'en')) {
          languageSignal.value = urlLang as Language;
          updateHtmlLang(urlLang as Language);
          await setSetting('language', urlLang);
          console.log('🗣️ Language loaded from URL:', urlLang);
          return;
        }
      }

      // 2. Check DB
      const storedLang = await getSetting('language');
      if (storedLang && (storedLang === 'es' || storedLang === 'en')) {
        languageSignal.value = storedLang;
        console.log('🗣️ Language loaded from settings:', storedLang);
        updateHtmlLang(storedLang);
        return;
      }

      // 3. If not in DB, use browser detection
      const browserLang = getBrowserLanguage();
      languageSignal.value = browserLang;
      console.log('🗣️ Language detected from browser:', browserLang);
      
      // Save detected preference
      await setSetting('language', browserLang);
      updateHtmlLang(browserLang);
      
    } catch (error) {
      console.error('Failed to initialize language:', error);
    }
  },

  /**
   * Change language
   */
  async setLanguage(lang: Language) {
    languageSignal.value = lang;
    updateHtmlLang(lang);
    await setSetting('language', lang);
  },
  
  /**
   * Get translation
   * Usage: t('common.appName') or t('quality.precision', { percent: 90 })
   */
  t(key: string, replacements?: Record<string, string | number>): string {
    const keys = key.split('.');
    let value: any = translations[languageSignal.value];
    
    for (const k of keys) {
      if (value === undefined) break;
      value = value[k];
    }
    
    if (value === undefined) {
      console.warn(`Translation missing for key: ${key} (${languageSignal.value})`);
      return key;
    }
    
    if (typeof value === 'string' && replacements) {
      Object.entries(replacements).forEach(([k, v]) => {
        value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    
    return value;
  }
};

/**
 * Helper to update HTML lang attribute
 */
function updateHtmlLang(lang: Language) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}

/**
 * Reactive translation helper
 * Usage: const t = useTranslations(); t('key', { count: 5 })
 */
export function useTranslations() {
  return (key: string, replacements?: Record<string, string | number>) => i18nStore.t(key, replacements);
}

// Export a direct reference for non-reactive usage (careful, won't update on change)
export const t = i18nStore.t;
