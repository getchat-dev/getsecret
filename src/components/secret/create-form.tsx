'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
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
import { type UploadProgress, uploadFile } from '@/lib/upload';

const DRAFT_STORAGE_KEY = 'burnotes:create:draft';
const FORMAT_STORAGE_KEY = 'burnotes:create:format';
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

type Props = {
    enableMultiRead?: boolean;
    enablePassword?: boolean;
    enableFileAttachments?: boolean;
};

export function CreateForm({ enableMultiRead = false, enablePassword = false, enableFileAttachments = true }: Props) {
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
    const [file, setFile] = useState<File | null>(null);
    const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const effectiveMaxViews = enableMultiRead ? maxViews : DEFAULT_MAX_VIEWS;
    const effectivePassword = enablePassword && password.length > 0 ? password : '';
    const passwordTouched = enablePassword && password.length > 0;
    const passwordValid = !passwordTouched || isValidPassword(password);

    const activeStep = link ? 2 : 1;
    const hasContent = secret.trim().length > 0 || file !== null;

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

    function chooseFile(next: File | null) {
        if (!next) {
            setFile(null);
            return;
        }
        if (next.size > MAX_FILE_SIZE_BYTES) {
            setError(tErrors('fileTooLarge', { max: formatBytes(MAX_FILE_SIZE_BYTES) }));
            return;
        }
        setError('');
        setFile(next);
    }

    function handleDrop(event: React.DragEvent<HTMLDivElement>) {
        event.preventDefault();
        setIsDragging(false);
        if (!enableFileAttachments) return;
        const dropped = event.dataTransfer.files?.[0];
        if (dropped) chooseFile(dropped);
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!hasContent) return;
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
        abortRef.current = new AbortController();
        try {
            let uploadResult: { fileRef: import('@/lib/secret-crypto').FileRef; uploadToken: string } | null = null;
            if (file) {
                setUploadProgress({ loaded: 0, total: file.size });
                uploadResult = await uploadFile(file, {
                    signal: abortRef.current.signal,
                    onProgress: (p) => setUploadProgress(p),
                });
            }

            const next = await createSecretLink(secret, {
                expiresInSeconds,
                format,
                maxViews: effectiveMaxViews,
                ...(effectivePassword.length > 0 ? { password: effectivePassword } : {}),
                ...(uploadResult ? { fileRef: uploadResult.fileRef, uploadToken: uploadResult.uploadToken } : {}),
            });
            window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
            window.sessionStorage.removeItem(FORMAT_STORAGE_KEY);
            setLink(next);
        } catch (err) {
            setError(err instanceof Error ? err.message : tErrors('createFailed'));
        } finally {
            setIsSubmitting(false);
            setUploadProgress(null);
            abortRef.current = null;
        }
    }

    function cancelSubmit() {
        if (abortRef.current) abortRef.current.abort();
    }

    function shareAnother() {
        setSecret('');
        setFormat(DEFAULT_SECRET_FORMAT);
        setLink('');
        setPassword('');
        setFile(null);
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
                    {enableFileAttachments ? (
                        // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop is a pointer-only enhancement on top of the keyboard-accessible "Browse" button inside.
                        <div
                            className={`file-dropzone ${isDragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`.trim()}
                            onDragOver={(e) => {
                                e.preventDefault();
                                setIsDragging(true);
                            }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                        >
                            {file ? (
                                <div className="file-info">
                                    <FileIcon size={16} />
                                    <span className="file-info-name">{file.name}</span>
                                    <span className="file-info-meta">
                                        {formatBytes(file.size)} · {file.type || 'application/octet-stream'}
                                    </span>
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => chooseFile(null)}
                                        disabled={isSubmitting}
                                    >
                                        {t('removeFile')}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <p className="file-dropzone-hint">{t('attachFileHint')}</p>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        {t('browseFile')}
                                    </button>
                                </>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                hidden
                                onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                            />
                        </div>
                    ) : null}
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
                    {secret.length > 0 || file ? (
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => {
                                setSecret('');
                                setFormat(DEFAULT_SECRET_FORMAT);
                                setFile(null);
                            }}
                            disabled={isSubmitting}
                        >
                            {t('clear')}
                        </button>
                    ) : null}
                    {isSubmitting && uploadProgress ? (
                        <button type="button" className="btn btn-ghost" onClick={cancelSubmit}>
                            {t('cancel')}
                        </button>
                    ) : null}
                    <button type="submit" className="btn btn-primary" disabled={isSubmitting || !hasContent}>
                        <ZapIcon size={14} />
                        {isSubmitting
                            ? uploadProgress
                                ? t('uploading', {
                                      percent: Math.round((uploadProgress.loaded / uploadProgress.total) * 100),
                                  })
                                : t('encrypting')
                            : t('submit')}
                    </button>
                </footer>
                {error ? <p className="error">{error}</p> : null}
            </form>
        </>
    );
}
