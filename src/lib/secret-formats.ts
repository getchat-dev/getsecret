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

export const SECRET_FORMAT_EXTENSIONS: Record<SecretFormat, string> = {
    plain: 'txt',
    json: 'json',
    yaml: 'yaml',
    toml: 'toml',
    markdown: 'md',
    javascript: 'js',
    typescript: 'ts',
    php: 'php',
    python: 'py',
    bash: 'sh',
    sql: 'sql',
    html: 'html',
    css: 'css',
    xml: 'xml',
    ini: 'ini',
};

export const SECRET_FORMAT_PLACEHOLDERS: Record<SecretFormat, string> = {
    plain: '# Paste your secret here\n\nAPI_KEY=sk_live_••••••••••••••••\nDB_PASSWORD=••••••••••\n\nPlain text, JSON, .env — anything works.',
    json: '{\n  "api_key": "sk_live_••••••••••••••••",\n  "webhook_secret": "whsec_••••••••••",\n  "db": {\n    "host": "db.internal",\n    "password": "••••••••••"\n  }\n}',
    yaml: 'api_key: sk_live_••••••••••••••••\nwebhook_secret: whsec_••••••••••\ndb:\n  host: db.internal\n  password: ••••••••••',
    toml: '[api]\nkey = "sk_live_••••••••••••••••"\n\n[db]\nhost = "db.internal"\npassword = "••••••••••"',
    markdown:
        '# Production credentials\n\n- **API key**: `sk_live_••••••••••••••••`\n- **DB password**: `••••••••••`\n\n> Rotate quarterly.',
    javascript: "export const config = {\n  apiKey: 'sk_live_••••••••••••••••',\n  dbPassword: '••••••••••',\n};",
    typescript:
        "export const config: Config = {\n  apiKey: 'sk_live_••••••••••••••••',\n  dbPassword: '••••••••••',\n};",
    php: "<?php\nreturn [\n  'api_key' => 'sk_live_••••••••••••••••',\n  'db_password' => '••••••••••',\n];",
    python: 'API_KEY = "sk_live_••••••••••••••••"\nDB_PASSWORD = "••••••••••"\n\nDB = {\n  "host": "db.internal",\n  "password": DB_PASSWORD,\n}',
    bash: '#!/usr/bin/env bash\nexport API_KEY="sk_live_••••••••••••••••"\nexport DB_PASSWORD="••••••••••"',
    sql: "-- granted to deploy user, rotate quarterly\nCREATE USER 'app'@'%' IDENTIFIED BY '••••••••••';\nGRANT SELECT, INSERT, UPDATE ON prod.* TO 'app'@'%';",
    html: '<form action="/login" method="post">\n  <input name="user" value="admin" />\n  <input name="pass" value="••••••••••" />\n</form>',
    css: ":root {\n  --api-key: 'sk_live_••••••••••••••••';\n  --secret: '••••••••••';\n}",
    xml: '<config>\n  <apiKey>sk_live_••••••••••••••••</apiKey>\n  <dbPassword>••••••••••</dbPassword>\n</config>',
    ini: '[api]\nkey = sk_live_••••••••••••••••\n\n[db]\nhost = db.internal\npassword = ••••••••••',
};
