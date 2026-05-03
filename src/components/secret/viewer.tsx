'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BurnedScreen } from '@/components/secret/burned-screen';
import { type LifecycleStep, LifecycleSteps } from '@/components/secret/lifecycle-steps';
import { LockScreen } from '@/components/secret/lock-screen';
import { RevealedSecret } from '@/components/secret/revealed-secret';
import type { PasswordParams } from '@/lib/password-derive';
import { isValidPassword } from '@/lib/password-policy';
import {
    decryptSecret,
    decryptSecretWithPassword,
    deriveSecretAccessToken,
    deriveSecretId,
    deriveVerifierForOpen,
    type EncryptedSecret,
    readSecretKeyFromHash,
    SECRET_VERSION_V2,
} from '@/lib/secret-crypto';
import { DEFAULT_SECRET_FORMAT, isSecretFormat, type SecretFormat } from '@/lib/secret-formats';

type LinkState =
    | { status: 'checking' }
    | { status: 'ready'; secretKey: string; accessToken: string }
    | { status: 'error' };

// Error reasons distinguish *why* reveal failed so the lock screen can show
// the right message and we don't lie about a 429/5xx being "wrong password".
// Transient reasons (rate-limited, service-unavailable, network) keep the
// user on the lock screen and let them retry; 'consumed' goes to BurnedScreen
// (terminal); 'wrong-password' stays on the lock screen with an inline error.
type ErrorReason = 'consumed' | 'wrong-password' | 'rate-limited' | 'service-unavailable' | 'network';

type SecretState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'revealed'; content: string; format: SecretFormat; viewsRemaining: number | null }
    | { status: 'error'; reason: ErrorReason };

type Props = {
    id: string;
    expiresAtUtc: string | null;
    maxViews: number | null;
    viewsUsed: number;
    passwordParams: PasswordParams | null;
};

export function Viewer({ id, expiresAtUtc, maxViews, viewsUsed, passwordParams }: Props) {
    const t = useTranslations('reveal');

    const [linkState, setLinkState] = useState<LinkState>({ status: 'checking' });
    const [secretState, setSecretState] = useState<SecretState>({ status: 'idle' });
    const [password, setPassword] = useState('');
    const requestedRef = useRef(false);

    const passwordRequired = passwordParams !== null;
    const readsRemainingBeforeOpen = maxViews === null ? null : Math.max(0, maxViews - viewsUsed);

    const expiresAtMs = useMemo(() => (expiresAtUtc ? Date.parse(expiresAtUtc) : Number.NaN), [expiresAtUtc]);
    const isExpired = Number.isFinite(expiresAtMs) ? expiresAtMs <= Date.now() : true;

    useEffect(() => {
        let cancelled = false;
        requestedRef.current = false;
        setSecretState({ status: 'idle' });

        if (!expiresAtUtc) {
            setLinkState({ status: 'error' });
            return;
        }

        setLinkState({ status: 'checking' });

        async function validateLinkKey() {
            const secretKey = readSecretKeyFromHash(window.location.hash);
            if (!secretKey) {
                if (!cancelled) setLinkState({ status: 'error' });
                return;
            }
            try {
                const derivedId = await deriveSecretId(secretKey);
                if (derivedId !== id) {
                    if (!cancelled) setLinkState({ status: 'error' });
                    return;
                }
                const accessToken = await deriveSecretAccessToken(secretKey);
                if (!cancelled) setLinkState({ status: 'ready', secretKey, accessToken });
            } catch {
                if (!cancelled) setLinkState({ status: 'error' });
            }
        }

        void validateLinkKey();
        return () => {
            cancelled = true;
        };
    }, [id, expiresAtUtc]);

    async function revealSecret() {
        if (requestedRef.current || linkState.status !== 'ready' || isExpired) return;
        if (passwordRequired && !isValidPassword(password)) return;
        requestedRef.current = true;
        setSecretState({ status: 'loading' });

        try {
            const passwordVerifier =
                passwordRequired && passwordParams ? await deriveVerifierForOpen(password, passwordParams) : null;

            let response: Response;
            try {
                response = await fetch(`/api/secrets/${encodeURIComponent(id)}`, {
                    method: 'POST',
                    cache: 'no-store',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accessToken: linkState.accessToken,
                        ...(passwordVerifier ? { passwordVerifier } : {}),
                    }),
                });
            } catch {
                // fetch only throws on transport-level failure (DNS, offline, abort, CORS) —
                // never on HTTP error status. Treat as transient.
                setSecretState({ status: 'error', reason: 'network' });
                return;
            }

            if (response.status === 429) {
                setSecretState({ status: 'error', reason: 'rate-limited' });
                return;
            }
            if (response.status >= 500) {
                setSecretState({ status: 'error', reason: 'service-unavailable' });
                return;
            }
            if (!response.ok) {
                // 4xx: most commonly 404 from the Lua mismatch path. For a
                // password-protected secret we know our access token is
                // correct (it's derived from the URL fragment we just
                // validated against the id), so a 404 here almost always
                // means wrong password — or that the secret was already
                // burned by lockout. Both cases lead to the same UX outcome:
                // try a different password, or the link is dead.
                setSecretState({ status: 'error', reason: passwordRequired ? 'wrong-password' : 'consumed' });
                return;
            }

            const data = (await response.json()) as {
                encryptedSecret?: EncryptedSecret;
                format?: unknown;
                viewsRemaining?: unknown;
            };
            if (!data.encryptedSecret) {
                setSecretState({ status: 'error', reason: passwordRequired ? 'wrong-password' : 'consumed' });
                return;
            }

            try {
                const content =
                    data.encryptedSecret.version === SECRET_VERSION_V2 && passwordParams
                        ? await decryptSecretWithPassword(
                              linkState.secretKey,
                              data.encryptedSecret,
                              password,
                              passwordParams,
                          )
                        : await decryptSecret(linkState.secretKey, data.encryptedSecret);
                const format: SecretFormat = isSecretFormat(data.format) ? data.format : DEFAULT_SECRET_FORMAT;
                const viewsRemaining: number | null =
                    typeof data.viewsRemaining === 'number' &&
                    Number.isInteger(data.viewsRemaining) &&
                    data.viewsRemaining >= 0
                        ? data.viewsRemaining
                        : null;
                setSecretState({ status: 'revealed', content, format, viewsRemaining });
            } catch {
                // Local decrypt threw. Inner AES-GCM auth fail with a
                // password-required secret means the verifier matched but
                // K_inner didn't — in our crypto model that shouldn't
                // happen, so the only realistic interpretation a user can
                // act on is "wrong password". Without password we'd have
                // already verified outer-key consistency via deriveSecretId,
                // so this branch is essentially unreachable; we degrade to
                // 'consumed' (terminal) since there is no retry strategy.
                setSecretState({ status: 'error', reason: passwordRequired ? 'wrong-password' : 'consumed' });
            }
        } finally {
            requestedRef.current = false;
        }
    }

    function deriveStep(): LifecycleStep {
        if (linkState.status === 'error') return 5;
        if (isExpired) return 5;
        if (secretState.status === 'revealed') return 4;
        if (secretState.status === 'error' && secretState.reason === 'consumed') return 5;
        return 3;
    }

    if (linkState.status === 'error' || isExpired) {
        return <BurnedScreen reason={isExpired ? 'expired' : 'not-found'} />;
    }

    // Only `consumed` is a terminal failure. wrong-password / rate-limited /
    // service-unavailable / network all stay on the lock screen so the user
    // can retry once the underlying condition changes.
    if (secretState.status === 'error' && secretState.reason === 'consumed') {
        return <BurnedScreen reason="consumed" />;
    }

    if (secretState.status === 'revealed') {
        return (
            <>
                <LifecycleSteps activeStep={deriveStep()} />
                <RevealedSecret
                    content={secretState.content}
                    format={secretState.format}
                    viewsRemaining={secretState.viewsRemaining}
                />
            </>
        );
    }

    if (linkState.status === 'checking') {
        return (
            <>
                <LifecycleSteps activeStep={3} />
                <section className="card">
                    <p className="hint" style={{ padding: 18 }}>
                        {t('validating')}
                    </p>
                </section>
            </>
        );
    }

    // 'consumed' was already routed to <BurnedScreen /> above; the remaining
    // reasons are exactly what LockScreen accepts.
    const errorReason: 'wrong-password' | 'rate-limited' | 'service-unavailable' | 'network' | null =
        secretState.status === 'error' && secretState.reason !== 'consumed' ? secretState.reason : null;

    return (
        <>
            <LifecycleSteps activeStep={3} />
            <LockScreen
                expiresAtUtc={expiresAtUtc}
                isLoading={secretState.status === 'loading'}
                isExpired={isExpired}
                isValidating={false}
                readsRemaining={readsRemainingBeforeOpen}
                passwordRequired={passwordRequired}
                password={password}
                errorReason={errorReason}
                onPasswordChange={(value) => {
                    setPassword(value);
                    // Clear an active wrong-password error as soon as the
                    // user starts typing again. Transient errors clear on
                    // the next reveal attempt.
                    if (errorReason === 'wrong-password') setSecretState({ status: 'idle' });
                }}
                onReveal={() => void revealSecret()}
            />
        </>
    );
}
