import type { MDXComponents } from 'mdx/types';
import type { ComponentPropsWithoutRef } from 'react';
import { Link } from '@/i18n/navigation';

// Internal app routes (href starting with "/") go through next-intl's <Link> so
// they keep the active locale prefix. Same-page anchors (#…) and external URLs
// stay as plain <a>.
function MdxAnchor({ href = '', ...props }: ComponentPropsWithoutRef<'a'>) {
    if (href.startsWith('/')) {
        return <Link href={href} {...props} />;
    }
    return <a href={href} {...props} />;
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
    return { a: MdxAnchor, ...components };
}
