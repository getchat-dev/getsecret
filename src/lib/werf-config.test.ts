import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WERF_PATH = resolve(__dirname, '../../werf.yaml');
const werf = readFileSync(WERF_PATH, 'utf8');

describe('werf.yaml hardening', () => {
    it('creates a dedicated non-root user during the build', () => {
        expect(werf).toMatch(/useradd[^\n]*\bburnotes\b/);
    });

    it('chowns the app directory to that user before the final USER switch', () => {
        expect(werf).toMatch(/chown[^\n]*burnotes[^\n]*\/app/);
    });

    it('declares USER: burnotes in the app image docker stanza', () => {
        expect(werf).toMatch(/USER:\s*burnotes/);
    });

    it('does not run the final image as root', () => {
        expect(werf).not.toMatch(/USER:\s*root/);
    });
});
