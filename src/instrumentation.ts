// Optional memory observability. Set LOG_MEM_INTERVAL_MS=60000 in the env to
// emit one [mem] line per minute to stdout — handy for spotting heap growth
// without instrumenting every request. Disabled by default and gated to the
// Node runtime; the Node-specific body lives in instrumentation-node.ts so
// Turbopack's Edge build never statically references process.memoryUsage().
export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    const intervalMs = Number(process.env.LOG_MEM_INTERVAL_MS);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;

    const { startMemoryLogger } = await import('./instrumentation-node');
    startMemoryLogger(intervalMs);
}
