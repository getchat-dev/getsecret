'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertIcon, CheckIcon, CopyIcon } from '@/components/ui/icons';

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

export function ToastMessage({ toast }: { toast: ToastState | null }) {
    if (!toast) {
        return null;
    }

    return (
        <div
            className={`toast ${toast.kind === 'success' ? 'toast-success' : 'toast-error'}`}
            role={toast.kind === 'success' ? 'status' : 'alert'}
        >
            {toast.kind === 'success' ? <CheckIcon size={14} className="check" /> : <AlertIcon size={14} />}
            <span>{toast.message}</span>
        </div>
    );
}

export function CopyButton({ textToCopy, copyLabel, copiedLabel, successMessage, errorMessage }: CopyButtonProps) {
    const { copyStatus, toast, copyText } = useClipboardCopy();

    const Icon = copyStatus === 'copied' ? CheckIcon : copyStatus === 'error' ? AlertIcon : CopyIcon;
    const stateClass = copyStatus === 'copied' ? 'is-success' : copyStatus === 'error' ? 'is-error' : '';

    return (
        <span className="toast-anchor">
            <button
                className={`icon-button ${stateClass}`.trim()}
                onClick={() => void copyText(textToCopy, { successMessage, errorMessage })}
                type="button"
                aria-label={copyStatus === 'copied' ? copiedLabel : copyLabel}
            >
                <Icon size={16} />
            </button>
            <ToastMessage toast={toast} />
        </span>
    );
}
