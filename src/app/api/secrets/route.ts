import { jsonNoStore, getClientIp } from '@/lib/http';
import { rateLimiter } from '@/lib/rate-limit';
import { secretStore, SECRET_TTL_SECONDS } from '@/lib/secret-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SECRET_LENGTH = 10_000;
const CREATE_LIMIT = 30;
const CREATE_WINDOW_MS = 60_000;

type CreateSecretBody = {
  secret?: unknown;
};

export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  if (rateLimiter.isLimited(`create:${clientIp}`, CREATE_LIMIT, CREATE_WINDOW_MS)) {
    return jsonNoStore({ error: 'Too many requests' }, 429);
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return jsonNoStore({ error: 'Invalid content type' }, 415);
  }

  let body: CreateSecretBody;
  try {
    body = (await request.json()) as CreateSecretBody;
  } catch {
    return jsonNoStore({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body.secret !== 'string') {
    return jsonNoStore({ error: 'Secret must be a string' }, 400);
  }

  const secret = body.secret;
  if (secret.length === 0 || secret.length > MAX_SECRET_LENGTH) {
    return jsonNoStore(
      { error: `Secret length must be between 1 and ${MAX_SECRET_LENGTH} characters` },
      400
    );
  }

  if (secret.includes('\u0000')) {
    return jsonNoStore({ error: 'Secret contains forbidden characters' }, 400);
  }

  const { id, expiresAt } = secretStore.create(secret);

  return jsonNoStore(
    {
      id,
      path: `/s/${id}`,
      expiresAt,
      expiresInSeconds: SECRET_TTL_SECONDS
    },
    201
  );
}
