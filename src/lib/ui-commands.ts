// The English interface speaks in identifiers: every action the product owns is
// written as a snake_case command. That is brand language rather than copy, so
// the tokens live here as constants instead of in the i18n bundles, where they
// would be offered to translators as strings to translate.
//
// Progress states (encrypting…, downloading…) are deliberately absent: they are
// status, not commands. A monospace `uploading… 42%` sitting where
// `create_secret` was would read as a second command rather than as feedback.
export const COMMAND = {
    createSecret: 'create_secret',
    attachFile: 'attach_file',
    clearForm: 'clear_form',
    // Only rendered while an upload is in flight, so it can say what it cancels.
    cancelUpload: 'cancel_upload',
    revealSecret: 'reveal_secret',
    copyLink: 'copy_link',
    linkCopied: 'link_copied',
    shareLink: 'share_link',
    showQr: 'show_qr',
    burnSecret: 'burn_secret',
    // One token for three phrases — "Share another", "Send a new secret" and
    // "Share something back" are the same action seen from three screens.
    newSecret: 'new_secret',
    downloadFile: 'download_file',
    downloadSvg: 'download_svg',
    downloadPng: 'download_png',
} as const;

// The tokens are English words. Inside a Russian or Chinese interface a Latin
// identifier stops reading as the product's own verb and starts reading as
// untranslated English, so only the English UI gets them — every other locale
// keeps its translated label. Add a locale here to extend the style to it.
const COMMAND_LOCALES: ReadonlySet<string> = new Set(['en']);

export function usesCommandTokens(locale: string): boolean {
    return COMMAND_LOCALES.has(locale);
}
