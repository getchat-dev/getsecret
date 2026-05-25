import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WERF_PATH = resolve(__dirname, '../../werf.yaml');
const werf = readFileSync(WERF_PATH, 'utf8');

// Each test guards a security invariant of the build pipeline, regardless of
// which package manager / base image / werf-build-mode we happen to use today.
// The patterns accept both the old single-image bookworm form (`useradd`,
// `chown -R`, `USER: burnotes`) and the current alpine multi-image form
// (`adduser`/`addgroup`, `import: owner: burnotes`, `imageSpec.config.user:
// burnotes`) so a future swap doesn't silently regress hardening.
describe('werf.yaml hardening', () => {
    it('creates a dedicated non-root user during the build', () => {
        // alpine ships BusyBox `adduser`; glibc bases use `useradd`. Either
        // command counts as long as the username is the project's `burnotes`.
        expect(werf).toMatch(/(?:useradd|adduser)[^\n]*\bburnotes\b/);
    });

    it('hands ownership of the runtime artifacts to that user', () => {
        // Two shapes mean the same thing:
        //   - single-image: `chown -R burnotes:burnotes /app` after pnpm build
        //   - multi-image:  `import:` directive carries `owner: burnotes`
        //                   so files land on the runtime image already owned.
        const hasChown = /chown[^\n]*burnotes[^\n]*\/app/.test(werf);
        const hasImportOwner = /owner:\s*burnotes/.test(werf);
        expect(hasChown || hasImportOwner).toBe(true);
    });

    it('declares burnotes as the runtime user in the final image', () => {
        // Legacy `USER: burnotes` (docker stanza), or the current OCI-spec
        // `imageSpec.config.user: burnotes`. Both end up as the container's
        // default user; both keep the production process off root.
        const hasDockerUser = /USER:\s*burnotes/.test(werf);
        const hasImageSpecUser = /\buser:\s*burnotes\b/.test(werf);
        expect(hasDockerUser || hasImageSpecUser).toBe(true);
    });

    it('does not run the final image as root', () => {
        // Catches both `USER: root` (deprecated docker stanza) and
        // `user: root` (imageSpec).
        expect(werf).not.toMatch(/\bUSER:\s*root/);
        expect(werf).not.toMatch(/\buser:\s*root\b/);
    });
});
