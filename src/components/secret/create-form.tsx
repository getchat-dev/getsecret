'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { FormatSelect } from '@/components/secret/format-select';
import { GeneratedLink } from '@/components/secret/generated-link';
import { LifecycleSteps } from '@/components/secret/lifecycle-steps';
import { MaxViewsControl } from '@/components/secret/max-views-control';
import { PasswordField } from '@/components/secret/password-field';
import { SecretTextarea } from '@/components/secret/secret-textarea';
import { TtlControl, ttlValueToSeconds } from '@/components/secret/ttl-control';
import { FileIcon, ZapIcon } from '@/components/ui/icons';
import { createSecretLink } from '@/lib/create-secret-link';
import type { TtlUnit } from '@/lib/expiration';
import { DEFAULT_MAX_VIEWS } from '@/lib/max-views';
import { isValidPassword, MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import {
    DEFAULT_SECRET_FORMAT,
    isSecretFormat,
    SECRET_FORMAT_EXTENSIONS,
    type SecretFormat,
} from '@/lib/secret-formats';

const DRAFT_STORAGE_KEY = 'burnotes:create:draft';
const FORMAT_STORAGE_KEY = 'burnotes:create:format';

type Props = {
    enableMultiRead?: boolean;
    enablePassword?: boolean;
};

export function CreateForm({ enableMultiRead = false, enablePassword = false }: Props) {
    const t = useTranslations('create');
    const tErrors = useTranslations('errors');

    const [secret, setSecret] = useState('');
    const [link, setLink] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [ttlValue, setTtlValue] = useState('1');
    const [ttlUnit, setTtlUnit] = useState<TtlUnit>('days');
    const [format, setFormat] = useState<SecretFormat>(DEFAULT_SECRET_FORMAT);
    const [maxViews, setMaxViews] = useState<number | null>(DEFAULT_MAX_VIEWS);
    const [password, setPassword] = useState('');

    const effectiveMaxViews = enableMultiRead ? maxViews : DEFAULT_MAX_VIEWS;
    const effectivePassword = enablePassword && password.length > 0 ? password : '';
    const passwordTouched = enablePassword && password.length > 0;
    const passwordValid = !passwordTouched || isValidPassword(password);

    const activeStep = link ? 2 : 1;

    useEffect(() => {
        const draft = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
        if (draft) setSecret(draft);
        const savedFormat = window.sessionStorage.getItem(FORMAT_STORAGE_KEY);
        if (savedFormat && isSecretFormat(savedFormat)) setFormat(savedFormat);
    }, []);

    useEffect(() => {
        if (secret) {
            window.sessionStorage.setItem(DRAFT_STORAGE_KEY, secret);
        } else {
            window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
        }
    }, [secret]);

    useEffect(() => {
        if (format !== DEFAULT_SECRET_FORMAT) {
            window.sessionStorage.setItem(FORMAT_STORAGE_KEY, format);
        } else {
            window.sessionStorage.removeItem(FORMAT_STORAGE_KEY);
        }
    }, [format]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!secret.trim()) return;
        setError('');

        if (passwordTouched && !passwordValid) {
            setError(tErrors('passwordTooShort', { min: MIN_PASSWORD_LENGTH }));
            return;
        }

        const expiresInSeconds = ttlValueToSeconds(ttlValue, ttlUnit);
        if (expiresInSeconds === null) {
            setError(tErrors('createFailed'));
            return;
        }

        setIsSubmitting(true);
        try {
            const next = await createSecretLink(secret, {
                expiresInSeconds,
                format,
                maxViews: effectiveMaxViews,
                ...(effectivePassword.length > 0 ? { password: effectivePassword } : {}),
            });
            window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
            window.sessionStorage.removeItem(FORMAT_STORAGE_KEY);
            setLink(next);
        } catch (err) {
            setError(err instanceof Error ? err.message : tErrors('createFailed'));
        } finally {
            setIsSubmitting(false);
        }
    }

    function shareAnother() {
        setSecret('');
        setFormat(DEFAULT_SECRET_FORMAT);
        setLink('');
        setPassword('');
        setError('');
    }

    if (link) {
        return (
            <>
                <LifecycleSteps activeStep={activeStep} />
                <GeneratedLink
                    link={link}
                    expiresIn={{ value: ttlValue, unit: ttlUnit }}
                    maxReads={effectiveMaxViews}
                    hasPassphrase={effectivePassword.length > 0}
                    onShareAnother={shareAnother}
                />
            </>
        );
    }

    return (
        <>
            <LifecycleSteps activeStep={activeStep} />
            <form onSubmit={handleSubmit} className="card fade-up" noValidate>
                <header className="card-header">
                    <span className="card-header-title">
                        <FileIcon size={14} className="file-icon" />
                        secret.{SECRET_FORMAT_EXTENSIONS[format]}
                    </span>
                    <span className="card-header-meta">
                        <FormatSelect value={format} onChange={setFormat} label={t('formatLabel')} />
                    </span>
                </header>
                <div className="card-body">
                    <SecretTextarea
                        value={secret}
                        onChange={(next) => {
                            setSecret(next);
                            if (next.length === 0) setFormat(DEFAULT_SECRET_FORMAT);
                        }}
                        onFormatDetected={setFormat}
                        format={format}
                        autoFocus
                    />
                    <div className="field-pair">
                        <TtlControl
                            value={ttlValue}
                            unit={ttlUnit}
                            onChange={({ value, unit }) => {
                                setTtlValue(value);
                                setTtlUnit(unit);
                            }}
                        />
                        {enableMultiRead ? <MaxViewsControl value={maxViews} onChange={setMaxViews} /> : null}
                    </div>
                    {enablePassword ? <PasswordField value={password} onChange={setPassword} /> : null}
                </div>
                <footer className="card-footer">
                    {secret.length > 0 ? (
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => {
                                setSecret('');
                                setFormat(DEFAULT_SECRET_FORMAT);
                            }}
                        >
                            {t('clear')}
                        </button>
                    ) : null}
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isSubmitting || secret.trim().length === 0}
                    >
                        <ZapIcon size={14} />
                        {isSubmitting ? t('encrypting') : t('submit')}
                    </button>
                </footer>
                {error ? <p className="error">{error}</p> : null}
            </form>
        </>
    );
}
