'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton, ToastMessage, useClipboardCopy } from '@/components/copy-button';
import { createSecretLink } from '@/lib/create-secret-link';
import {
    decryptSecret,
    deriveSecretAccessToken,
    deriveSecretId,
    type EncryptedSecret,
    readSecretKeyFromHash,
} from '@/lib/secret-crypto';
import { DEFAULT_SECRET_FORMAT, isSecretFormat, type SecretFormat } from '@/lib/secret-formats';

type SecretState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'revealed'; content: string; format: SecretFormat; highlightedHtml: string | null }
    | { status: 'error'; message: string };

type LinkState =
    | { status: 'checking' }
    | { status: 'ready'; secretKey: string; accessToken: string }
    | { status: 'error'; message: string };

type ReshareState =
    | { status: 'idle' }
    | { status: 'creating' }
    | { status: 'ready'; link: string }
    | { status: 'error'; message: string };

function useUtcNow() {
    const [nowUtcMs, setNowUtcMs] = useState(() => Date.now());

    useEffect(() => {
        const syncNow = () => {
            setNowUtcMs(Date.now());
        };

        syncNow();

        const interval = window.setInterval(syncNow, 1000);

        return () => {
            window.clearInterval(interval);
        };
    }, []);

    return nowUtcMs;
}

function formatRemainingTime(remainingMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    if (days > 0) {
        return `${days}d ${hh}:${mm}:${ss}`;
    }

    return `${hh}:${mm}:${ss}`;
}

function ExpiryCountdown({ expiresAtUtc }: { expiresAtUtc: string }) {
    const expiresAtMs = useMemo(() => Date.parse(expiresAtUtc), [expiresAtUtc]);
    const nowUtcMs = useUtcNow();

    if (!Number.isFinite(expiresAtMs)) {
        return <span className="error">Invalid expiration time</span>;
    }

    const remainingMs = Math.max(0, expiresAtMs - nowUtcMs);

    return (
        <span className={`countdown ${remainingMs === 0 ? 'countdown-expired' : ''}`}>
            {remainingMs === 0 ? 'Expired' : `Expires in ${formatRemainingTime(remainingMs)}`}
        </span>
    );
}

export function SecretViewer({ id, expiresAtUtc }: { id: string; expiresAtUtc: string | null }) {
    const [state, setState] = useState<SecretState>(() =>
        expiresAtUtc ? { status: 'idle' } : { status: 'error', message: 'Secret not found or expired' },
    );
    const [linkState, setLinkState] = useState<LinkState>(() =>
        expiresAtUtc ? { status: 'checking' } : { status: 'error', message: 'Secret not found or expired' },
    );
    const [reshareState, setReshareState] = useState<ReshareState>({ status: 'idle' });
    const [isInfoFocused, setIsInfoFocused] = useState(false);
    const [isInfoPinned, setIsInfoPinned] = useState(false);
    const requestedRef = useRef(false);
    const infoPopoverRef = useRef<HTMLDivElement | null>(null);
    const { copyText, toast } = useClipboardCopy();
    const nowUtcMs = useUtcNow();
    const expiresAtMs = useMemo(() => (expiresAtUtc ? Date.parse(expiresAtUtc) : Number.NaN), [expiresAtUtc]);
    const isExpired = Number.isFinite(expiresAtMs) ? expiresAtMs <= nowUtcMs : true;
    const isInfoVisible = isInfoFocused || isInfoPinned;

    useEffect(() => {
        let cancelled = false;

        requestedRef.current = false;
        setReshareState({ status: 'idle' });
        setState(expiresAtUtc ? { status: 'idle' } : { status: 'error', message: 'Secret not found or expired' });

        if (!expiresAtUtc) {
            setLinkState({ status: 'error', message: 'Secret not found or expired' });
            return;
        }

        setLinkState({ status: 'checking' });

        async function validateLinkKey() {
            const secretKey = readSecretKeyFromHash(window.location.hash);
            if (!secretKey) {
                if (!cancelled) {
                    setLinkState({ status: 'error', message: 'This link is missing its decryption key' });
                }
                return;
            }

            try {
                const derivedId = await deriveSecretId(secretKey);
                if (derivedId !== id) {
                    if (!cancelled) {
                        setLinkState({
                            status: 'error',
                            message: 'This decryption key does not match the secret link',
                        });
                    }
                    return;
                }

                const accessToken = await deriveSecretAccessToken(secretKey);
                if (!cancelled) {
                    setLinkState({ status: 'ready', secretKey, accessToken });
                }
            } catch {
                if (!cancelled) {
                    setLinkState({ status: 'error', message: 'Invalid or corrupted decryption key' });
                }
            }
        }

        void validateLinkKey();

        return () => {
            cancelled = true;
        };
    }, [id, expiresAtUtc]);

    useEffect(() => {
        if (!isInfoPinned) {
            return;
        }

        function handlePointerDown(event: PointerEvent) {
            if (!infoPopoverRef.current?.contains(event.target as Node)) {
                setIsInfoPinned(false);
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setIsInfoPinned(false);
            }
        }

        window.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isInfoPinned]);

    useEffect(() => {
        if (state.status !== 'revealed') {
            return;
        }
        if (state.format === 'plain' || state.highlightedHtml !== null) {
            return;
        }

        let cancelled = false;
        const content = state.content;
        const format = state.format;

        void (async () => {
            try {
                const { highlight } = await import('@/lib/highlight-secret');
                const html = highlight(content, format);
                if (!cancelled) {
                    setState((prev) =>
                        prev.status === 'revealed' && prev.highlightedHtml === null
                            ? { ...prev, highlightedHtml: html }
                            : prev,
                    );
                }
            } catch {
                if (!cancelled) {
                    setState((prev) =>
                        prev.status === 'revealed' && prev.highlightedHtml === null
                            ? { ...prev, highlightedHtml: '' }
                            : prev,
                    );
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [state]);

    async function revealSecret() {
        if (requestedRef.current || !expiresAtUtc || isExpired || linkState.status !== 'ready') {
            return;
        }

        requestedRef.current = true;
        setState({ status: 'loading' });

        try {
            const response = await fetch(`/api/secrets/${encodeURIComponent(id)}`, {
                method: 'POST',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ accessToken: linkState.accessToken }),
            });

            const data = (await response.json()) as {
                encryptedSecret?: EncryptedSecret;
                format?: unknown;
                error?: string;
            };

            if (!response.ok || !data.encryptedSecret) {
                setState({
                    status: 'error',
                    message: data.error ?? 'Secret not found or already consumed',
                });
                return;
            }

            const content = await decryptSecret(linkState.secretKey, data.encryptedSecret);
            const format: SecretFormat = isSecretFormat(data.format) ? data.format : DEFAULT_SECRET_FORMAT;
            setState({ status: 'revealed', content, format, highlightedHtml: null });
        } catch {
            setState({
                status: 'error',
                message: 'Could not load or decrypt the secret in this browser',
            });
        } finally {
            requestedRef.current = false;
        }
    }

    async function createReplacementLink(content: string, format: SecretFormat) {
        if (reshareState.status === 'creating') {
            return;
        }

        setReshareState({ status: 'creating' });

        try {
            const nextLink = await createSecretLink(content, undefined, format);
            setReshareState({ status: 'ready', link: nextLink });
            await copyText(
                nextLink,
                {
                    successMessage: 'New secret link copied to clipboard',
                    errorMessage: 'Could not copy new link to clipboard',
                },
                { silentError: true },
            );
        } catch (error) {
            setReshareState({
                status: 'error',
                message: error instanceof Error ? error.message : 'Failed to create secret link',
            });
        }
    }

    if (state.status === 'error') {
        return (
            <section className="card">
                <p className="error">{state.message}</p>
            </section>
        );
    }

    if (linkState.status === 'error') {
        return (
            <section className="card">
                <p className="error">{linkState.message}</p>
            </section>
        );
    }

    if (linkState.status === 'checking') {
        return (
            <section className="card">
                <h2 className="subtitle">Secret</h2>
                <p className="hint">Validating secure link...</p>
            </section>
        );
    }

    if (state.status === 'idle') {
        return (
            <section className="card">
                <h2 className="subtitle">Secret</h2>
                <p className="hint">This secret was encrypted in the sender&apos;s browser.</p>
                <div className="viewer-actions viewer-actions-spread">
                    <button className="button" onClick={() => void revealSecret()} type="button" disabled={isExpired}>
                        Reveal secret
                    </button>
                    {expiresAtUtc ? <ExpiryCountdown expiresAtUtc={expiresAtUtc} /> : null}
                </div>
                {isExpired ? <p className="error">This secret has expired before it was opened.</p> : null}
            </section>
        );
    }

    if (state.status === 'loading') {
        return (
            <section className="card">
                <h2 className="subtitle">Secret</h2>
                <p className="hint">Loading encrypted secret...</p>
            </section>
        );
    }

    const showHighlighted =
        state.format !== 'plain' && typeof state.highlightedHtml === 'string' && state.highlightedHtml.length > 0;

    return (
        <section className="card" aria-live="polite">
            <h2 className="subtitle">Secret</h2>
            <div className="secret-value-wrap">
                <pre className="secret-value">
                    {showHighlighted ? (
                        <code
                            className={`hljs language-${state.format}`}
                            // biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js escapes content; only span tags are injected.
                            dangerouslySetInnerHTML={{ __html: state.highlightedHtml as string }}
                        />
                    ) : (
                        state.content
                    )}
                </pre>
                <div className="secret-value-copy">
                    <CopyButton
                        textToCopy={state.content}
                        copyLabel="Copy secret"
                        copiedLabel="Secret copied"
                        successMessage="Secret copied to clipboard"
                        errorMessage="Could not copy secret to clipboard"
                    />
                </div>
            </div>
            <div className="viewer-actions">
                <div className="toast-anchor toast-anchor-start">
                    <button
                        className="button"
                        onClick={() => void createReplacementLink(state.content, state.format)}
                        type="button"
                        disabled={reshareState.status === 'creating'}
                    >
                        {reshareState.status === 'creating' ? 'Generating...' : 'Generate new link'}
                    </button>
                    <ToastMessage toast={toast} />
                </div>
                <div ref={infoPopoverRef} className={`info-popover ${isInfoVisible ? 'is-open' : ''}`.trim()}>
                    <button
                        className="info-popover-trigger"
                        aria-label="Why generate a new link?"
                        aria-expanded={isInfoVisible}
                        aria-controls="reshare-info"
                        onFocus={() => setIsInfoFocused(true)}
                        onBlur={() => setIsInfoFocused(false)}
                        onClick={() => setIsInfoPinned((value) => !value)}
                        type="button"
                    >
                        <span className="info-popover-icon" aria-hidden="true">
                            i
                        </span>
                    </button>
                    <div className="info-popover-content" id="reshare-info" role="tooltip">
                        Use this when the secret was already opened, but you need to pass it to someone else through a
                        fresh one-time link.
                    </div>
                </div>
            </div>
            {reshareState.status === 'error' ? <p className="error">{reshareState.message}</p> : null}
            {reshareState.status === 'ready' ? (
                <div className="result">
                    <span className="secret-link">{reshareState.link}</span>
                    <CopyButton
                        textToCopy={reshareState.link}
                        copyLabel="Copy new secret link"
                        copiedLabel="New secret link copied"
                        successMessage="New secret link copied to clipboard"
                        errorMessage="Could not copy new link to clipboard"
                    />
                </div>
            ) : null}
            <p className="hint">The encrypted payload has now been deleted from server memory.</p>
        </section>
    );
}
