'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { FormatSelect } from '@/components/secret/format-select';
import { GeneratedLink } from '@/components/secret/generated-link';
import { ImageLightbox } from '@/components/secret/image-lightbox';
// Hidden for now; re-enable by uncommenting this import and the two
// <LifecycleSteps activeStep={activeStep} /> usages below.
// import { LifecycleSteps } from '@/components/secret/lifecycle-steps';
import { MaxViewsControl } from '@/components/secret/max-views-control';
import { PasswordField } from '@/components/secret/password-field';
import { SecretName } from '@/components/secret/secret-name';
import { SecretTextarea } from '@/components/secret/secret-textarea';
import { TtlControl, ttlValueToSeconds } from '@/components/secret/ttl-control';
import { ActionLabel } from '@/components/ui/action-label';
import { Hint } from '@/components/ui/hint';
import { AlertIcon, FileIcon, XIcon, ZapIcon } from '@/components/ui/icons';
import { attachmentSelectionError, remainingFileSlots } from '@/lib/attachment-selection';
import { createSecretLink } from '@/lib/create-secret-link';
import type { TtlUnit } from '@/lib/expiration';
import { decodeImagePreview, isImageCandidate } from '@/lib/image-preview';
import { DEFAULT_MAX_VIEWS } from '@/lib/max-views';
import { markOwnSecret } from '@/lib/own-secrets';
import { isValidPassword, MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import { DEFAULT_SECRET_FILENAME } from '@/lib/secret-filename';
import {
    DEFAULT_SECRET_FORMAT,
    isSecretFormat,
    SECRET_FORMAT_EXTENSIONS,
    type SecretFormat,
} from '@/lib/secret-formats';
import { COMMAND } from '@/lib/ui-commands';
import { type UploadProgress, uploadFiles } from '@/lib/upload';
import banner from '@/styles/primitives/banner.module.css';
import btn from '@/styles/primitives/button.module.css';
import card from '@/styles/primitives/card.module.css';
import field from '@/styles/primitives/field.module.css';
import styles from './create-form.module.css';

const DRAFT_STORAGE_KEY = 'burnotes:create:draft';
const FORMAT_STORAGE_KEY = 'burnotes:create:format';

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Clipboard items are a fallback for browsers that omit the files list.
function filesFromClipboard(data: DataTransfer | null): File[] {
    if (!data) return [];
    if (data.files.length > 0) return Array.from(data.files);
    return Array.from(data.items).flatMap((item) => {
        const file = item.kind === 'file' ? item.getAsFile() : null;
        return file ? [file] : [];
    });
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
    defaultFilename?: string;
    maxFileSizeBytes?: number;
};

export function CreateForm({
    enableMultiRead = false,
    enablePassword = false,
    enableFileAttachments = true,
    defaultFilename = DEFAULT_SECRET_FILENAME,
    maxFileSizeBytes = 25 * 1024 * 1024,
}: Props) {
    const t = useTranslations('create');
    const tErrors = useTranslations('errors');
    const tHints = useTranslations('hints');
    const tImages = useTranslations('revealed');

    const [secret, setSecret] = useState('');
    const [link, setLink] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [ttlValue, setTtlValue] = useState('1');
    const [ttlUnit, setTtlUnit] = useState<TtlUnit>('days');
    const [format, setFormat] = useState<SecretFormat>(DEFAULT_SECRET_FORMAT);
    const [name, setName] = useState(defaultFilename);
    const [maxViews, setMaxViews] = useState<number | null>(DEFAULT_MAX_VIEWS);
    const [password, setPassword] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const previewFiles = useMemo(
        () => files.map((file) => ({ blob: file, filename: file.name, mime: file.type })),
        [files],
    );
    const filesRef = useRef<File[]>([]);
    const imageMode = files.length > 0 && isImageCandidate(files[0]);
    const maxFiles = remainingFileSlots(files);
    const [restrictDownload, setRestrictDownload] = useState(false);
    const [imagePreviewUrls, setImagePreviewUrls] = useState<Map<File, string>>(new Map());
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
    const hasContent = secret.trim().length > 0 || files.length > 0;

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
        let cancelled = false;
        setImagePreviewUrls(new Map());
        const handles = files.map((file) => {
            const handle = decodeImagePreview(file, file);
            handle?.promise.then((url) => {
                if (!cancelled && url) setImagePreviewUrls((urls) => new Map(urls).set(file, url));
            });
            return handle;
        });
        return () => {
            cancelled = true;
            for (const handle of handles) handle?.abort();
        };
    }, [files]);

    function replaceFiles(next: File[]) {
        setLightboxIndex(null);
        filesRef.current = next;
        setFiles(next);
        if (!next.length) setRestrictDownload(false);
    }

    function chooseFiles(incoming: File[]) {
        if (isSubmitting || link || !incoming.length) return;
        const current = filesRef.current;
        const error = attachmentSelectionError(current, incoming, maxFileSizeBytes);
        if (error) {
            setError(tErrors(error, { max: formatBytes(maxFileSizeBytes), count: remainingFileSlots(current) }));
            return;
        }
        setError('');
        replaceFiles([...current, ...incoming]);
    }

    // Drop-target is window-wide: a user can drag a file onto any part of the
    // page (header, empty margins, the form itself) and it will attach. The
    // form just visually highlights via the `is-dragging` class so the user
    // knows where the file is going to land. A counter ([dragDepth]) is
    // required because the browser fires `dragleave` every time the cursor
    // crosses a child element; a plain boolean would flicker.
    const dragDepth = useRef(0);
    // Effect captures a stale chooseFiles closure otherwise; chooseFiles is
    // re-created each render. The ref always points at the latest version.
    const chooseFilesRef = useRef(chooseFiles);
    useEffect(() => {
        chooseFilesRef.current = chooseFiles;
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
            const dropped = Array.from(event.dataTransfer?.files ?? []);
            chooseFilesRef.current(dropped);
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
            const picked = filesFromClipboard(event.clipboardData);
            chooseFilesRef.current(picked.map(ensurePastedFilename));
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
            if (files.length) {
                setUploadProgress({ loaded: 0, total: files.reduce((total, file) => total + file.size, 0) });
                uploadResult = await uploadFiles(files, {
                    signal: abortRef.current.signal,
                    onProgress: (p) => setUploadProgress(p),
                });
            }

            // Only forward previewImage when there's actually an image to
            // preview AND the user kept the checkbox checked. createSecretLink
            // (and encodePlaintext below it) also strip the flag if there's
            // no fileRef, but filtering here keeps the wire shape predictable.
            const fileIsImage = imageMode;
            const next = await createSecretLink(secret, {
                expiresInSeconds,
                format,
                maxViews: effectiveMaxViews,
                ...(effectivePassword.length > 0 ? { password: effectivePassword } : {}),
                ...(uploadResult ? { fileRef: uploadResult.fileRef, uploadToken: uploadResult.uploadToken } : {}),
                ...(uploadResult && fileIsImage && (previewImage || restrictDownload) ? { previewImage: true } : {}),
                ...(uploadResult && fileIsImage && restrictDownload ? { restrictDownload: true } : {}),
                // Always sent, even when unchanged: the operator's default can
                // change between create and read, and the recipient should
                // get the name the sender saw.
                name,
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
        setName(defaultFilename);
        setLink('');
        setPassword('');
        replaceFiles([]);
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
                    <SecretName
                        value={name}
                        extension={SECRET_FORMAT_EXTENSIONS[format]}
                        onChange={setName}
                        fallback={defaultFilename}
                        disabled={isSubmitting}
                        hint={<Hint label={t('fileNameLabel')}>{tHints('fileName')}</Hint>}
                    />
                    <span className={card.headerMeta}>
                        <FormatSelect value={format} onChange={setFormat} label={t('formatLabel')} />
                        <Hint label={t('formatLabel')}>{tHints('format')}</Hint>
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
                            enableFileAttachments && (files.length === 0 || imageMode) ? (
                                <>
                                    <button
                                        type="button"
                                        className={`${btn.btn} ${btn.btnGhost}`}
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isSubmitting || maxFiles === 0}
                                    >
                                        <FileIcon size={14} />
                                        <ActionLabel command={imageMode ? COMMAND.addImage : COMMAND.attachFile}>
                                            {t(imageMode ? 'addImage' : 'attachFile')}
                                        </ActionLabel>
                                    </button>
                                    <Hint label={t('attachFile')}>{tHints('attachFile')}</Hint>
                                </>
                            ) : null
                        }
                    />
                    {enableFileAttachments && files.length > 0 ? (
                        <div className={styles.fileInfoCard}>
                            {files.map((file, index) => (
                                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no local state; previews are keyed by File identity.
                                <div className={styles.fileInfo} key={index}>
                                    {imagePreviewUrls.get(file) ? (
                                        <button
                                            type="button"
                                            className={styles.filePreviewButton}
                                            aria-label={tImages('openImage', { filename: file.name })}
                                            aria-haspopup="dialog"
                                            onClick={() => setLightboxIndex(index)}
                                        >
                                            {/* biome-ignore lint/performance/noImgElement: local file preview. */}
                                            <img
                                                src={imagePreviewUrls.get(file)}
                                                alt={file.name}
                                                className={styles.fileInfoPreview}
                                                onError={() =>
                                                    setImagePreviewUrls((urls) => {
                                                        const next = new Map(urls);
                                                        next.delete(file);
                                                        return next;
                                                    })
                                                }
                                            />
                                        </button>
                                    ) : (
                                        <FileIcon size={16} />
                                    )}
                                    <div className={styles.fileInfoDetails}>
                                        <span className={styles.fileInfoName} title={file.name}>
                                            {file.name}
                                        </span>
                                        <span className={styles.fileInfoMeta}>
                                            {formatBytes(file.size)} · {file.type || 'application/octet-stream'}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className={`${btn.btn} ${btn.btnGhost} ${btn.btnDanger} ${btn.btnIconSm}`}
                                        onClick={() => replaceFiles(files.filter((_, position) => position !== index))}
                                        disabled={isSubmitting}
                                        aria-label={`${t('removeFile')}: ${file.name}`}
                                        title={t('removeFile')}
                                    >
                                        <XIcon size={14} />
                                    </button>
                                </div>
                            ))}
                            {imageMode ? (
                                <>
                                    <span className={styles.fileInfoMeta}>
                                        {t('imageSlots', { count: files.length, remaining: maxFiles })}
                                    </span>
                                    <label className={styles.fileInfoPreviewToggle}>
                                        <input
                                            type="checkbox"
                                            checked={previewImage || restrictDownload}
                                            onChange={(e) => setPreviewImage(e.target.checked)}
                                            disabled={isSubmitting || restrictDownload}
                                        />
                                        <span>{t('previewImageLabel')}</span>
                                    </label>
                                    <label className={styles.fileInfoPreviewToggle}>
                                        <input
                                            type="checkbox"
                                            checked={restrictDownload}
                                            aria-describedby="restrict-download-hint"
                                            onChange={(e) => setRestrictDownload(e.target.checked)}
                                            disabled={isSubmitting}
                                        />
                                        <span>{t('restrictDownload')}</span>
                                    </label>
                                    <p id="restrict-download-hint" className={styles.fileInfoMeta}>
                                        {t('restrictDownloadHint')}
                                    </p>
                                </>
                            ) : null}
                        </div>
                    ) : null}
                    {lightboxIndex !== null ? (
                        <ImageLightbox
                            files={previewFiles}
                            initialIndex={lightboxIndex}
                            restricted={restrictDownload}
                            onClose={() => setLightboxIndex(null)}
                        />
                    ) : null}
                    {enableFileAttachments ? (
                        <input
                            ref={fileInputRef}
                            type="file"
                            hidden
                            multiple={imageMode && maxFiles > 1}
                            accept={imageMode ? 'image/*,.heic,.heif' : undefined}
                            disabled={isSubmitting || maxFiles === 0}
                            onChange={(e) => {
                                chooseFiles(Array.from(e.target.files ?? []));
                                e.target.value = '';
                            }}
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
                    {secret.length > 0 || files.length > 0 ? (
                        <button
                            type="button"
                            className={`${btn.btn} ${btn.btnGhost}`}
                            onClick={() => {
                                setSecret('');
                                setFormat(DEFAULT_SECRET_FORMAT);
                                setName(defaultFilename);
                                replaceFiles([]);
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
