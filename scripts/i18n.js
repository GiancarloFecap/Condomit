// Placeholder para traduções i18n (espaço reservado para futuras extensões)
(function installI18nHelpers() {
    const translations = {
        pt: {},
        en: {}
    };

    // Evita sobrescrever a função t() global do sidebar-links.js,
    // que é a fonte verdadeira das traduções.
    if (typeof window.i18nTranslate !== 'function') {
        window.i18nTranslate = function i18nTranslate(key) {
            return key;
        };
    }
})();
