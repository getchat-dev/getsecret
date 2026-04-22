'use client';

import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton, ToastMessage, useClipboardCopy } from '@/components/copy-button';
import { createSecretLink } from '@/lib/create-secret-link';
import { MAX_EXPIRATION_SECONDS } from '@/lib/expiration';
import { MAX_SECRET_LENGTH } from '@/lib/secret-crypto';

type TtlUnit = 'hours' | 'days';

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

function unitSeconds(unit: TtlUnit): number {
    return unit === 'days' ? SECONDS_PER_DAY : SECONDS_PER_HOUR;
}

function maxValueForUnit(unit: TtlUnit): number {
    return Math.floor(MAX_EXPIRATION_SECONDS / unitSeconds(unit));
}

export function SecretForm() {
    const [secret, setSecret] = useState('');
    const [link, setLink] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [ttlValue, setTtlValue] = useState('1');
    const [ttlUnit, setTtlUnit] = useState<TtlUnit>('days');
    const secretInputRef = useRef<HTMLTextAreaElement | null>(null);
    const { copyText, toast } = useClipboardCopy();

    const remaining = useMemo(() => MAX_SECRET_LENGTH - secret.length, [secret.length]);
    const maxForCurrentUnit = useMemo(() => maxValueForUnit(ttlUnit), [ttlUnit]);

    useEffect(() => {
        secretInputRef.current?.focus();
    }, []);

    function handleTtlValueChange(raw: string) {
        // Only digits allowed; empty string is OK while typing.
        const digitsOnly = raw.replace(/\D+/g, '');
        setTtlValue(digitsOnly);
    }

    function handleUnitChange(nextUnit: TtlUnit) {
        if (nextUnit === ttlUnit) {
            return;
        }
        setTtlUnit(nextUnit);
        const parsed = Number.parseInt(ttlValue, 10);
        const max = maxValueForUnit(nextUnit);
        if (Number.isInteger(parsed) && parsed > max) {
            setTtlValue(String(max));
        }
    }

    function computeExpiresInSeconds(): number | null {
        const parsed = Number.parseInt(ttlValue, 10);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxForCurrentUnit) {
            return null;
        }
        return parsed * unitSeconds(ttlUnit);
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        setLink('');

        const expiresInSeconds = computeExpiresInSeconds();
        if (expiresInSeconds === null) {
            setError(`Enter an expiration between 1 and ${maxForCurrentUnit} ${ttlUnit}.`);
            return;
        }

        setIsSubmitting(true);

        try {
            const nextLink = await createSecretLink(secret, expiresInSeconds);
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

                <div className="submit-row">
                    <div className="toast-anchor toast-anchor-start">
                        <button type="submit" className="button" disabled={isSubmitting}>
                            {isSubmitting ? 'Creating...' : 'Share secret'}
                        </button>
                        <ToastMessage toast={toast} />
                    </div>

                    <div className="ttl-control">
                        <label htmlFor="ttl-value" className="ttl-label">
                            Expires in
                        </label>
                        <input
                            id="ttl-value"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="ttl-input"
                            value={ttlValue}
                            onChange={(event) => handleTtlValueChange(event.target.value)}
                            aria-label={`Expiration value in ${ttlUnit}`}
                        />
                        <div className="ttl-toggle">
                            <button
                                type="button"
                                className="ttl-toggle-option"
                                aria-pressed={ttlUnit === 'hours'}
                                onClick={() => handleUnitChange('hours')}
                            >
                                Hours
                            </button>
                            <button
                                type="button"
                                className="ttl-toggle-option"
                                aria-pressed={ttlUnit === 'days'}
                                onClick={() => handleUnitChange('days')}
                            >
                                Days
                            </button>
                        </div>
                    </div>
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
