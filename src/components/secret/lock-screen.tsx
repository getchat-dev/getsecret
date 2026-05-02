'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { LockIcon, ZapIcon } from '@/components/ui/icons';

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

type Props = {
    expiresAtUtc: string | null;
    isLoading: boolean;
    isExpired: boolean;
    isValidating: boolean;
    readsRemaining: number | null;
    onReveal: () => void;
};

export function LockScreen({ expiresAtUtc, isLoading, isExpired, isValidating, readsRemaining, onReveal }: Props) {
    const t = useTranslations('reveal');

    const expiresAtMs = useMemo(() => (expiresAtUtc ? Date.parse(expiresAtUtc) : Number.NaN), [expiresAtUtc]);
    const now = useUtcNow();
    const remainingMs = Number.isFinite(expiresAtMs) ? Math.max(0, expiresAtMs - now) : 0;

    const buttonLabel = isLoading ? t('decrypting') : t('revealBtn');

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
            <p className="reveal-sub">{t('lockedSub')}</p>
            <div className="reveal-meta">
                <span className="pill pill-accent">AES-256-GCM</span>
                <span className="pill pill-muted">{t('key256')}</span>
                {readsPill()}
            </div>
            <div className="reveal-actions">
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={onReveal}
                    disabled={isLoading || isExpired || isValidating}
                >
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
