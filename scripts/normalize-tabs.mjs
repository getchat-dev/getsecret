// Convert each locale's `tabs` array into a keyed object for stable next-intl access.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');
const messagesDir = join(repoRoot, 'src/i18n/messages');

const LOCALES = ['en', 'zh', 'ru', 'es', 'it', 'de', 'fr'];
const KEYS = ['create', 'generated', 'locked', 'revealed', 'burned'];

for (const locale of LOCALES) {
    const file = join(messagesDir, `${locale}.json`);
    const data = JSON.parse(readFileSync(file, 'utf-8'));

    if (Array.isArray(data.tabs) && data.tabs.length === 5) {
        const obj = {};
        for (let i = 0; i < KEYS.length; i += 1) {
            obj[KEYS[i]] = data.tabs[i];
        }
        data.tabs = obj;
        writeFileSync(file, `${JSON.stringify(data, null, 4)}\n`);
        console.log('normalized', locale);
    } else if (data.tabs && typeof data.tabs === 'object') {
        console.log('skip', locale, '(already an object)');
    } else {
        console.warn('unexpected shape for', locale);
    }
}
