'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircleIcon } from '@/components/ui/icons';
import styles from './hint.module.css';

// Room kept between the bubble and the viewport edge, and between the bubble
// and the "?" it points at.
const EDGE = 12;
const GAP = 8;
// Lets the pointer travel from the "?" onto the bubble without it closing.
const CLOSE_DELAY_MS = 120;

type Placement = { top: number; left: number; arrow: number; above: boolean };

type Props = {
    // What the hint is about, for the button's accessible name ("About: Expires in").
    label: string;
    children: ReactNode;
};

// A "?" toggletip next to a form control. Hover or keyboard focus shows it;
// a click/tap pins it open until the next outside click or Escape. The bubble
// is portaled to <body> with fixed positioning because the card around the
// form clips its overflow. Hidden entirely while <html data-hints="off">.
export function Hint({ label, children }: Props) {
    const t = useTranslations('hints');
    const bubbleId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);
    const closeTimer = useRef<number | null>(null);
    const [open, setOpen] = useState(false);
    const [pinned, setPinned] = useState(false);
    const [placement, setPlacement] = useState<Placement | null>(null);

    const cancelClose = useCallback(() => {
        if (closeTimer.current !== null) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    }, []);

    const show = useCallback(() => {
        cancelClose();
        setOpen(true);
    }, [cancelClose]);

    const hide = useCallback(() => {
        cancelClose();
        setOpen(false);
        setPinned(false);
    }, [cancelClose]);

    const hideSoon = useCallback(() => {
        if (pinned) return;
        cancelClose();
        closeTimer.current = window.setTimeout(hide, CLOSE_DELAY_MS);
    }, [pinned, cancelClose, hide]);

    useEffect(() => cancelClose, [cancelClose]);

    // Centered under the "?", flipped above when there's no room below, and
    // clamped to the viewport; the arrow keeps pointing at the "?" either way.
    useLayoutEffect(() => {
        if (!open) {
            setPlacement(null);
            return;
        }
        function place() {
            const trigger = triggerRef.current;
            const bubble = bubbleRef.current;
            if (!trigger || !bubble) return;
            const r = trigger.getBoundingClientRect();
            const b = bubble.getBoundingClientRect();
            const center = r.left + r.width / 2;
            const maxLeft = window.innerWidth - EDGE - b.width;
            const left = Math.max(EDGE, Math.min(center - b.width / 2, maxLeft));
            const fitsBelow = r.bottom + GAP + b.height <= window.innerHeight - EDGE;
            const fitsAbove = r.top - GAP - b.height >= EDGE;
            const above = !fitsBelow && fitsAbove;
            setPlacement({
                top: above ? r.top - GAP - b.height : r.bottom + GAP,
                left,
                arrow: center - left,
                above,
            });
        }
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        function onPointerDown(event: PointerEvent) {
            const target = event.target as Node;
            if (triggerRef.current?.contains(target) || bubbleRef.current?.contains(target)) return;
            hide();
        }
        function onKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') hide();
        }
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open, hide]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className={styles.trigger}
                aria-label={t('about', { label })}
                aria-expanded={open}
                aria-describedby={open ? bubbleId : undefined}
                onPointerEnter={(event) => event.pointerType === 'mouse' && show()}
                onPointerLeave={(event) => event.pointerType === 'mouse' && hideSoon()}
                onFocus={show}
                // Leaving by keyboard closes even a pinned bubble; mouse clicks on the
                // bubble itself don't blur the "?" (see onMouseDown below).
                onBlur={hide}
                onClick={() => {
                    if (pinned) {
                        hide();
                    } else {
                        show();
                        setPinned(true);
                    }
                }}
            >
                <HelpCircleIcon size={13} />
            </button>
            {open
                ? createPortal(
                      <div
                          ref={bubbleRef}
                          id={bubbleId}
                          role="tooltip"
                          className={styles.bubble}
                          data-above={placement?.above ? '' : undefined}
                          // First frame renders hidden so it can be measured before it's placed.
                          style={
                              placement
                                  ? {
                                        top: placement.top,
                                        left: placement.left,
                                        ['--hint-arrow' as string]: `${placement.arrow}px`,
                                    }
                                  : { visibility: 'hidden', top: 0, left: 0 }
                          }
                          onMouseDown={(event) => event.preventDefault()}
                          onPointerEnter={(event) => event.pointerType === 'mouse' && cancelClose()}
                          onPointerLeave={(event) => event.pointerType === 'mouse' && hideSoon()}
                      >
                          {children}
                      </div>,
                      document.body,
                  )
                : null}
        </>
    );
}
