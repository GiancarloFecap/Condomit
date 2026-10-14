 
(function installI18nHelpers() {
    const translations = {
        pt: {},
        en: {}
    };

     
     
    if (typeof window.i18nTranslate !== 'function') {
        window.i18nTranslate = function i18nTranslate(key) {
            return key;
        };
    }
})();
