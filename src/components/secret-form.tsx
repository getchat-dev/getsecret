'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type CreateResponse = {
  id: string;
  path: string;
  expiresAt: number;
  expiresInSeconds: number;
};
type ErrorResponse = {
  error?: string;
};
type CopyStatus = 'idle' | 'copied' | 'error';
type ToastState = {
  kind: 'success' | 'error';
  message: string;
};

const MAX_SECRET_LENGTH = 10_000;

export function SecretForm() {
  const [secret, setSecret] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const [toast, setToast] = useState<ToastState | null>(null);
  const copyStatusTimeoutRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const remaining = useMemo(() => MAX_SECRET_LENGTH - secret.length, [secret.length]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLink('');
    setCopyStatus('idle');

    if (secret.length === 0 || secret.length > MAX_SECRET_LENGTH) {
      setError(`Secret length must be between 1 and ${MAX_SECRET_LENGTH} characters.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/secrets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        cache: 'no-store',
        body: JSON.stringify({ secret })
      });

      const data = (await response.json()) as CreateResponse | ErrorResponse;

      if (!response.ok || !('path' in data)) {
        const message = 'error' in data ? data.error : undefined;
        setError(message ?? 'Failed to create secret link');
        return;
      }

      const absoluteUrl = new URL(data.path, window.location.origin).toString();
      setLink(absoluteUrl);
      setSecret('');
    } catch {
      setError('Network error while creating secret link');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyLink() {
    if (!link) {
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      navigator.vibrate?.(12);
      setCopyStatus('copied');
      showToast({ kind: 'success', message: 'Secret link copied to clipboard' });
      scheduleCopyStatusReset();
    } catch {
      setCopyStatus('error');
      showToast({ kind: 'error', message: 'Could not copy link to clipboard' });
      scheduleCopyStatusReset();
    }
  }

  return (
    <section className="card" aria-live="polite">
      <form onSubmit={handleSubmit} className="secret-form" noValidate>
        <label htmlFor="secret" className="label">
          Secret text
        </label>
        <textarea
          id="secret"
          name="secret"
          className="textarea"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          maxLength={MAX_SECRET_LENGTH}
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste password, token, or any secret here"
          required
        />

        <div className="meta-row">
          <small className="hint">{remaining} characters left</small>
        </div>

        <button type="submit" className="button" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Share secret'}
        </button>
      </form>

      <p className="hint">
        Secret will be deleted after the first view or automatically after 24 hours.
      </p>

      {error ? <p className="error">{error}</p> : null}

      {link ? (
        <div className="result">
          <a href={link} className="secret-link" rel="noreferrer nofollow">
            {link}
          </a>
          <button
            className={`icon-button ${copyStatus === 'copied' ? 'is-success' : ''} ${copyStatus === 'error' ? 'is-error' : ''}`.trim()}
            onClick={copyLink}
            type="button"
            aria-label={copyStatus === 'copied' ? 'Secret link copied' : 'Copy secret link'}
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
        </div>
      ) : null}

      {toast ? (
        <div
          className={`toast ${toast.kind === 'success' ? 'toast-success' : 'toast-error'}`}
          role={toast.kind === 'success' ? 'status' : 'alert'}
        >
          {toast.message}
        </div>
      ) : null}
    </section>
  );
}
