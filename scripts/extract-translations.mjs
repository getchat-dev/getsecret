import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');

const src = readFileSync(join(repoRoot, 'new_design/i18n.jsx'), 'utf-8');

// new_design/i18n.jsx ends with `window.I18N = I18N` and `window.LANG_ORDER = [...]`.
// Strip those so we can evaluate the rest as plain JS.
const cleaned = src.replace(/window\.I18N\s*=\s*I18N;?/, '').replace(/window\.LANG_ORDER\s*=\s*\[[^\]]+\];?/s, '');

const ctx = { I18N: null };
runInNewContext(`${cleaned}\nthis.I18N = I18N;\n`, ctx);

if (!ctx.I18N || typeof ctx.I18N !== 'object') {
    console.error('Failed to extract I18N object');
    process.exit(1);
}

const messagesDir = join(repoRoot, 'src/i18n/messages');
mkdirSync(messagesDir, { recursive: true });

for (const [locale, data] of Object.entries(ctx.I18N)) {
    const out = join(messagesDir, `${locale}.json`);
    writeFileSync(out, `${JSON.stringify(data, null, 4)}\n`);
    console.log('wrote', out);
}
