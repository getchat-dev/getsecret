'use client';

import { FormEvent, useMemo, useState } from 'react';

type CreateResponse = {
  id: string;
  path: string;
  expiresAt: number;
  expiresInSeconds: number;
};
type ErrorResponse = {
  error?: string;
};

const MAX_SECRET_LENGTH = 10_000;

export function SecretForm() {
  const [secret, setSecret] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const remaining = useMemo(() => MAX_SECRET_LENGTH - secret.length, [secret.length]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLink('');

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
    } catch {
      setError('Could not copy link to clipboard');
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
          <button className="icon-button" onClick={copyLink} type="button" aria-label="Copy secret link">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z" />
            </svg>
          </button>
        </div>
      ) : null}
    </section>
  );
}
