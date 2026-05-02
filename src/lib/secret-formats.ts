export const SECRET_FORMATS = [
    'plain',
    'json',
    'yaml',
    'toml',
    'markdown',
    'javascript',
    'typescript',
    'php',
    'python',
    'bash',
    'sql',
    'html',
    'css',
    'xml',
    'ini',
] as const;

export type SecretFormat = (typeof SECRET_FORMATS)[number];

export const DEFAULT_SECRET_FORMAT: SecretFormat = 'plain';

const SECRET_FORMAT_SET: ReadonlySet<string> = new Set(SECRET_FORMATS);

export function isSecretFormat(value: unknown): value is SecretFormat {
    return typeof value === 'string' && SECRET_FORMAT_SET.has(value);
}

export const SECRET_FORMAT_LABELS: Record<SecretFormat, string> = {
    plain: 'Plain text',
    json: 'JSON',
    yaml: 'YAML',
    toml: 'TOML',
    markdown: 'Markdown',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    php: 'PHP',
    python: 'Python',
    bash: 'Bash',
    sql: 'SQL',
    html: 'HTML',
    css: 'CSS',
    xml: 'XML',
    ini: 'INI',
};
