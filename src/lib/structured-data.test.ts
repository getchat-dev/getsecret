import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homePageLd, techArticleLd } from '@/lib/structured-data';

const original = process.env.NEXT_PUBLIC_SITE_URL;

function setSiteUrl(value: string | undefined) {
    const env = process.env as Record<string, string | undefined>;
    if (value === undefined) delete env.NEXT_PUBLIC_SITE_URL;
    else env.NEXT_PUBLIC_SITE_URL = value;
}

type Node = Record<string, unknown>;

describe('homePageLd', () => {
    beforeEach(() => setSiteUrl('https://burnotes.app'));
    afterEach(() => setSiteUrl(original));

    const graph = () => homePageLd({ locale: 'ru', name: 'Burnotes', description: 'd' })['@graph'] as Node[];

    it('emits Organization, WebSite and WebApplication in one graph', () => {
        expect(graph().map((node) => node['@type'])).toEqual(['Organization', 'WebSite', 'WebApplication']);
    });

    it('points the app at the locale root without a trailing slash', () => {
        const app = graph().find((node) => node['@type'] === 'WebApplication');
        expect(app?.url).toBe('https://burnotes.app/ru');
    });

    it('resolves every publisher reference to a node that exists in the graph', () => {
        const nodes = graph();
        const ids = new Set(nodes.map((node) => node['@id']));
        const refs = nodes
            .map((node) => node.publisher as { '@id': string } | undefined)
            .filter((ref): ref is { '@id': string } => Boolean(ref));
        expect(refs.length).toBeGreaterThan(0);
        for (const ref of refs) expect(ids.has(ref['@id'])).toBe(true);
    });

    // Invented popularity signals earn manual actions, and on a security product a
    // fabricated trust marker is worse than no marker. Guard the absence.
    it('claims no rating or review', () => {
        const serialized = JSON.stringify(homePageLd({ locale: 'en', name: 'n', description: 'd' }));
        expect(serialized).not.toMatch(/aggregateRating|reviewCount|ratingValue|"review"/);
    });
});

describe('techArticleLd', () => {
    beforeEach(() => setSiteUrl('https://burnotes.app'));
    afterEach(() => setSiteUrl(original));

    it('builds the canonical URL from locale and path', () => {
        const ld = techArticleLd({ locale: 'ru', path: '/threat-model', title: 't', description: 'd' });
        expect(ld.url).toBe('https://burnotes.app/ru/threat-model');
        expect(ld['@id']).toBe('https://burnotes.app/ru/threat-model#article');
    });

    it('ties the article to the site and publisher nodes the home graph defines', () => {
        const ld = techArticleLd({ locale: 'en', path: '/security', title: 't', description: 'd' });
        expect(ld.isPartOf).toEqual({ '@id': 'https://burnotes.app/#website' });
        expect(ld.publisher).toEqual({ '@id': 'https://burnotes.app/#organization' });
    });
});
