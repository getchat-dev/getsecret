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
import { AlertIcon, FileIcon, ZapIcon } from '@/components/ui/icons';
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

// Allowlist instead of `image/*` because Chrome/Firefox can't decode HEIC/HEIF
// (Safari can), JPEG 2000, etc. Rendering them via <img> shows a broken-image
// glyph. Stick to formats every evergreen browser handles natively. HEIC is
// handled separately by decoding through `heic-to` (lazy-loaded WASM).
const PREVIEWABLE_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/svg+xml',
    'image/bmp',
    'image/x-icon',
    'image/vnd.microsoft.icon',
]);

// Both MIME and extension because some upload paths (older drag sources, mobile
// browsers, some Android pickers) leave `file.type` empty for HEIC/HEIF.
function isHeicCandidate(file: File): boolean {
    const type = file.type.toLowerCase();
    if (type === 'image/heic' || type === 'image/heif') return true;
    if (type === 'image/heic-sequence' || type === 'image/heif-sequence') return true;
    const name = file.name.toLowerCase();
    return name.endsWith('.heic') || name.endsWith('.heif');
}

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
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
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

    useEffect(() => {
        if (!file) {
            setImagePreviewUrl(null);
            return;
        }

        if (PREVIEWABLE_IMAGE_TYPES.has(file.type)) {
            const url = URL.createObjectURL(file);
            setImagePreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        }

        if (!isHeicCandidate(file)) {
            setImagePreviewUrl(null);
            return;
        }

        // HEIC/HEIF: dynamic import keeps the libheif WASM bundle (~hundreds of
        // KB) out of the initial JS payload — only users who actually drop a
        // HEIC file pay the cost. Using the `/next` entry runs libheif inside
        // a Web Worker so the main thread (and any in-flight encryption /
        // upload) doesn't freeze for the 0.5–2s the decode typically takes.
        // `cancelled` guards against a stale conversion resolving after the
        // user picked a different file or cleared this one.
        let cancelled = false;
        let convertedUrl: string | null = null;
        setImagePreviewUrl(null);
        (async () => {
            try {
                const { heicTo, isHeic } = await import('heic-to/next');
                if (cancelled) return;
                if (!(await isHeic(file))) return;
                const jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.85 });
                if (cancelled) return;
                convertedUrl = URL.createObjectURL(jpeg);
                setImagePreviewUrl(convertedUrl);
            } catch (err) {
                // Decode failure (corrupt file, unsupported HEIC variant, CSP
                // blocking WASM / blob worker) — leave the icon fallback.
                console.error('heic preview decode failed', err);
            }
        })();

        return () => {
            cancelled = true;
            if (convertedUrl) URL.revokeObjectURL(convertedUrl);
        };
    }, [file]);

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

    // Drop-target is window-wide: a user can drag a file onto any part of the
    // page (header, empty margins, the form itself) and it will attach. The
    // form just visually highlights via the `is-dragging` class so the user
    // knows where the file is going to land. A counter ([dragDepth]) is
    // required because the browser fires `dragleave` every time the cursor
    // crosses a child element; a plain boolean would flicker.
    const dragDepth = useRef(0);
    // Effect captures a stale chooseFile closure otherwise; chooseFile is
    // re-created each render. The ref always points at the latest version.
    const chooseFileRef = useRef(chooseFile);
    useEffect(() => {
        chooseFileRef.current = chooseFile;
    });

    useEffect(() => {
        if (!enableFileAttachments) return;

        function isFileDrag(event: DragEvent): boolean {
            const types = event.dataTransfer?.types;
            if (!types) return false;
            return Array.from(types).includes('Files');
        }

        function onEnter(event: DragEvent) {
            if (!isFileDrag(event)) return;
            event.preventDefault();
            dragDepth.current += 1;
            if (dragDepth.current === 1) setIsDragging(true);
        }

        function onOver(event: DragEvent) {
            // dragover must preventDefault to mark the page as a valid drop
            // target; otherwise the browser falls back to its default "open
            // file in tab" behavior and our drop handler never runs.
            if (!isFileDrag(event)) return;
            event.preventDefault();
        }

        function onLeave(event: DragEvent) {
            if (!isFileDrag(event)) return;
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setIsDragging(false);
        }

        function onDrop(event: DragEvent) {
            if (!isFileDrag(event)) return;
            event.preventDefault();
            dragDepth.current = 0;
            setIsDragging(false);
            const dropped = event.dataTransfer?.files?.[0];
            if (dropped) chooseFileRef.current(dropped);
        }

        window.addEventListener('dragenter', onEnter);
        window.addEventListener('dragover', onOver);
        window.addEventListener('dragleave', onLeave);
        window.addEventListener('drop', onDrop);
        return () => {
            window.removeEventListener('dragenter', onEnter);
            window.removeEventListener('dragover', onOver);
            window.removeEventListener('dragleave', onLeave);
            window.removeEventListener('drop', onDrop);
        };
    }, [enableFileAttachments]);

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
            {enableFileAttachments && isDragging ? (
                <div className="drop-overlay" aria-hidden="true">
                    <div className="drop-overlay-message">
                        <FileIcon size={32} />
                        <strong>{t('dropOverlay')}</strong>
                        <span className="drop-overlay-hint">{t('dropOverlayHint')}</span>
                    </div>
                </div>
            ) : null}
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
                    {enableFileAttachments && file ? (
                        <div className="file-info-card">
                            <div className="file-info">
                                {imagePreviewUrl ? (
                                    <img
                                        src={imagePreviewUrl}
                                        alt={file.name}
                                        className="file-info-preview"
                                        onError={() => setImagePreviewUrl(null)}
                                    />
                                ) : (
                                    <FileIcon size={16} />
                                )}
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
                        </div>
                    ) : null}
                    {enableFileAttachments ? (
                        <input
                            ref={fileInputRef}
                            type="file"
                            hidden
                            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
                        />
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
                    {error ? (
                        <div className="banner banner-danger" role="alert">
                            <AlertIcon size={16} className="icon" />
                            <span>{error}</span>
                        </div>
                    ) : null}
                </div>
                <footer className="card-footer">
                    {enableFileAttachments ? (
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isSubmitting || file !== null}
                        >
                            <FileIcon size={14} /> {t('attachFile')}
                        </button>
                    ) : null}
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
            </form>
        </>
    );
}
