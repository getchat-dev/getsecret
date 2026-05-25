'use client';

import { useTranslations } from 'next-intl';
import { type ClipboardEvent, type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MAX_SECRET_LENGTH } from '@/lib/secret-crypto';
import { SECRET_FORMAT_PLACEHOLDERS, type SecretFormat } from '@/lib/secret-formats';

// Thresholds for the bottom-right char counter.
// Below SHOW_COUNT_THRESHOLD the counter appears at all (otherwise hidden —
// typical secrets are < 200 chars long, showing "10,000 left" is pure noise).
// Below WARN_COUNT_THRESHOLD it switches to the ember/danger color so the
// user gets a visible cue before hitting the wall.
const SHOW_COUNT_THRESHOLD = 1000;
const WARN_COUNT_THRESHOLD = 200;

type Props = {
    value: string;
    onChange: (next: string) => void;
    onFormatDetected?: (format: SecretFormat) => void;
    format: SecretFormat;
    autoFocus?: boolean;
};

export function SecretTextarea({ value, onChange, onFormatDetected, format, autoFocus }: Props) {
    const t = useTranslations('create');
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const overlayRef = useRef<HTMLPreElement | null>(null);
    const [highlightedHtml, setHighlightedHtml] = useState('');
    const [autoGrow, setAutoGrow] = useState(false);
    const remaining = MAX_SECRET_LENGTH - value.length;

    useEffect(() => {
        if (autoFocus) {
            textareaRef.current?.focus();
        }
    }, [autoFocus]);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        // Desktop with mouse, OR phone-shaped touch device in portrait orientation.
        const mql = window.matchMedia(
            '(hover: hover) and (pointer: fine), (hover: none) and (pointer: coarse) and (orientation: portrait) and (max-width: 768px)',
        );
        const update = () => setAutoGrow(mql.matches);
        update();
        mql.addEventListener('change', update);
        return () => mql.removeEventListener('change', update);
    }, []);

    // `keyboardHint` is set only on devices that almost certainly have a real
    // keyboard — strict (hover: hover) AND (pointer: fine). That excludes both
    // pure-touch tablets and phones, where ⌘/Ctrl+Enter is meaningless. Set in
    // an effect (never during render) so SSR markup doesn't differ from the
    // first client paint.
    const [keyboardHint, setKeyboardHint] = useState<{ isMac: boolean } | null>(null);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mql = window.matchMedia('(hover: hover) and (pointer: fine)');
        const update = () => {
            if (mql.matches) {
                setKeyboardHint({ isMac: /Mac/i.test(navigator.userAgent) });
            } else {
                setKeyboardHint(null);
            }
        };
        update();
        mql.addEventListener('change', update);
        return () => mql.removeEventListener('change', update);
    }, []);

    // biome-ignore lint/correctness/useExhaustiveDependencies: value/format/highlightedHtml are re-measure triggers, not read inside the effect
    useLayoutEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        if (!autoGrow) {
            ta.style.height = '';
            return;
        }
        const resize = () => {
            ta.style.height = 'auto';
            ta.style.height = `${ta.scrollHeight}px`;
        };
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, [autoGrow, value, format, highlightedHtml]);

    useEffect(() => {
        if (format === 'plain' || value.length === 0) {
            setHighlightedHtml('');
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const { highlight } = await import('@/lib/highlight-secret');
                if (cancelled) return;
                setHighlightedHtml(highlight(value, format));
            } catch {
                if (!cancelled) setHighlightedHtml('');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [value, format]);

    function handleScroll() {
        const ta = textareaRef.current;
        const overlay = overlayRef.current;
        if (ta && overlay) {
            overlay.scrollTop = ta.scrollTop;
            overlay.scrollLeft = ta.scrollLeft;
        }
    }

    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        // ⌘/Ctrl + Enter submits the enclosing form. requestSubmit() fires the
        // form's submit event (same path as clicking the submit button) and
        // respects React handlers. Doesn't bypass the disabled state of the
        // submit button by spec — but our handleSubmit has its own
        // hasContent/isSubmitting guards, so a stray invocation is harmless.
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
        }
    }

    function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
        if (!onFormatDetected) return;
        const ta = event.currentTarget;
        const replacesAll = ta.selectionStart === 0 && ta.selectionEnd === ta.value.length;
        if (!replacesAll) return;
        const pasted = event.clipboardData.getData('text');
        if (!pasted) return;
        void (async () => {
            try {
                const { detectFormat } = await import('@/lib/highlight-secret');
                const detected = detectFormat(pasted);
                if (detected) onFormatDetected(detected);
            } catch {}
        })();
    }

    const showOverlay = format !== 'plain' && highlightedHtml.length > 0;

    return (
        <div className={`textarea-wrap${autoGrow ? ' auto-grow' : ''}`}>
            <textarea
                ref={textareaRef}
                className={showOverlay ? 'textarea-transparent' : undefined}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onScroll={handleScroll}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                maxLength={MAX_SECRET_LENGTH}
                autoComplete="off"
                spellCheck={false}
                wrap={format === 'plain' ? 'soft' : 'off'}
                placeholder={SECRET_FORMAT_PLACEHOLDERS[format]}
                required
            />
            {showOverlay ? (
                <pre ref={overlayRef} className="textarea-overlay" aria-hidden="true">
                    <code
                        className={`hljs language-${format}`}
                        // biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js escapes content; only span tags are injected.
                        dangerouslySetInnerHTML={{ __html: `${highlightedHtml}\n` }}
                    />
                </pre>
            ) : null}
            <span className="textarea-meta">
                {remaining < SHOW_COUNT_THRESHOLD ? (
                    <span className={`count${remaining < WARN_COUNT_THRESHOLD ? ' warn' : ''}`}>
                        {t('charsLeft', { count: remaining })}
                    </span>
                ) : null}
                {keyboardHint && value.length > 0 ? (
                    <span className="shortcut-hint" title={t('submitHint')}>
                        <kbd>{keyboardHint.isMac ? '⌘' : 'Ctrl'}</kbd>
                        <kbd>Enter</kbd>
                    </span>
                ) : null}
            </span>
        </div>
    );
}
