'use client';

import type { ComponentProps } from 'react';
import { Link, usePathname } from '@/i18n/navigation';

// A header link that knows whether you are already on its page.
//
// `aria-current="page"` carries the state: it is both the CSS hook and what a
// screen reader announces, so the underline and the announcement cannot drift
// apart the way a bespoke `.isActive` class would.
//
// `usePathname` here is next-intl's, not Next's — it returns the path with the
// locale prefix already stripped (`/faq`, never `/en/faq`), which is the same
// shape as the `href` we compare against. The comparison is exact rather than
// a prefix match: every header destination is a single leaf page today, and an
// exact match is the rule that stays correct when one of them grows children.
export function NavLink({ href, ...rest }: ComponentProps<typeof Link>) {
    const pathname = usePathname();
    const isActive = typeof href === 'string' && pathname === href;
    return <Link href={href} aria-current={isActive ? 'page' : undefined} {...rest} />;
}
