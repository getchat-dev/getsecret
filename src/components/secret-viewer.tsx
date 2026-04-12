'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type SecretState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'revealed'; secret: string }
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
    expiresAtUtc ? { status: 'idle' } : { status: 'error', message: 'Secret not found or expired' }
  );
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const requestedRef = useRef(false);
  const nowUtcMs = useUtcNow();
  const expiresAtMs = useMemo(
    () => (expiresAtUtc ? Date.parse(expiresAtUtc) : Number.NaN),
    [expiresAtUtc]
  );
  const isExpired = Number.isFinite(expiresAtMs) ? expiresAtMs <= nowUtcMs : true;

  useEffect(() => {
    requestedRef.current = false;
    setCopyStatus('idle');
    setState(
      expiresAtUtc ? { status: 'idle' } : { status: 'error', message: 'Secret not found or expired' }
    );
  }, [id, expiresAtUtc]);

  if (state.status === 'error') {
    return (
      <section className="card">
        <p className="error">{state.message}</p>
      </section>
    );
  }

  async function copySecret(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }

  async function revealSecret() {
    if (requestedRef.current || !expiresAtUtc || isExpired) {
      return;
    }

    requestedRef.current = true;
    setState({ status: 'loading' });

    try {
      const response = await fetch(`/api/secrets/${encodeURIComponent(id)}`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = (await response.json()) as { secret?: string; error?: string };

      if (!response.ok || typeof data.secret !== 'string') {
        setState({
          status: 'error',
          message: data.error ?? 'Secret not found or already consumed'
        });
        return;
      }

      setState({ status: 'revealed', secret: data.secret });
    } catch {
      setState({ status: 'error', message: 'Network error while loading secret' });
    } finally {
      requestedRef.current = false;
    }
  }

  if (state.status === 'idle') {
    return (
      <section className="card">
        <h2 className="subtitle">Secret</h2>
        <p className="hint">This secret is hidden until you choose to reveal it.</p>
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
        <p className="hint">Loading secret...</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2 className="subtitle">Secret</h2>
      <pre className="secret-value">{state.secret}</pre>
      <div className="viewer-actions">
        <button
          className="icon-button"
          onClick={() => void copySecret(state.secret)}
          type="button"
          aria-label="Copy secret"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z" />
          </svg>
        </button>
        {copyStatus === 'copied' ? <span className="hint">Copied to clipboard</span> : null}
        {copyStatus === 'error' ? <span className="error">Could not copy secret</span> : null}
      </div>
      <p className="hint">This secret has now been deleted from server memory.</p>
    </section>
  );
}
