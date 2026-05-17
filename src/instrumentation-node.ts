// Node-only memory observability. Kept separate from instrumentation.ts so
// that Turbopack's Edge-runtime build never statically sees the
// process.memoryUsage() reference (the dynamic import below is the gate).
export function startMemoryLogger(intervalMs: number): void {
    const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);
    const timer = setInterval(() => {
        const m = process.memoryUsage();
        console.log(
            `${new Date().toISOString()} [mem] rss=${mb(m.rss)}m heap=${mb(m.heapUsed)}/${mb(m.heapTotal)}m external=${mb(m.external)}m arrayBuffers=${mb(m.arrayBuffers)}m`,
        );
    }, intervalMs);
    timer.unref();
}
