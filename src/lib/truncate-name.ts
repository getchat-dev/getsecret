// Fits a name into a width by cutting it and inserting "…", Finder-style.
// Measurement is injected (`fits`), so this stays pure: the component passes
// a canvas measureText check, tests pass a character count.
//
// CSS text-overflow can't do this: it only cuts at the end, and it leaves the
// unused remainder of the box blank, which shows up as a gap between "…" and
// whatever follows it.

export type NameEllipsis = 'middle' | 'end';

export const ELLIPSIS = '…';

// Grapheme clusters when the runtime can segment them (so "é" written as
// e + combining accent, or a flag emoji, is never split), code points
// otherwise. Never UTF-16 units: that would cut surrogate pairs.
function splitGraphemes(value: string): string[] {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return Array.from(segmenter.segment(value), (s) => s.segment);
    }
    return Array.from(value);
}

// The candidate that keeps `keep` graphemes of the original. In 'middle' mode
// the start gets the extra one when `keep` is odd — the start is what people
// read first. Whitespace touching the ellipsis is dropped ("report …" reads
// as a typo).
function build(graphemes: string[], keep: number, mode: NameEllipsis): string {
    if (mode === 'end') return graphemes.slice(0, keep).join('').trimEnd() + ELLIPSIS;
    const headLength = Math.ceil(keep / 2);
    const tailLength = keep - headLength;
    const head = graphemes.slice(0, headLength).join('').trimEnd();
    const tail =
        tailLength > 0
            ? graphemes
                  .slice(graphemes.length - tailLength)
                  .join('')
                  .trimStart()
            : '';
    return head + ELLIPSIS + tail;
}

// Longest candidate that fits, found by binary search on how many graphemes
// to keep (a candidate's width grows with `keep`). Returns the name untouched
// when it already fits, and a bare "…" when not even one grapheme does.
export function truncateName(value: string, fits: (candidate: string) => boolean, mode: NameEllipsis): string {
    if (fits(value)) return value;
    const graphemes = splitGraphemes(value);
    let low = 0;
    let high = graphemes.length - 1;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (fits(build(graphemes, mid, mode))) low = mid;
        else high = mid - 1;
    }
    return build(graphemes, low, mode);
}
