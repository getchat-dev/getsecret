'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import {
    decryptSecret,
    deriveSecretAccessToken,
    deriveSecretId,
    type EncryptedSecret,
    readSecretKeyFromHash,
} from '@/lib/secret-crypto';

type SecretState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'revealed'; secret: string }
    | { status: 'error'; message: string };

type LinkState =
    | { status: 'checking' }
    | { status: 'ready'; secretKey: string; accessToken: string }
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
    const requestedRef = useRef(false);
    const nowUtcMs = useUtcNow();
    const expiresAtMs = useMemo(() => (expiresAtUtc ? Date.parse(expiresAtUtc) : Number.NaN), [expiresAtUtc]);
    const isExpired = Number.isFinite(expiresAtMs) ? expiresAtMs <= nowUtcMs : true;

    useEffect(() => {
        let cancelled = false;

        requestedRef.current = false;
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
                error?: string;
            };

            if (!response.ok || !data.encryptedSecret) {
                setState({
                    status: 'error',
                    message: data.error ?? 'Secret not found or already consumed',
                });
                return;
            }

            const secret = await decryptSecret(linkState.secretKey, data.encryptedSecret);
            setState({ status: 'revealed', secret });
        } catch {
            setState({
                status: 'error',
                message: 'Could not load or decrypt the secret in this browser',
            });
        } finally {
            requestedRef.current = false;
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

    return (
        <section className="card">
            <h2 className="subtitle">Secret</h2>
            <pre className="secret-value">{state.secret}</pre>
            <div className="viewer-actions">
                <CopyButton
                    textToCopy={state.secret}
                    copyLabel="Copy secret"
                    copiedLabel="Secret copied"
                    successMessage="Secret copied to clipboard"
                    errorMessage="Could not copy secret to clipboard"
                />
            </div>
            <p className="hint">The encrypted payload has now been deleted from server memory.</p>
        </section>
    );
}
