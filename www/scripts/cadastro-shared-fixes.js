(() => {
    'use strict';

    function digitsOnly(value) {
        return String(value || '').replace(/\D/g, '').slice(0, 11);
    }

    function formatPhoneDigits(digits) {
        const value = digitsOnly(digits);
        if (!value) return '';
        if (value.length > 6) return `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
        if (value.length > 2) return `(${value.slice(0, 2)}) ${value.slice(2)}`;
        return `(${value})`;
    }

    function caretAfterDigitCount(formatted, count) {
        if (count <= 0) return formatted.startsWith('(') ? 1 : 0;
        let seen = 0;
        for (let i = 0; i < formatted.length; i += 1) {
            if (/\d/.test(formatted[i])) {
                seen += 1;
                if (seen === count) return i + 1;
            }
        }
        return formatted.length;
    }

    function setupPhoneMask(phone) {
        if (!phone) return;

        // Reaplica uma máscara determinística depois dos listeners legados.
        phone.addEventListener('input', () => {
            const digits = digitsOnly(phone.value);
            const formatted = formatPhoneDigits(digits);
            if (phone.value !== formatted) phone.value = formatted;
        });

        // Se o Backspace atingir um separador gerado pela máscara, remove o
        // dígito anterior em vez de recriar o separador infinitamente.
        phone.addEventListener('keydown', (event) => {
            if (event.key !== 'Backspace' || phone.selectionStart == null || phone.selectionEnd == null) return;
            if (phone.selectionStart !== phone.selectionEnd || phone.selectionStart === 0) return;

            const caret = phone.selectionStart;
            const before = phone.value.slice(0, caret);
            const previousChar = before.slice(-1);
            if (/\d/.test(previousChar)) return;

            const allDigits = digitsOnly(phone.value);
            const digitsBeforeCaret = (before.match(/\d/g) || []).length;
            if (!digitsBeforeCaret) {
                event.preventDefault();
                phone.value = '';
                return;
            }

            event.preventDefault();
            const removeIndex = digitsBeforeCaret - 1;
            const nextDigits = allDigits.slice(0, removeIndex) + allDigits.slice(removeIndex + 1);
            const nextValue = formatPhoneDigits(nextDigits);
            phone.value = nextValue;
            const nextCaret = caretAfterDigitCount(nextValue, removeIndex);
            requestAnimationFrame(() => phone.setSelectionRange(nextCaret, nextCaret));
            phone.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    function setupPasswordStrengthVisibility(password) {
        if (!password) return;
        const group = password.closest('.form-group');
        const strength = group?.querySelector('.password-strength');
        if (!strength) return;
        const sync = () => strength.classList.toggle('is-visible', password.value.length > 0);
        sync();
        password.addEventListener('input', sync);
    }

    document.addEventListener('DOMContentLoaded', () => {
        setupPhoneMask(document.getElementById('phone'));
        setupPasswordStrengthVisibility(document.getElementById('password'));
    });
})();
