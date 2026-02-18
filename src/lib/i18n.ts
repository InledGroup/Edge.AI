
export const acceptedLanguages = ['en', 'es'] as const;
export type Language = typeof acceptedLanguages[number];

export function getLanguageFromURL(url: URL): Language {
    const lang = url.searchParams.get('lang');
    if (lang && (acceptedLanguages as readonly string[]).includes(lang)) {
        return lang as Language;
    }

    // Check if we are in a Spanish path
    if (url.pathname.includes('/modelo/') || url.pathname.includes('/modelos')) {
        return 'es';
    }

    return 'en'; // Default to English or you could check headers
}

export function getOppositeLang(lang: Language): Language {
    return lang === 'en' ? 'es' : 'en';
}

export function getLocalizedPath(currentPath: string, targetLang: Language): string {
    // If we are on a model page, swap the base
    if (targetLang === 'es') {
        return currentPath.replace('/model/', '/modelo/').replace('/models', '/modelos');
    } else {
        return currentPath.replace('/modelo/', '/model/').replace('/modelos', '/models');
    }
}
