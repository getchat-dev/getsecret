// Optional memory observability. Set LOG_MEM_INTERVAL_MS=60000 in the env to
// emit one [mem] line per minute to stdout — handy for spotting heap growth
// without instrumenting every request. Disabled by default and gated to the
// Node runtime (the Edge runtime has no process.memoryUsage()).
export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    const intervalMs = Number(process.env.LOG_MEM_INTERVAL_MS);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;

    const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);
    const timer = setInterval(() => {
        const m = process.memoryUsage();
        console.log(
            `[mem] rss=${mb(m.rss)}m heap=${mb(m.heapUsed)}/${mb(m.heapTotal)}m external=${mb(m.external)}m arrayBuffers=${mb(m.arrayBuffers)}m`,
        );
    }, intervalMs);
    timer.unref();
}
