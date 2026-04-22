import { randomBytes } from 'node:crypto';
import { getValkey, RATE_LIMIT_KEY_PREFIX } from '@/lib/valkey-client';

class RateLimiter {
    async isLimited(key: string, limit: number, windowMs: number): Promise<boolean> {
        const client = getValkey();
        const now = Date.now();
        const member = `${now}-${randomBytes(6).toString('hex')}`;
        const rlKey = `${RATE_LIMIT_KEY_PREFIX}${key}`;
        const windowStart = now - windowMs;

        const results = await client
            .multi()
            .zremrangebyscore(rlKey, 0, windowStart)
            .zadd(rlKey, now, member)
            .zcard(rlKey)
            .pexpire(rlKey, windowMs)
            .exec();

        if (!results) {
            return false;
        }

        const zcardResult = results[2];
        if (!zcardResult || zcardResult[0]) {
            return false;
        }
        return Number(zcardResult[1]) > limit;
    }
}

export const rateLimiter = new RateLimiter();
