'use client';

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton, ToastMessage, useClipboardCopy } from '@/components/copy-button';
import { createSecretLink } from '@/lib/create-secret-link';
import { MAX_SECRET_LENGTH } from '@/lib/secret-crypto';

export function SecretForm() {
    const [secret, setSecret] = useState('');
    const [link, setLink] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const secretInputRef = useRef<HTMLTextAreaElement | null>(null);
    const { copyText, toast } = useClipboardCopy();

    const remaining = useMemo(() => MAX_SECRET_LENGTH - secret.length, [secret.length]);

    useEffect(() => {
        secretInputRef.current?.focus();
    }, []);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        setLink('');

        setIsSubmitting(true);

        try {
            const nextLink = await createSecretLink(secret);
            setLink(nextLink);
            setSecret('');
            await copyText(
                nextLink,
                {
                    successMessage: 'Secret link copied to clipboard',
                    errorMessage: 'Could not copy link to clipboard',
                },
                { silentError: true },
            );
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to create secret link');
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
                    ref={secretInputRef}
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

                <div className="toast-anchor toast-anchor-start">
                    <button type="submit" className="button" disabled={isSubmitting}>
                        {isSubmitting ? 'Creating...' : 'Share secret'}
                    </button>
                    <ToastMessage toast={toast} />
                </div>
            </form>

            <p className="hint">
                Secret is encrypted in your browser. The decryption key stays only after <code>#</code> in the generated
                link.
            </p>

            {error ? <p className="error">{error}</p> : null}

            {link ? (
                <div className="result">
                    <span className="secret-link" title="Secret link">
                        {link}
                    </span>
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
