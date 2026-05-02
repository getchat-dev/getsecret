// Stage 2: extend each locale's messages JSON with new keys for the lifecycle
// paginator legend, error namespace, and a few create/reveal additions.
// For non-EN locales, English text is left as a fallback with a TODO.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');
const messagesDir = join(repoRoot, 'src/i18n/messages');

const LOCALES = ['en', 'zh', 'ru', 'es', 'it', 'de', 'fr'];

const EN = {
    tabsLegend: 'Lifecycle of your secret',
    create: {
        encrypting: 'Encrypting…',
        charsLeft: '{count, number} characters left',
        formatLabel: 'Format',
    },
    reveal: {
        validating: 'Validating secure link…',
    },
    errors: {
        linkMissingKey: 'This link is missing its decryption key.',
        linkKeyMismatch: 'This decryption key does not match the secret link.',
        linkInvalidKey: 'Invalid or corrupted decryption key.',
        secretNotFound: 'Secret not found or expired.',
        secretExpired: 'This secret expired before it was opened.',
        decryptFailed: 'Could not decrypt the secret in this browser.',
        createFailed: 'Failed to create the secret link.',
        copyFailed: 'Could not copy to the clipboard.',
    },
};

// Per-locale translations. Non-listed locales fall back to English with a TODO marker.
const TRANSLATIONS = {
    en: EN,
    ru: {
        tabsLegend: 'Жизненный цикл вашего секрета',
        create: {
            encrypting: 'Шифрование…',
            charsLeft: 'осталось {count, number} символов',
            formatLabel: 'Формат',
        },
        reveal: {
            validating: 'Проверка защищённой ссылки…',
        },
        errors: {
            linkMissingKey: 'В этой ссылке нет ключа дешифрования.',
            linkKeyMismatch: 'Ключ дешифрования не подходит к этому секрету.',
            linkInvalidKey: 'Недействительный или повреждённый ключ дешифрования.',
            secretNotFound: 'Секрет не найден или истёк.',
            secretExpired: 'Срок жизни секрета истёк до открытия.',
            decryptFailed: 'Не удалось расшифровать секрет в этом браузере.',
            createFailed: 'Не удалось создать ссылку на секрет.',
            copyFailed: 'Не удалось скопировать в буфер обмена.',
        },
    },
    // TODO translate zh / es / it / de / fr — currently fall back to English.
};

function deepMerge(target, source) {
    const out = { ...target };
    for (const [key, value] of Object.entries(source)) {
        if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object') {
            out[key] = deepMerge(out[key], value);
        } else {
            out[key] = value;
        }
    }
    return out;
}

let updated = 0;
for (const locale of LOCALES) {
    const file = join(messagesDir, `${locale}.json`);
    const current = JSON.parse(readFileSync(file, 'utf-8'));
    const additions = TRANSLATIONS[locale] ?? EN;
    const merged = deepMerge(current, additions);
    writeFileSync(file, `${JSON.stringify(merged, null, 4)}\n`);
    updated += 1;
    console.log('updated', locale);
}

console.log(`\n${updated} locale(s) extended.`);
