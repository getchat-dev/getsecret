declare module '*.mdx' {
    import type { ComponentType } from 'react';

    export const frontmatter: {
        title: string;
        lede: string;
        metaDescription: string;
        eyebrow?: string;
    };

    const MDXComponent: ComponentType;
    export default MDXComponent;
}
