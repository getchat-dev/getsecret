'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { FormatSelect } from '@/components/secret/format-select';
import { GeneratedLink } from '@/components/secret/generated-link';
// Hidden for now; re-enable by uncommenting this import and the two
// <LifecycleSteps activeStep={activeStep} /> usages below.
// import { LifecycleSteps } from '@/components/secret/lifecycle-steps';
import { MaxViewsControl } from '@/components/secret/max-views-control';
import { PasswordField } from '@/components/secret/password-field';
import { SecretTextarea } from '@/components/secret/secret-textarea';
import { TtlControl, ttlValueToSeconds } from '@/components/secret/ttl-control';
import { ActionLabel } from '@/components/ui/action-label';
import { AlertIcon, FileIcon, XIcon, ZapIcon } from '@/components/ui/icons';
import { createSecretLink } from '@/lib/create-secret-link';
import type { TtlUnit } from '@/lib/expiration';
import { decodeImagePreview, isImageCandidate } from '@/lib/image-preview';
import { DEFAULT_MAX_VIEWS } from '@/lib/max-views';
import { markOwnSecret } from '@/lib/own-secrets';
import { isValidPassword, MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import {
    DEFAULT_SECRET_FORMAT,
    isSecretFormat,
    SECRET_FORMAT_EXTENSIONS,
    type SecretFormat,
} from '@/lib/secret-formats';
import { COMMAND } from '@/lib/ui-commands';
import { type UploadProgress, uploadFile } from '@/lib/upload';
import banner from '@/styles/primitives/banner.module.css';
import btn from '@/styles/primitives/button.module.css';
import card from '@/styles/primitives/card.module.css';
import field from '@/styles/primitives/field.module.css';
import styles from './create-form.module.css';

const DRAFT_STORAGE_KEY = 'burnotes:create:draft';
const FORMAT_STORAGE_KEY = 'burnotes:create:format';
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Pull a file out of a paste event's DataTransfer. `clipboardData.files` is
// the fast path (set by most browsers when the clipboard carries a binary
// payload like a screenshot). `items` is the fallback — some browsers /
// platforms only surface the file through getAsFile().
function fileFromClipboard(data: DataTransfer | null): File | null {
    if (!data) return null;
    if (data.files.length > 0) return data.files[0];
    for (const item of Array.from(data.items)) {
        if (item.kind === 'file') {
            const f = item.getAsFile();
            if (f) return f;
        }
    }
    return null;
}

// Clipboard files often arrive without a name (typically true for
// screenshots: items.getAsFile() returns a File whose `name` is empty or
// generic like "image.png"). Synthesize a stable, sortable filename from the
// MIME so the recipient sees something more meaningful than `attachment`.
function ensurePastedFilename(file: File): File {
    if (file.name && file.name !== 'image.png') return file;
    const subtype = (file.type.split('/')[1] || 'bin').split(';')[0].split('+')[0] || 'bin';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return new File([file], `pasted-${stamp}.${subtype}`, { type: file.type });
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
    // Default ON: when the sender attaches an image, the recipient sees a
    // thumbnail inline after reveal. The checkbox only appears when there's
    // an image to preview, so a non-image attachment never asks the user.
    const [previewImage, setPreviewImage] = useState(true);
    const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const effectiveMaxViews = enableMultiRead ? maxViews : DEFAULT_MAX_VIEWS;
    const effectivePassword = enablePassword && password.length > 0 ? password : '';
    const passwordTouched = enablePassword && password.length > 0;
    const passwordValid = !passwordTouched || isValidPassword(password);

    // const activeStep = link ? 2 : 1; // re-enable with the LifecycleSteps usages
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
        const handle = decodeImagePreview(file, { type: file.type, name: file.name });
        if (!handle) {
            setImagePreviewUrl(null);
            return;
        }
        let cancelled = false;
        setImagePreviewUrl(null);
        handle.promise.then((url) => {
            if (!cancelled) setImagePreviewUrl(url);
        });
        return () => {
            cancelled = true;
            handle.abort();
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

        // Paste handler: matches the drag-and-drop UX — the whole window is
        // a paste target for file/image data. The SecretTextarea has its own
        // onPaste for text (format detection); the two coexist because a
        // text-only clipboard has no `files` and this handler is a no-op,
        // while a screenshot paste has no insertable text so the textarea's
        // default behavior is also a no-op. We never preventDefault: pasting
        // text alongside a file (rare) still inserts the text, and pasting
        // outside the form (e.g. into a password field nearby) doesn't lose
        // its native behavior since we only act when files are present.
        function onPaste(event: ClipboardEvent) {
            const picked = fileFromClipboard(event.clipboardData);
            if (!picked) return;
            chooseFileRef.current(ensurePastedFilename(picked));
        }
        window.addEventListener('paste', onPaste);
        return () => {
            window.removeEventListener('dragenter', onEnter);
            window.removeEventListener('dragover', onOver);
            window.removeEventListener('dragleave', onLeave);
            window.removeEventListener('drop', onDrop);
            window.removeEventListener('paste', onPaste);
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

            // Only forward previewImage when there's actually an image to
            // preview AND the user kept the checkbox checked. createSecretLink
            // (and encodePlaintext below it) also strip the flag if there's
            // no fileRef, but filtering here keeps the wire shape predictable.
            const fileIsImage = file !== null && isImageCandidate({ type: file.type, name: file.name });
            const next = await createSecretLink(secret, {
                expiresInSeconds,
                format,
                maxViews: effectiveMaxViews,
                ...(effectivePassword.length > 0 ? { password: effectivePassword } : {}),
                ...(uploadResult ? { fileRef: uploadResult.fileRef, uploadToken: uploadResult.uploadToken } : {}),
                ...(uploadResult && fileIsImage && previewImage ? { previewImage: true } : {}),
            });
            window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
            window.sessionStorage.removeItem(FORMAT_STORAGE_KEY);
            // Remember this id locally so if the sender later opens their own
            // link in the same browser the viewer can warn before they burn
            // it. Pure UX safety net — does nothing for a sender on another
            // device / browser / incognito session. id is parsed back from
            // the returned URL because createSecretLink doesn't surface it.
            try {
                const path = new URL(next).pathname;
                const id = /\/s\/([^/]+)$/.exec(path)?.[1];
                if (id) markOwnSecret(id, Date.now() + expiresInSeconds * 1000);
            } catch {
                // Malformed URL is unreachable in practice (we just built it
                // ourselves) — failure here only means the local marker isn't
                // set, which downgrades the warning, not correctness.
            }
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
        setPreviewImage(true);
        setError('');
    }

    if (link) {
        return (
            <>
                {/* <LifecycleSteps activeStep={activeStep} /> */}
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
            {/* <LifecycleSteps activeStep={activeStep} /> */}
            {enableFileAttachments && isDragging ? (
                <div className={styles.dropOverlay} aria-hidden="true">
                    <div className={styles.dropOverlayMessage}>
                        <FileIcon size={32} />
                        <strong>{t('dropOverlay')}</strong>
                        <span className={styles.dropOverlayHint}>{t('dropOverlayHint')}</span>
                    </div>
                </div>
            ) : null}
            <form onSubmit={handleSubmit} className={`${card.card} fade-up`} noValidate>
                <header className={card.header}>
                    <span className={card.headerTitle}>
                        <FileIcon size={14} className={card.fileIcon} />
                        secret.{SECRET_FORMAT_EXTENSIONS[format]}
                    </span>
                    <span className={card.headerMeta}>
                        <FormatSelect value={format} onChange={setFormat} label={t('formatLabel')} />
                    </span>
                </header>
                <div className={card.body}>
                    <SecretTextarea
                        value={secret}
                        onChange={(next) => {
                            setSecret(next);
                            if (next.length === 0) setFormat(DEFAULT_SECRET_FORMAT);
                        }}
                        onFormatDetected={setFormat}
                        format={format}
                        autoFocus
                        toolbarStart={
                            enableFileAttachments && file === null ? (
                                <button
                                    type="button"
                                    className={`${btn.btn} ${btn.btnGhost}`}
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isSubmitting}
                                >
                                    <FileIcon size={14} />
                                    <ActionLabel command={COMMAND.attachFile}>{t('attachFile')}</ActionLabel>
                                </button>
                            ) : null
                        }
                    />
                    {enableFileAttachments && file ? (
                        <div className={styles.fileInfoCard}>
                            <div className={styles.fileInfo}>
                                {imagePreviewUrl ? (
                                    // biome-ignore lint/performance/noImgElement: blob:-URL клиентского файла, next/image не подходит.
                                    <img
                                        src={imagePreviewUrl}
                                        alt={file.name}
                                        className={styles.fileInfoPreview}
                                        onError={() => setImagePreviewUrl(null)}
                                    />
                                ) : (
                                    <FileIcon size={16} />
                                )}
                                <span className={styles.fileInfoName}>{file.name}</span>
                                <span className={styles.fileInfoMeta}>
                                    {formatBytes(file.size)} · {file.type || 'application/octet-stream'}
                                </span>
                                <button
                                    type="button"
                                    className={`${btn.btn} ${btn.btnGhost} ${btn.btnDanger} ${btn.btnIconSm}`}
                                    onClick={() => chooseFile(null)}
                                    disabled={isSubmitting}
                                    aria-label={t('removeFile')}
                                    title={t('removeFile')}
                                >
                                    <XIcon size={14} />
                                </button>
                            </div>
                            {isImageCandidate({ type: file.type, name: file.name }) ? (
                                <label className={styles.fileInfoPreviewToggle}>
                                    <input
                                        type="checkbox"
                                        checked={previewImage}
                                        onChange={(e) => setPreviewImage(e.target.checked)}
                                        disabled={isSubmitting}
                                    />
                                    <span>{t('previewImageLabel')}</span>
                                </label>
                            ) : null}
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
                    <div className={field.pair}>
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
                        <div className={`${banner.banner} ${banner.danger}`} role="alert">
                            <AlertIcon size={16} className={banner.icon} />
                            <span>{error}</span>
                        </div>
                    ) : null}
                </div>
                <footer className={card.footer}>
                    {secret.length > 0 || file ? (
                        <button
                            type="button"
                            className={`${btn.btn} ${btn.btnGhost}`}
                            onClick={() => {
                                setSecret('');
                                setFormat(DEFAULT_SECRET_FORMAT);
                                setFile(null);
                            }}
                            disabled={isSubmitting}
                        >
                            <ActionLabel command={COMMAND.clearForm}>{t('clear')}</ActionLabel>
                        </button>
                    ) : null}
                    {isSubmitting && uploadProgress ? (
                        <button type="button" className={`${btn.btn} ${btn.btnGhost}`} onClick={cancelSubmit}>
                            <ActionLabel command={COMMAND.cancelUpload}>{t('cancel')}</ActionLabel>
                        </button>
                    ) : null}
                    <button
                        type="submit"
                        className={`${btn.btn} ${btn.btnPrimary} ${styles.submit}`}
                        disabled={isSubmitting || !hasContent}
                    >
                        <ZapIcon size={14} />
                        {isSubmitting ? (
                            uploadProgress ? (
                                t('uploading', {
                                    percent: Math.round((uploadProgress.loaded / uploadProgress.total) * 100),
                                })
                            ) : (
                                t('encrypting')
                            )
                        ) : (
                            <ActionLabel command={COMMAND.createSecret}>{t('submit')}</ActionLabel>
                        )}
                    </button>
                </footer>
            </form>
        </>
    );
}
