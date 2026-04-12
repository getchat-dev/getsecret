import { MAX_SECRET_LENGTH, type PreparedSecretUpload, prepareSecretUpload } from '@/lib/secret-crypto';

type CreateResponse = {
    path: string;
};

type ErrorResponse = {
    error?: string;
};

export async function createSecretLink(secret: string): Promise<string> {
    if (secret.length === 0 || secret.length > MAX_SECRET_LENGTH) {
        throw new Error(`Secret length must be between 1 and ${MAX_SECRET_LENGTH} characters.`);
    }

    let preparedSecret: PreparedSecretUpload;
    try {
        preparedSecret = await prepareSecretUpload(secret);
    } catch {
        throw new Error('Browser encryption is not available');
    }

    let response: Response;
    try {
        response = await fetch('/api/secrets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({
                id: preparedSecret.id,
                encryptedSecret: preparedSecret.encryptedSecret,
                accessToken: preparedSecret.accessToken,
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
    absoluteUrl.hash = preparedSecret.key;
    return absoluteUrl.toString();
}
