import type { ComponentType } from 'react';

export type ContentSlug = 'security' | 'threat-model' | 'faq' | 'docs' | 'developers';

export type ContentFrontmatter = {
    title: string;
    // Optional: a page whose own content already introduces it says nothing
    // here rather than restating its table of contents. The FAQ is that case —
    // the questions are visible immediately below the heading.
    lede?: string;
    metaDescription: string;
};

type ContentModule = {
    default: ComponentType;
    frontmatter: ContentFrontmatter;
};

const REGISTRY: Record<ContentSlug, Record<string, () => Promise<ContentModule>>> = {
    security: {
        en: () => import('@/content/security/en.mdx'),
        ru: () => import('@/content/security/ru.mdx'),
    },
    'threat-model': {
        en: () => import('@/content/threat-model/en.mdx'),
        ru: () => import('@/content/threat-model/ru.mdx'),
    },
    faq: {
        en: () => import('@/content/faq/en.mdx'),
        ru: () => import('@/content/faq/ru.mdx'),
    },
    docs: {
        en: () => import('@/content/docs/en.mdx'),
        ru: () => import('@/content/docs/ru.mdx'),
    },
    developers: {
        en: () => import('@/content/developers/en.mdx'),
        ru: () => import('@/content/developers/ru.mdx'),
    },
};

const FALLBACK_LOCALE = 'en';

export async function loadContent(slug: ContentSlug, locale: string): Promise<ContentModule> {
    const variants = REGISTRY[slug];
    const loader = variants[locale] ?? variants[FALLBACK_LOCALE];
    return loader();
}
