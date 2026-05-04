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

// Buckets the remaining time into a human phrase (days/hours/minutes/seconds).
// Returns the i18n key + count so the caller can localize with ICU plurals.
// We do this instead of a fixed mm:ss format because the recipient cares
// about "how long do I have to act", not exact seconds — and a counting-down
// HH:MM:SS implies false urgency for a 24h-valid link.
function bucketRemainingTime(remainingMs: number): { key: string; count: number } {
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    if (totalSeconds < 60) return { key: 'linkValidSeconds', count: totalSeconds };
    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes < 60) return { key: 'linkValidMinutes', count: totalMinutes };
    const totalHours = Math.floor(totalMinutes / 60);
    if (totalHours < 24) return { key: 'linkValidHours', count: totalHours };
    return { key: 'linkValidDays', count: Math.floor(totalHours / 24) };
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
    const remainingBucket = bucketRemainingTime(remainingMs);

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
            <p className="reveal-sub">{passwordRequired ? t('passwordPromptSub') : t('lockedSub')}</p>
            <div className="reveal-meta">
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
            {!isExpired && Number.isFinite(expiresAtMs) ? (
                <p className="countdown">{t(remainingBucket.key, { count: remainingBucket.count })}</p>
            ) : null}
            <div className="reveal-actions">
                <button type="button" className="btn btn-primary" onClick={onReveal} disabled={disabled}>
                    <ZapIcon size={14} />
                    {buttonLabel}
                </button>
                {readsRemaining === null ? null : readsRemaining > 1 ? (
                    <span className="reveal-hint">{t('revealHintRemaining', { count: readsRemaining - 1 })}</span>
                ) : (
                    <span className="reveal-hint">{t('revealHint')}</span>
                )}
            </div>
        </section>
    );
}
