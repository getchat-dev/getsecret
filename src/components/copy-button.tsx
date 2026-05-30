'use client';

import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertIcon, CheckIcon, CopyIcon } from '@/components/ui/icons';
import btn from '@/styles/primitives/button.module.css';
import styles from './copy-button.module.css';

export type CopyStatus = 'idle' | 'copied' | 'error';
export type ToastState = {
    kind: 'success' | 'error';
    message: string;
};

type CopyFeedbackMessages = {
    successMessage: string;
    errorMessage: string;
};

type CopyTextOptions = {
    silentError?: boolean;
};

type CopyButtonProps = {
    textToCopy: string;
    copyLabel: string;
    copiedLabel: string;
    successMessage: string;
    errorMessage: string;
};

export function useClipboardCopy() {
    const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
    const [toast, setToast] = useState<ToastState | null>(null);
    const copyStatusTimeoutRef = useRef<number | null>(null);
    const toastTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (copyStatusTimeoutRef.current !== null) {
                window.clearTimeout(copyStatusTimeoutRef.current);
            }

            if (toastTimeoutRef.current !== null) {
                window.clearTimeout(toastTimeoutRef.current);
            }
        };
    }, []);

    function scheduleCopyStatusReset() {
        if (copyStatusTimeoutRef.current !== null) {
            window.clearTimeout(copyStatusTimeoutRef.current);
        }

        copyStatusTimeoutRef.current = window.setTimeout(() => {
            setCopyStatus('idle');
            copyStatusTimeoutRef.current = null;
        }, 1800);
    }

    function showToast(nextToast: ToastState) {
        setToast(nextToast);

        if (toastTimeoutRef.current !== null) {
            window.clearTimeout(toastTimeoutRef.current);
        }

        toastTimeoutRef.current = window.setTimeout(() => {
            setToast(null);
            toastTimeoutRef.current = null;
        }, 2400);
    }

    async function copyText(
        textToCopy: string,
        { successMessage, errorMessage }: CopyFeedbackMessages,
        options?: CopyTextOptions,
    ) {
        try {
            await navigator.clipboard.writeText(textToCopy);
            navigator.vibrate?.(12);
            setCopyStatus('copied');
            showToast({ kind: 'success', message: successMessage });
            scheduleCopyStatusReset();
        } catch {
            if (!options?.silentError) {
                setCopyStatus('error');
                showToast({ kind: 'error', message: errorMessage });
                scheduleCopyStatusReset();
            }
        }
    }

    return { copyStatus, toast, copyText };
}

type ToastMessageProps = {
    toast: ToastState | null;
    anchorRef?: RefObject<HTMLElement | null>;
};

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;

function computeAnchoredPosition(
    anchor: DOMRect,
    toastSize: { width: number; height: number },
    viewport: { width: number; height: number },
) {
    const spaceAbove = anchor.top;
    const spaceBelow = viewport.height - anchor.bottom;
    const placeAbove = spaceAbove >= toastSize.height + ANCHOR_GAP || spaceAbove > spaceBelow;

    const top = placeAbove
        ? Math.max(VIEWPORT_MARGIN, anchor.top - toastSize.height - ANCHOR_GAP)
        : Math.min(viewport.height - toastSize.height - VIEWPORT_MARGIN, anchor.bottom + ANCHOR_GAP);

    const desiredLeft = anchor.left + anchor.width / 2 - toastSize.width / 2;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(desiredLeft, viewport.width - toastSize.width - VIEWPORT_MARGIN));

    return { top, left };
}

function findPortalTarget(anchor: HTMLElement): HTMLElement {
    let el: HTMLElement | null = anchor;
    while (el) {
        if (el.tagName === 'DIALOG' && (el as HTMLDialogElement).open) {
            return el;
        }
        el = el.parentElement;
    }
    return document.body;
}

export function ToastMessage({ toast, anchorRef }: ToastMessageProps) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

    useLayoutEffect(() => {
        if (!toast || !anchorRef) return;
        const toastEl = ref.current;
        const anchorEl = anchorRef.current;
        if (!toastEl || !anchorEl) return;

        function reposition() {
            if (!toastEl || !anchorEl) return;
            const anchor = anchorEl.getBoundingClientRect();
            const toastRect = toastEl.getBoundingClientRect();
            setPosition(
                computeAnchoredPosition(
                    anchor,
                    { width: toastRect.width, height: toastRect.height },
                    { width: window.innerWidth, height: window.innerHeight },
                ),
            );
        }

        reposition();
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        return () => {
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
    }, [toast, anchorRef]);

    if (!toast) {
        return null;
    }

    const anchored = !!anchorRef;
    const style: React.CSSProperties | undefined = anchored
        ? {
              position: 'fixed',
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              visibility: position ? 'visible' : 'hidden',
          }
        : undefined;

    const node = (
        <div
            ref={ref}
            className={`${styles.toast} ${toast.kind === 'success' ? styles.toastSuccess : styles.toastError}`}
            role={toast.kind === 'success' ? 'status' : 'alert'}
            style={style}
        >
            {toast.kind === 'success' ? <CheckIcon size={14} className={styles.check} /> : <AlertIcon size={14} />}
            <span>{toast.message}</span>
        </div>
    );

    if (!anchored) return node;
    if (typeof document === 'undefined') return null;
    const target = anchorRef?.current ? findPortalTarget(anchorRef.current) : document.body;
    return createPortal(node, target);
}

export function CopyButton({ textToCopy, copyLabel, copiedLabel, successMessage, errorMessage }: CopyButtonProps) {
    const { copyStatus, toast, copyText } = useClipboardCopy();
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    const Icon = copyStatus === 'copied' ? CheckIcon : copyStatus === 'error' ? AlertIcon : CopyIcon;
    const dataState = copyStatus === 'copied' ? 'success' : copyStatus === 'error' ? 'error' : undefined;

    return (
        <>
            <button
                ref={buttonRef}
                className={`${btn.btn} ${btn.btnGhost} ${btn.btnIcon}`}
                data-state={dataState}
                onClick={() => void copyText(textToCopy, { successMessage, errorMessage })}
                type="button"
                aria-label={copyStatus === 'copied' ? copiedLabel : copyLabel}
            >
                <Icon size={14} />
            </button>
            <ToastMessage toast={toast?.kind === 'error' ? toast : null} anchorRef={buttonRef} />
        </>
    );
}
