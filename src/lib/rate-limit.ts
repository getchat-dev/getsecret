type Bucket = {
    hits: number[];
};

class MemoryRateLimiter {
    private readonly buckets = new Map<string, Bucket>();

    isLimited(key: string, limit: number, windowMs: number): boolean {
        const now = Date.now();
        const bucket = this.buckets.get(key) ?? { hits: [] };

        bucket.hits = bucket.hits.filter((timestamp) => now - timestamp < windowMs);
        bucket.hits.push(now);

        this.buckets.set(key, bucket);

        if (bucket.hits.length > limit) {
            return true;
        }

        if (this.buckets.size > 10_000) {
            this.compact(now, windowMs);
        }

        return false;
    }

    private compact(now: number, windowMs: number): void {
        for (const [key, bucket] of this.buckets.entries()) {
            bucket.hits = bucket.hits.filter((timestamp) => now - timestamp < windowMs);
            if (bucket.hits.length === 0) {
                this.buckets.delete(key);
            }
        }
    }
}

declare global {
    // eslint-disable-next-line no-var
    var __memoryRateLimiter: MemoryRateLimiter | undefined;
}

export const rateLimiter = globalThis.__memoryRateLimiter ?? new MemoryRateLimiter();

if (process.env.NODE_ENV !== 'production') {
    globalThis.__memoryRateLimiter = rateLimiter;
}
