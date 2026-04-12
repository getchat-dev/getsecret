'use client';

import { CopyButton } from '@/components/copy-button';
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
          <CopyButton
            textToCopy={link}
            copyLabel="Copy secret link"
            copiedLabel="Secret link copied"
            successMessage="Secret link copied to clipboard"
            errorMessage="Could not copy link to clipboard"
          />
        </div>
      ) : null}
    </section>
  );
}
