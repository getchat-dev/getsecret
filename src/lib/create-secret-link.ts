import { isValidPassword, MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
import {
    type FileRef,
    MAX_SECRET_LENGTH,
    type PreparedSecretUpload,
    type PreparedSecretUploadWithPassword,
    prepareSecretUpload,
    prepareSecretUploadEnvelope,
    prepareSecretUploadWithPassword,
    prepareSecretUploadWithPasswordEnvelope,
} from '@/lib/secret-crypto';
import { DEFAULT_SECRET_FORMAT, type SecretFormat } from '@/lib/secret-formats';

type CreateResponse = {
    path: string;
};

type ErrorResponse = {
    error?: string;
};

type CreateSecretLinkOptions = {
    expiresInSeconds?: number;
    format?: SecretFormat;
    maxViews?: number | null;
    password?: string;
    fileRef?: FileRef;
    uploadToken?: string;
};

function isPreparedWithPassword(
    prepared: PreparedSecretUpload | PreparedSecretUploadWithPassword,
): prepared is PreparedSecretUploadWithPassword {
    return 'passwordParams' in prepared && 'passwordVerifierHash' in prepared;
}

export async function createSecretLink(secret: string, options: CreateSecretLinkOptions = {}): Promise<string> {
    const { fileRef, uploadToken } = options;
    const hasFile = fileRef !== undefined;
    // A secret needs SOMETHING — either text content or a file attachment.
    // File-only secrets are allowed (empty text), text-only secrets are
    // allowed (no file), but a fully empty payload is rejected here.
    if (!hasFile && secret.length === 0) {
        throw new Error(`Secret length must be between 1 and ${MAX_SECRET_LENGTH} characters.`);
    }
    if (secret.length > MAX_SECRET_LENGTH) {
        throw new Error(`Secret length must be between 1 and ${MAX_SECRET_LENGTH} characters.`);
    }
    // fileRef and uploadToken are produced as a pair by uploadFile(); a caller
    // that sets one without the other is misusing the API.
    if (hasFile !== (uploadToken !== undefined)) {
        throw new Error('fileRef and uploadToken must be provided together');
    }

    const { expiresInSeconds, format = DEFAULT_SECRET_FORMAT, maxViews, password } = options;
    const usePassword = typeof password === 'string' && password.length > 0;
    // The reveal-side gate (LockScreen + Viewer) refuses to open with a
    // password that doesn't pass isValidPassword. If we let a weaker one
    // through here, the recipient simply can't open the link via UI — and a
    // 1-character PBKDF2 input is brute-forcible in milliseconds. So we
    // enforce the same policy at the create boundary.
    if (usePassword && !isValidPassword(password)) {
        throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    let prepared: PreparedSecretUpload | PreparedSecretUploadWithPassword;
    try {
        if (hasFile) {
            // File-attached secrets always use the envelope format so the
            // fileRef rides inside the ciphertext.
            const payload = { text: secret, fileRef };
            prepared = usePassword
                ? await prepareSecretUploadWithPasswordEnvelope(payload, password)
                : await prepareSecretUploadEnvelope(payload);
        } else {
            // Text-only secrets keep the legacy raw plaintext on the wire so
            // old client/server combinations still interoperate during rollout.
            prepared = usePassword
                ? await prepareSecretUploadWithPassword(secret, password)
                : await prepareSecretUpload(secret);
        }
    } catch {
        throw new Error('Browser encryption is not available');
    }

    const passwordFields = isPreparedWithPassword(prepared)
        ? {
              passwordParams: prepared.passwordParams,
              passwordVerifierHash: prepared.passwordVerifierHash,
          }
        : {};

    let response: Response;
    try {
        response = await fetch('/api/secrets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({
                id: prepared.id,
                encryptedSecret: prepared.encryptedSecret,
                accessToken: prepared.accessToken,
                format,
                ...(typeof expiresInSeconds === 'number' ? { expiresInSeconds } : {}),
                ...(maxViews !== undefined ? { maxViews } : {}),
                ...passwordFields,
                ...(uploadToken ? { uploadToken } : {}),
            }),
        });
    } catch {
        throw new Error('Network error while creating secret link');
    }

    const data = (await response.json()) as CreateResponse | ErrorResponse;

    if (!response.ok || !('path' in data)) {
        const message = 'error' in data ? data.error : undefined;
        throw new Error(message ?? 'Failed to create secret link');
    }

    const absoluteUrl = new URL(data.path, window.location.origin);
    absoluteUrl.hash = prepared.key;
    return absoluteUrl.toString();
}
