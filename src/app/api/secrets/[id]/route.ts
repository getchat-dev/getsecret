import { getClientIp, jsonNoStore } from '@/lib/http';
import { rateLimiter } from '@/lib/rate-limit';
import { secretStore } from '@/lib/secret-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONSUME_LIMIT = 120;
const CONSUME_WINDOW_MS = 60_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const clientIp = getClientIp(request);
  if (rateLimiter.isLimited(`consume:${clientIp}`, CONSUME_LIMIT, CONSUME_WINDOW_MS)) {
    return jsonNoStore({ error: 'Too many requests' }, 429);
  }

  const { id } = await params;

  if (!/^[A-Za-z0-9_-]{40,80}$/.test(id)) {
    return jsonNoStore({ error: 'Invalid secret id' }, 400);
  }

  const secret = secretStore.consume(id);
  if (!secret) {
    return jsonNoStore({ error: 'Secret not found or expired' }, 404);
  }

  return jsonNoStore({ secret }, 200);
}
