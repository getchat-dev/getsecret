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
import type { SecretFormat } from '@/lib/secret-formats';

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
