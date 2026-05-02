'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_SECRET_LENGTH } from '@/lib/secret-crypto';
import { SECRET_FORMAT_PLACEHOLDERS, type SecretFormat } from '@/lib/secret-formats';

type Props = {
    value: string;
    onChange: (next: string) => void;
    format: SecretFormat;
    autoFocus?: boolean;
};

export function SecretTextarea({ value, onChange, format, autoFocus }: Props) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const overlayRef = useRef<HTMLPreElement | null>(null);
    const [highlightedHtml, setHighlightedHtml] = useState('');

    useEffect(() => {
        if (autoFocus) {
            textareaRef.current?.focus();
        }
    }, [autoFocus]);

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

    const showOverlay = format !== 'plain' && highlightedHtml.length > 0;

    return (
        <div className="textarea-wrap">
            <textarea
                ref={textareaRef}
                className={showOverlay ? 'textarea-transparent' : undefined}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onScroll={handleScroll}
                maxLength={MAX_SECRET_LENGTH}
                autoComplete="off"
                spellCheck={false}
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
        </div>
    );
}
