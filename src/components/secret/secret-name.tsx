'use client';

import { useTranslations } from 'next-intl';
import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileIcon } from '@/components/ui/icons';
import { MAX_SECRET_NAME_LENGTH, sanitizeFilename } from '@/lib/secret-filename';
import { type NameEllipsis, truncateName } from '@/lib/truncate-name';
import card from '@/styles/primitives/card.module.css';
import styles from './secret-name.module.css';

// Measures with a canvas in the element's own font: no layout thrash, and
// the result matches what the browser will draw closely enough that the
// 1px slack below absorbs rounding.
let measureContext: CanvasRenderingContext2D | null = null;

// Gap between the name and the hint slot; matches .hintSlot's margin.
const HINT_GAP = 4;

function textWidth(text: string, style: CSSStyleDeclaration): number {
    measureContext ??= document.createElement('canvas').getContext('2d');
    if (!measureContext) return 0;
    measureContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if ('letterSpacing' in measureContext) measureContext.letterSpacing = style.letterSpacing;
    return measureContext.measureText(text).width;
}

// Renders `<base>.<ext>`, cutting the base with "…" when the header row is
// too narrow (see truncateName for where the cut goes). The extension is
// never cut. The row's width is read from the enclosing `.title`, which is
// sized by the header rather than by its content, so shortening the text
// can't feed back into the measurement.
function TruncatedName({ value, extension, ellipsis }: { value: string; extension: string; ellipsis: NameEllipsis }) {
    const rootRef = useRef<HTMLSpanElement>(null);
    const baseRef = useRef<HTMLSpanElement>(null);
    const extensionRef = useRef<HTMLSpanElement>(null);
    const [shown, setShown] = useState(value);

    // biome-ignore lint/correctness/useExhaustiveDependencies: extension is a re-measure trigger (its width changes the room left for the base), not read inside the effect
    useLayoutEffect(() => {
        const root = rootRef.current;
        const base = baseRef.current;
        const ext = extensionRef.current;
        const box = root?.closest<HTMLElement>(`.${styles.title}`);
        if (!root || !base || !ext || !box) return;
        // An optional "?" after the name; room for it (and the gap before it)
        // comes off the width the name may use. It's display:none while hints
        // are off, and then reserves nothing.
        const hintSlot = box.querySelector<HTMLElement>(`.${styles.hintSlot}`);

        const refit = () => {
            const hintRoom =
                hintSlot && hintSlot.offsetWidth > 0 ? hintSlot.getBoundingClientRect().width + HINT_GAP : 0;
            const available =
                box.getBoundingClientRect().right -
                root.getBoundingClientRect().left -
                ext.getBoundingClientRect().width -
                hintRoom -
                1;
            const style = getComputedStyle(base);
            setShown(truncateName(value, (candidate) => textWidth(candidate, style) <= available, ellipsis));
        };

        refit();
        const observer = new ResizeObserver(refit);
        observer.observe(box);
        // Fires when the hints toggle shows or hides the "?".
        if (hintSlot) observer.observe(hintSlot);
        // Web fonts can land after the first measurement and change widths.
        let active = true;
        void document.fonts?.ready.then(() => {
            if (active) refit();
        });
        return () => {
            active = false;
            observer.disconnect();
        };
    }, [value, extension, ellipsis]);

    const full = `${value}.${extension}`;
    return (
        <span ref={rootRef} className={styles.name}>
            {/* Screen readers get the full name, not the cut one. */}
            <span className="visually-hidden">{full}</span>
            <span aria-hidden="true" className={styles.name}>
                <span ref={baseRef} className={styles.base}>
                    {shown}
                </span>
                <span ref={extensionRef} className={styles.extension}>
                    .{extension}
                </span>
            </span>
        </span>
    );
}

type Props = {
    value: string;
    extension: string;
    onChange: (next: string) => void;
    // Name to restore when the user clears the field.
    fallback: string;
    disabled?: boolean;
    ellipsis?: NameEllipsis;
    // Rendered right after the name, e.g. a <Hint>.
    hint?: ReactNode;
};

// Card-header file name for the text part. Reads as plain text until
// clicked, then turns into an inline input for the base name; the extension
// stays fixed because it follows the selected format. Enter or blur commits,
// Escape reverts, and an empty/unusable name falls back to `fallback`.
export function SecretName({
    value,
    extension,
    onChange,
    fallback,
    disabled = false,
    ellipsis = 'middle',
    hint,
}: Props) {
    const t = useTranslations('create');
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isEditing) return;
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [isEditing]);

    function startEditing() {
        setDraft(value);
        setIsEditing(true);
    }

    function commit() {
        const next = sanitizeFilename(draft);
        onChange(next.length > 0 ? next : fallback);
        setIsEditing(false);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'Enter') {
            // Inside the create <form> — Enter must not submit the secret.
            event.preventDefault();
            commit();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            setIsEditing(false);
        }
    }

    return (
        <span className={`${card.headerTitle} ${styles.title}`}>
            <FileIcon size={14} className={card.fileIcon} />
            {isEditing ? (
                <span className={styles.editor}>
                    <input
                        ref={inputRef}
                        className={styles.input}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={handleKeyDown}
                        maxLength={MAX_SECRET_NAME_LENGTH}
                        size={Math.max(draft.length, 1)}
                        spellCheck={false}
                        autoComplete="off"
                        aria-label={t('fileNameLabel')}
                    />
                    <span className={styles.extension}>.{extension}</span>
                </span>
            ) : (
                <button
                    type="button"
                    className={styles.trigger}
                    onClick={startEditing}
                    disabled={disabled}
                    title={`${value}.${extension} — ${t('renameFile')}`}
                >
                    <TruncatedName value={value} extension={extension} ellipsis={ellipsis} />
                </button>
            )}
            {hint ? <span className={styles.hintSlot}>{hint}</span> : null}
        </span>
    );
}

// Read-only counterpart for the reveal page: same truncation rules, so a long
// name ellipsizes its base while the extension and the header actions stay put.
export type { NameEllipsis };

export function SecretNameLabel({
    value,
    extension,
    ellipsis = 'middle',
}: {
    value: string;
    extension: string;
    ellipsis?: NameEllipsis;
}) {
    return (
        <span className={`${card.headerTitle} ${styles.title}`} title={`${value}.${extension}`}>
            <FileIcon size={14} className={card.fileIcon} />
            <TruncatedName value={value} extension={extension} ellipsis={ellipsis} />
        </span>
    );
}
