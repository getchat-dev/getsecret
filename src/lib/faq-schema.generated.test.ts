import { describe, expect, it } from 'vitest';
import { FAQ_ENTRIES } from '@/lib/faq-schema.generated';
import { collectFaq } from '../../scripts/faq-schema.mjs';

// The generated module is committed so `npm test` and `npm run check` work
// without a generate step. That only holds while it matches the MDX, which is
// what this asserts: edit src/content/faq/*.mdx without running `npm run
// gen:faq` and this fails instead of the markup quietly going stale.
describe('faq-schema.generated', () => {
    it('matches what the generator derives from the MDX right now', () => {
        expect(FAQ_ENTRIES).toEqual(collectFaq());
    });

    it('covers every locale with the same set of questions', () => {
        const locales = Object.keys(FAQ_ENTRIES);
        expect(locales.length).toBeGreaterThan(1);
        const counts = locales.map((locale) => FAQ_ENTRIES[locale].length);
        expect(new Set(counts).size).toBe(1);
    });

    it('carries no markdown into the answers', () => {
        for (const entries of Object.values(FAQ_ENTRIES)) {
            for (const entry of entries) {
                expect(entry.answer).not.toMatch(/\[[^\]]+\]\(|`|\*\*/);
                expect(entry.answer).not.toMatch(/\n/);
            }
        }
    });
});
