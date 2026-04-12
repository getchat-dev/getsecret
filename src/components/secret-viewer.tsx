'use client';

import { useEffect, useRef, useState } from 'react';

type SecretState =
  | { status: 'loading' }
  | { status: 'success'; secret: string }
  | { status: 'error'; message: string };

export function SecretViewer({ id }: { id: string }) {
  const [state, setState] = useState<SecretState>({ status: 'loading' });
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const requestedRef = useRef(false);

  useEffect(() => {
    if (requestedRef.current) {
      return;
    }
    requestedRef.current = true;

    let cancelled = false;

    async function consumeSecret() {
      try {
        const response = await fetch(`/api/secrets/${encodeURIComponent(id)}`, {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const data = (await response.json()) as { secret?: string; error?: string };

        if (cancelled) {
          return;
        }

        if (!response.ok || typeof data.secret !== 'string') {
          setState({
            status: 'error',
            message: data.error ?? 'Secret not found or already consumed'
          });
          return;
        }

        setState({ status: 'success', secret: data.secret });
      } catch {
        if (!cancelled) {
          setState({ status: 'error', message: 'Network error while loading secret' });
        }
      }
    }

    void consumeSecret();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === 'loading') {
    return (
      <section className="card">
        <p className="hint">Loading secret...</p>
      </section>
    );
  }

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
