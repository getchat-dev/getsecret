'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { EyeIcon, EyeOffIcon, KeyIcon, LockIcon, ZapIcon } from '@/components/ui/icons';
import { isValidPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/password-policy';

function useUtcNow(intervalMs = 1000) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        setNow(Date.now());
        const interval = window.setInterval(() => setNow(Date.now()), intervalMs);
        return () => window.clearInterval(interval);
    }, [intervalMs]);
    return now;
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

type LockScreenErrorReason = 'wrong-password' | 'rate-limited' | 'service-unavailable' | 'network';

type Props = {
    expiresAtUtc: string | null;
    isLoading: boolean;
    isExpired: boolean;
    isValidating: boolean;
    readsRemaining: number | null;
    passwordRequired: boolean;
    password: string;
    errorReason: LockScreenErrorReason | null;
    onPasswordChange: (next: string) => void;
    onReveal: () => void;
};

export function LockScreen({
    expiresAtUtc,
    isLoading,
    isExpired,
    isValidating,
    readsRemaining,
    passwordRequired,
    password,
    errorReason,
    onPasswordChange,
    onReveal,
}: Props) {
    const t = useTranslations('reveal');

    const expiresAtMs = useMemo(() => (expiresAtUtc ? Date.parse(expiresAtUtc) : Number.NaN), [expiresAtUtc]);
    const now = useUtcNow();
    const remainingMs = Number.isFinite(expiresAtMs) ? Math.max(0, expiresAtMs - now) : 0;

    const [showPassword, setShowPassword] = useState(false);

    const buttonLabel = isLoading ? t('decrypting') : t('revealBtn');
    const passwordValid = !passwordRequired || isValidPassword(password);
    const disabled = isLoading || isExpired || isValidating || !passwordValid;
    const isWrongPassword = errorReason === 'wrong-password';
    const transientError =
        errorReason === 'rate-limited' || errorReason === 'service-unavailable' || errorReason === 'network'
            ? errorReason
            : null;

    function readsPill() {
        if (readsRemaining === null) {
            return <span className="pill pill-accent">{t('unlimitedReads')}</span>;
        }
        if (readsRemaining > 1) {
            return <span className="pill pill-accent">{t('readsRemaining', { count: readsRemaining })}</span>;
        }
        return <span className="pill pill-ember">{t('burnsOnRead')}</span>;
    }

    return (
        <section className="card reveal-card fade-up">
            <div className="lock-icon">
                <LockIcon size={28} />
            </div>
            <h2 className="reveal-title">{t('lockedTitle')}</h2>
            <p className="reveal-sub">{passwordRequired ? t('passwordPromptSub') : t('lockedSub')}</p>
            <div className="reveal-meta">
                <span className="pill pill-accent">AES-256-GCM</span>
                <span className="pill pill-muted">{t('key256')}</span>
                {passwordRequired ? <span className="pill pill-accent">{t('passwordPill')}</span> : null}
                {readsPill()}
            </div>
            {passwordRequired ? (
                <div className="field">
                    <label className="field-label" htmlFor="reveal-password">
                        <KeyIcon size={12} /> {t('passwordPromptLabel')}
                    </label>
                    <div className="field-row">
                        <div className="password-wrap">
                            <input
                                id="reveal-password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="off"
                                spellCheck={false}
                                value={password}
                                maxLength={MAX_PASSWORD_LENGTH}
                                onChange={(event) => onPasswordChange(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && passwordValid && !disabled) {
                                        event.preventDefault();
                                        onReveal();
                                    }
                                }}
                                placeholder={t('passwordPromptPlaceholder')}
                                className={`password-input ${isWrongPassword ? 'has-error' : ''}`.trim()}
                            />
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon password-toggle"
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                            >
                                {showPassword ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                            </button>
                        </div>
                    </div>
                    {isWrongPassword ? (
                        <p className="hint hint-error">{t('passwordWrong')}</p>
                    ) : (
                        <p className="hint">{t('passwordPromptHint', { min: MIN_PASSWORD_LENGTH })}</p>
                    )}
                </div>
            ) : null}
            {transientError ? (
                <p className="hint hint-error">
                    {transientError === 'rate-limited'
                        ? t('errorRateLimited')
                        : transientError === 'service-unavailable'
                          ? t('errorServiceUnavailable')
                          : t('errorNetwork')}
                </p>
            ) : null}
            <div className="reveal-actions">
                <button type="button" className="btn btn-primary" onClick={onReveal} disabled={disabled}>
                    <ZapIcon size={14} />
                    {buttonLabel}
                </button>
                {!isExpired && Number.isFinite(expiresAtMs) ? (
                    <span className="countdown">
                        {t('expiresIn')} {formatRemainingTime(remainingMs)}
                    </span>
                ) : null}
            </div>
        </section>
    );
}
