// @vitest-environment jsdom
import DOMPurify from 'dompurify';
import { describe, expect, it } from 'vitest';
import { highlightSafe } from '@/lib/highlight-secret';

// `revealed-secret.tsx` pipes the output of `highlight()` through DOMPurify
// inside `highlightSafe()` before reaching `dangerouslySetInnerHTML`. These
// tests pin that contract: even if a future hljs CVE makes `highlight()`
// emit raw HTML, DOMPurify must reduce it to span+class only.
const PURIFY_CONFIG = { ALLOWED_TAGS: ['span'], ALLOWED_ATTR: ['class'] };

function highlightAndSanitize(content: string, format: 'json' | 'javascript' | 'bash' | 'yaml' | 'xml'): string {
    return highlightSafe(content, format);
}

describe('highlight + DOMPurify (defense-in-depth for revealed-secret)', () => {
    it('escapes a script tag inside JSON values', () => {
        const out = highlightAndSanitize('{"x":"<script>alert(1)</script>"}', 'json');
        expect(out).not.toContain('<script');
        // The string content is still visible (text-escaped), just no executable tag.
        expect(out).toContain('alert(1)');
    });

    it('keeps an injected img/onerror string as inert text inside JS string literal', () => {
        const out = highlightAndSanitize('const x = "<img src=x onerror=alert(1)>";', 'javascript');
        // The danger is an actual <img> element making it into the DOM with a
        // working onerror attribute. hljs html-escapes the chars so the tag
        // never opens; the literal characters survive as plain text inside a
        // hljs-string span (rendered safely).
        expect(out).not.toContain('<img');
        expect(out).toContain('&lt;img');
        // The onerror "word" appears as text content (between &lt; and &gt;),
        // never as an attribute on a real element.
        expect(out).not.toMatch(/<\w+[^>]*\s+onerror=/);
    });

    it('strips event-handler attributes if they ever slip through', () => {
        // Run DOMPurify directly on adversarial input that simulates an hljs
        // regression that emitted unescaped HTML with event handlers.
        const adversarial = '<span class="hljs-string" onclick="alert(1)">payload</span>';
        const sanitized = DOMPurify.sanitize(adversarial, PURIFY_CONFIG);
        expect(sanitized).toContain('payload');
        expect(sanitized).toContain('hljs-string');
        expect(sanitized).not.toContain('onclick');
        expect(sanitized).not.toContain('alert');
    });

    it('strips raw <script> tags', () => {
        const sanitized = DOMPurify.sanitize('<span>safe</span><script>alert(1)</script>', PURIFY_CONFIG);
        expect(sanitized).toContain('<span');
        expect(sanitized).toContain('safe');
        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('alert');
    });

    it('strips iframe and other unsafe element families', () => {
        const sanitized = DOMPurify.sanitize(
            '<span class="ok">a</span><iframe src="javascript:alert(1)"></iframe><object data="evil"></object>',
            PURIFY_CONFIG,
        );
        expect(sanitized).toContain('<span class="ok">a</span>');
        expect(sanitized).not.toMatch(/<iframe|<object/);
    });

    it('drops javascript: URLs from URL-bearing attributes on allowed elements', () => {
        // Use an a[href] payload — DOMPurify treats href as URL-bearing and
        // strips javascript:/data: schemes by default. Our component's
        // allow-list excludes <a> entirely, but pin DOMPurify's URL-checker
        // behavior here so we'd catch a config regression.
        const sanitized = DOMPurify.sanitize('<a href="javascript:alert(1)">click</a>', {
            ALLOWED_TAGS: ['a'],
            ALLOWED_ATTR: ['href'],
        });
        expect(sanitized).not.toMatch(/javascript:/i);
    });

    it('keeps the hljs span+class structure intact for legitimate output', () => {
        const out = highlightAndSanitize('{"key":"value"}', 'json');
        // hljs emits `<span class="hljs-...">...</span>` — both should survive.
        expect(out).toMatch(/<span class="hljs-[a-z]+"/);
    });

    it('produces nothing executable for the empty string', () => {
        expect(highlightAndSanitize('', 'json')).toBe('');
    });

    it('preserves plain text inside spans (no double-escaping)', () => {
        const out = highlightAndSanitize('"hello world"', 'json');
        expect(out).toContain('hello world');
    });
});
