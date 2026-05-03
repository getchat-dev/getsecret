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

type SecretState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'revealed'; content: string; format: SecretFormat; viewsRemaining: number | null }
    | { status: 'error'; reason: 'consumed' | 'wrong-password' };

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

            const response = await fetch(`/api/secrets/${encodeURIComponent(id)}`, {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accessToken: linkState.accessToken,
                    ...(passwordVerifier ? { passwordVerifier } : {}),
                }),
            });
            const data = (await response.json()) as {
                encryptedSecret?: EncryptedSecret;
                format?: unknown;
                viewsRemaining?: unknown;
            };
            if (!response.ok || !data.encryptedSecret) {
                setSecretState({ status: 'error', reason: passwordRequired ? 'wrong-password' : 'consumed' });
                return;
            }
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
            setSecretState({ status: 'error', reason: passwordRequired ? 'wrong-password' : 'consumed' });
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

    if (secretState.status === 'error' && secretState.reason === 'consumed' && !passwordRequired) {
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

    const wrongPassword = secretState.status === 'error' && secretState.reason === 'wrong-password';

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
                passwordError={wrongPassword}
                onPasswordChange={(value) => {
                    setPassword(value);
                    if (wrongPassword) setSecretState({ status: 'idle' });
                }}
                onReveal={() => void revealSecret()}
            />
        </>
    );
}
