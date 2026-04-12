'use client';

import { useEffect, useRef, useState } from 'react';

type CopyStatus = 'idle' | 'copied' | 'error';
type ToastState = {
    kind: 'success' | 'error';
    message: string;
};

type CopyButtonProps = {
    textToCopy: string;
    copyLabel: string;
    copiedLabel: string;
    successMessage: string;
    errorMessage: string;
};

export function CopyButton({ textToCopy, copyLabel, copiedLabel, successMessage, errorMessage }: CopyButtonProps) {
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

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(textToCopy);
            navigator.vibrate?.(12);
            setCopyStatus('copied');
            showToast({ kind: 'success', message: successMessage });
            scheduleCopyStatusReset();
        } catch {
            setCopyStatus('error');
            showToast({ kind: 'error', message: errorMessage });
            scheduleCopyStatusReset();
        }
    }

    return (
        <>
            <button
                className={`icon-button ${copyStatus === 'copied' ? 'is-success' : ''} ${copyStatus === 'error' ? 'is-error' : ''}`.trim()}
                onClick={() => void handleCopy()}
                type="button"
                aria-label={copyStatus === 'copied' ? copiedLabel : copyLabel}
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    {copyStatus === 'copied' ? (
                        <path d="M9.55 18.2 4.8 13.45l1.4-1.4 3.35 3.35 8.25-8.25 1.4 1.4-9.65 9.65z" />
                    ) : copyStatus === 'error' ? (
                        <path d="M18.3 7.1 16.9 5.7 12 10.6 7.1 5.7 5.7 7.1l4.9 4.9-4.9 4.9 1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9 4.9-4.9z" />
                    ) : (
                        <path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z" />
                    )}
                </svg>
            </button>

            {toast ? (
                <div
                    className={`toast ${toast.kind === 'success' ? 'toast-success' : 'toast-error'}`}
                    role={toast.kind === 'success' ? 'status' : 'alert'}
                >
                    {toast.message}
                </div>
            ) : null}
        </>
    );
}
