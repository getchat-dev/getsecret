import DOMPurifyNs from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import ini from 'highlight.js/lib/languages/ini';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import 'highlight.js/styles/github.css';
import { isSecretFormat, type SecretFormat } from '@/lib/secret-formats';

// Tolerate both ESM (`.default`) and CJS-interop (`DOMPurifyNs` itself is the
// instance) shapes — Turbopack and webpack disagree about which one ends up as
// the binding name when the source uses `export default`.
const DOMPurify =
    (DOMPurifyNs as unknown as { default?: typeof DOMPurifyNs }).default ?? (DOMPurifyNs as typeof DOMPurifyNs);
const SANITIZE_CONFIG: { ALLOWED_TAGS: string[]; ALLOWED_ATTR: string[] } = {
    ALLOWED_TAGS: ['span'],
    ALLOWED_ATTR: ['class'],
};

const ALIASES: Partial<Record<SecretFormat, string>> = {
    toml: 'ini',
    html: 'xml',
};

let registered = false;

function ensureRegistered() {
    if (registered) {
        return;
    }
    hljs.registerLanguage('bash', bash);
    hljs.registerLanguage('css', css);
    hljs.registerLanguage('ini', ini);
    hljs.registerLanguage('javascript', javascript);
    hljs.registerLanguage('json', json);
    hljs.registerLanguage('markdown', markdown);
    hljs.registerLanguage('php', php);
    hljs.registerLanguage('python', python);
    hljs.registerLanguage('sql', sql);
    hljs.registerLanguage('typescript', typescript);
    hljs.registerLanguage('xml', xml);
    hljs.registerLanguage('yaml', yaml);
    registered = true;
}

export function highlight(content: string, format: SecretFormat): string {
    if (format === 'plain') {
        return '';
    }
    ensureRegistered();
    const language = ALIASES[format] ?? format;
    return hljs.highlight(content, { language, ignoreIllegals: true }).value;
}

// Defense-in-depth wrapper: produce hljs output and pass it through DOMPurify
// before it ever reaches `dangerouslySetInnerHTML`. We trust hljs to escape,
// but a regression or future CVE could let raw HTML slip past — the
// allow-list guarantees only `<span class="...">` survives regardless.
export function highlightSafe(content: string, format: SecretFormat): string {
    const raw = highlight(content, format);
    if (raw.length === 0) return '';
    return DOMPurify.sanitize(raw, SANITIZE_CONFIG);
}

const AUTO_DETECT_LANGUAGES = ['yaml', 'ini', 'javascript', 'typescript', 'python', 'bash', 'sql', 'xml', 'css', 'php'];

const MIN_AUTO_DETECT_LENGTH = 10;
const MIN_AUTO_DETECT_RELEVANCE = 10;

const TYPESCRIPT_HINTS =
    /\)\s*:\s*[A-Za-z_$][\w$<>[\],\s|&]*\s*[{=>]|:\s*(?:string|number|boolean|void|any|unknown|never|object|null|undefined|bigint|symbol)\b|\b(?:interface|enum)\s+\w+|\btype\s+\w+\s*=|\bas\s+(?:string|number|boolean|const|unknown|\w+(?:\[\])?)\b|\?\s*:\s*\w/;

export function detectFormat(content: string): SecretFormat | null {
    const trimmed = content.trim();
    if (trimmed.length < MIN_AUTO_DETECT_LENGTH) {
        return null;
    }

    const isJsonShape =
        (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (isJsonShape) {
        try {
            JSON.parse(trimmed);
            return 'json';
        } catch {}
    }

    ensureRegistered();
    const result = hljs.highlightAuto(content, AUTO_DETECT_LANGUAGES);
    if (!result.language || (result.relevance ?? 0) < MIN_AUTO_DETECT_RELEVANCE) {
        return null;
    }

    const detected = result.language;
    if (detected === 'ini') {
        return 'toml';
    }
    if (detected === 'xml') {
        return /<!doctype\s+html|<html\b/i.test(content) ? 'html' : 'xml';
    }
    if (detected === 'javascript' && TYPESCRIPT_HINTS.test(content)) {
        return 'typescript';
    }
    return isSecretFormat(detected) ? detected : null;
}
