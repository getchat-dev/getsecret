# Burnotes

One-time secret sharing app on Node.js + Next.js.

## Features

- No accounts or authentication.
- User can create a link with a secret text.
- Ciphertext and rate-limit state are stored in Valkey (Redis-compatible) with a 24h TTL.
- By default, the secret is destroyed on first read. With `MULTIREAD_ENABLED=true` the sender can pick `1`, `3`, `5`, `10`, or `∞` reads per link.
- Optional passphrase protection (`PASSWORD_PROTECTION_ENABLED=true`): a secret is double-encrypted with the user's passphrase via PBKDF2-SHA256 (600k iterations). The server stores only a hash-of-hash verifier — it never sees the plaintext, the passphrase, or the inner key.
- Secret is deleted automatically after 24 hours.
- Basic hardening: strict input validation, no-store responses, CSP and security headers, sliding-window rate limiting.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VALKEY_URL` | _(required)_ | Connection string for Valkey/Redis. The app refuses to start without it. |
| `MULTIREAD_ENABLED` | `false` | When `true`, exposes the multi-view UI control and lets the API persist `maxViews ∈ {1,3,5,10,null}`. When `false`, the server forces every link to single-read regardless of what the client sent — keep it `false` during a rolling deploy until every instance is on the new code, then flip to `true` (env-only, no rebuild). |
| `PASSWORD_PROTECTION_ENABLED` | `false` | When `true`, exposes the optional passphrase field on create and accepts password-protected payloads at the API. When `false`, the create endpoint rejects any request containing `passwordParams` (400). Same rolling-deploy guardrail as multi-read. |
| `S3_ENDPOINT` | _(required for files)_ | S3-compatible endpoint, e.g. `https://fra1.digitaloceanspaces.com` (DO Spaces) or `http://localhost:9000` (MinIO via `docker-compose.infra.yml`). |
| `S3_REGION` | _(required for files)_ | Region string. AWS/DO use real region names (`fra1`, `us-east-1`); MinIO accepts any value (`us-east-1` is the typical default). |
| `S3_BUCKET` | _(required for files)_ | Bucket name (e.g. `burnotes-files`). The `minio-init` job in `docker-compose.infra.yml` auto-creates this for local dev. |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | _(required for files)_ | Credentials. Local MinIO defaults to `burnotes-dev` / `burnotes-dev-secret-please-change`. |
| `S3_FORCE_PATH_STYLE` | `false` | Set to `true` for MinIO and other path-style servers. AWS and DO Spaces use virtual-hosted style (`false`). |
| `MAX_FILE_SIZE_BYTES` | `26214400` | Maximum allowed file size (in bytes). Default 25 MiB. Enforced on both the presign and the signed PUT (via `Content-Length`). |

## Local run

Burnotes uses **pnpm**. The exact version is pinned via `packageManager` in `package.json` and resolved through Corepack — `corepack enable` (once per machine) gets you the right `pnpm` on `PATH`.

```bash
corepack enable
pnpm install
pnpm hooks:install
pnpm dev
```

Open `http://localhost:3000`.

If `pnpm check` or `pnpm test` later fails with `Cannot find module '@biomejs/cli-…'` (or another platform-specific native binary), run `pnpm setup:bindings` — it re-installs everything with `--force` and re-fetches optional native deps for the current OS/arch. Works on host or inside the Docker container.

## Git hooks

Install repository hooks once per clone:

```bash
pnpm hooks:install
```

This enables the versioned pre-commit hook from `.githooks/`. Before each commit it runs `pnpm check`, which executes `biome check` and blocks the commit if formatting, lint, or assist checks fail.
It also runs `pnpm test`, which executes the Vitest suite and blocks the commit if core behavior regresses.

## Docker dev mode

```bash
docker compose -f docker-compose.dev.yml up
```

Or through the existing helper:

```bash
./start.sh --dev
```

In this mode the source tree is mounted into the container, dependencies are installed into a named Docker volume, and `next dev` runs with file watching enabled. Changes in `src/**`, `public/**`, and config files are picked up automatically without rebuilding the image.

## Docker Compose + Traefik

```bash
BURNOTES_IMAGE=burnotes:latest docker compose up -d
```

Open app: `http://burnotes.localhost`.
Traefik dashboard: `http://localhost:8080`.

## Infrastructure (Valkey + Postgres)

Burnotes stores encrypted secrets and rate-limit state in Valkey
(a Redis-compatible server). A PostgreSQL 17 server runs alongside it for
relational data. Both run in their **own** Compose stack so they are
not affected by `./start.sh --down` or `--purge` — only the app comes and goes.

### Bring the infrastructure up (once per host)

```bash
docker compose -f docker-compose.infra.yml up -d
```

This creates:
- Docker network `burnotes-infra` (shared with the app via `external: true`).
- Named volume `burnotes-infra_valkey-data` with AOF + periodic RDB snapshots.
- Named volume `burnotes-infra_postgres-data` (initialised with `--data-checksums`).

The app reads `VALKEY_URL` from `.env` and connects to `valkey:6379` inside
that network; Postgres is reachable at `postgres:5432` on the same network.
`APP` and `DEV` Compose files both attach to `burnotes-infra`.

### Postgres credentials

The Compose file reads these from `.env` (or the shell) and falls back to
development defaults — override them before you put anything real in the
database:

| Variable | Default |
| --- | --- |
| `POSTGRES_USER` | `burnotes` |
| `POSTGRES_PASSWORD` | `burnotes-dev-secret-please-change` |
| `POSTGRES_DB` | `burnotes` |

The matching connection string for the app is
`DATABASE_URL=postgres://burnotes:burnotes-dev-secret-please-change@postgres:5432/burnotes`.

`POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` are only read by `initdb` on
the **first** start. Changing them later does nothing to an existing cluster —
use `ALTER ROLE` / `CREATE DATABASE`, or wipe the volume and start over.

### Everyday operations

```bash
# Start / restart the app while Valkey stays up:
./start.sh              # prod
./start.sh --dev        # dev (live source mount)
./start.sh --down       # stops only the app — Valkey keeps running
./start.sh --purge      # stops the app and removes its volumes — Valkey keeps running

# Infrastructure controls:
docker compose -f docker-compose.infra.yml ps
docker compose -f docker-compose.infra.yml logs -f valkey
docker compose -f docker-compose.infra.yml exec valkey valkey-cli
docker compose -f docker-compose.infra.yml restart valkey

# Postgres controls:
docker compose -f docker-compose.infra.yml logs -f postgres
docker compose -f docker-compose.infra.yml exec postgres psql -U burnotes -d burnotes
docker compose -f docker-compose.infra.yml restart postgres

# Stop the infrastructure (data stays in the volumes):
docker compose -f docker-compose.infra.yml down

# DANGEROUS: stop and wipe all stored secrets and tables:
docker compose -f docker-compose.infra.yml down -v
```

### Backup

The Valkey data lives in the named volume `burnotes-infra_valkey-data`:

```bash
docker run --rm \
  -v burnotes-infra_valkey-data:/data \
  -v "$PWD":/backup \
  alpine tar czf /backup/valkey-backup.tgz /data
```

Postgres is backed up logically rather than by copying `burnotes-infra_postgres-data`
(a file-level copy of a running cluster is not consistent):

```bash
docker compose -f docker-compose.infra.yml exec -T postgres \
  pg_dump -U burnotes -d burnotes --format=custom > burnotes.dump
```

### Running the app on the host (`pnpm dev`) against Dockerised infrastructure

Uncomment the relevant `ports:` block in `docker-compose.infra.yml` — Valkey
binds `127.0.0.1:6379`, Postgres `127.0.0.1:5432` — and point the app at
`localhost` in `.env`:

```dotenv
VALKEY_URL=redis://localhost:6379/0
DATABASE_URL=postgres://burnotes:burnotes-dev-secret-please-change@localhost:5432/burnotes
```

### Security notes

Valkey is not exposed outside the internal network, so it runs without a
password. If you ever route traffic across an untrusted network, add
`--requirepass` to the `valkey-server` command and update `VALKEY_URL`
accordingly (`redis://:password@valkey:6379/0`).

Postgres is not exposed to the host either, but the image refuses to start
without a password, so it always has one. The default is a development
placeholder — set a real `POSTGRES_PASSWORD` in `.env` before the first start
on any host that matters, since `initdb` only reads it once.

## Umami (self-hosted analytics)

Umami runs from its own Compose files, kept out of `docker-compose.infra.yml`
so the infra stack stays free of any Traefik dependency:

| File | Role |
| --- | --- |
| `docker-compose.umami.yml` | Base. Needs only `burnotes-infra` (for Postgres) and publishes Umami on `127.0.0.1:3001`. Works on any host. |
| `docker-compose.umami.traefik.yml` | Overlay. Adds the external `web` network and the Traefik routers. |

The direction of the split is forced: a Compose override can *add* a network to
a service but cannot remove one, so `web` has to live in the overlay. Putting it
in the base file would break every host that has no Traefik.

> **Do not load the Umami tracker on `/s/[id]`.** Umami collects URL hash values
> by default, and the Burnotes decryption key lives in the URL fragment. A
> tracker on the reveal page would hand the analytics server the key for every
> secret, next to the ciphertext it already stores — the whole threat model,
> gone. `data-exclude-hash="true"` is necessary but is a single attribute
> standing between you and that outcome; also gate the snippet so it never
> renders on the reveal route.

### One-time setup

Umami shares the Postgres server from the infra stack, in its own database owned
by its own role. Create them once per host (the infra stack must be up):

```bash
docker compose -f docker-compose.infra.yml exec postgres \
  psql -U burnotes -d postgres \
  -c "CREATE ROLE umami LOGIN PASSWORD 'choose-a-password';" \
  -c "CREATE DATABASE umami OWNER umami;"
```

`OWNER umami` matters — Prisma migrations run as that role on first boot and
need to create the schema.

Then add to `.env`:

```dotenv
UMAMI_DB_PASSWORD=the-password-you-just-chose
UMAMI_APP_SECRET=<openssl rand -base64 32>
```

`UMAMI_APP_SECRET` signs authentication tokens and must stay stable across
restarts — a changed value logs everyone out. Both are declared with `${VAR:?}`,
so Compose refuses to start rather than falling back to a default.

`UMAMI_HOST` and the `TRAEFIK_*` variables are only read by the Traefik overlay —
leave them unset to run on `localhost` alone. `UMAMI_PORT` overrides the
published port if `3001` is taken.

### Run locally

```bash
docker compose -f docker-compose.umami.yml up -d
```

Open `http://localhost:3001`. No hostname, no Traefik, no `web` network
involved — the port is bound to the loopback interface, so it is reachable from
the host but not from the network.

### Run behind Traefik

```bash
docker compose -f docker-compose.umami.yml \
               -f docker-compose.umami.traefik.yml up -d
```

The overlay is parameterised, because the two Traefik instances this project
meets do not speak the same dialect. Defaults are the production values, so an
unset variable deploys exactly as before:

| Variable | Default (production) | Shared local Traefik |
| --- | --- | --- |
| `TRAEFIK_NETWORK` | `web` | `mppm_b2b_infra_bitrix` |
| `TRAEFIK_ENTRYPOINT_HTTP` | `web` | `http` |
| `TRAEFIK_ENTRYPOINT_HTTPS` | `websecure` | `https` |
| `TRAEFIK_CERT_RESOLVER` | `le` | *(empty — no ACME)* |
| `UMAMI_HOST` | _(required)_ | e.g. `umami.burnotes.local` |

`TRAEFIK_CERT_RESOLVER` uses `${VAR-default}`, not `${VAR:-default}`: setting it
to an empty string is meaningful and is preserved, while leaving it out falls
back to `le`. An empty resolver means Traefik serves its own certificate instead
of requesting one over ACME — which is what the shared local instance does, and
what its own service files pass.

A local hostname needs a matching line in `/etc/hosts` (wildcards do not work
there):

```
127.0.0.1	umami.burnotes.local
```

The base file still publishes `127.0.0.1:3001` in this mode; drop the `ports:`
block if you would rather publish nothing at all.

### Either way

```bash
docker compose -f docker-compose.umami.yml logs -f umami
```

First boot runs the Prisma migration before the server answers, which is why the
healthcheck has a 60s `start_period`. Log in with the default `admin` / `umami`
and change the password immediately.

### Notes

- The image is pinned to `docker.umami.is/umami-software/umami:3.3.1`. In v3 the
  version tags dropped the `postgresql-` prefix — `3.3.1` and
  `postgresql-latest` are the same digest, so do not "fix" it back to the
  floating tag.
- Analytics data lives in the `umami` database inside
  `burnotes-infra_postgres-data`, so bringing the infra stack down with `-v` now
  destroys the analytics history along with the stored secrets.
- `PRIVATE_MODE=true` is set, so Umami makes no outbound calls.

## Build with werf

```bash
werf build --repo <YOUR_REPO> --env production
```

Use the resulting image tag from `werf build` output in `BURNOTES_IMAGE`.

## Notes

- Encrypted payloads live in Valkey; Postgres holds relational data and is empty until a schema is added. Restarting the app container preserves all active links; restarting Valkey preserves them via AOF + RDB.
- App can run as multiple instances since state is external; Valkey itself must remain a single reachable endpoint.

## License

AGPL-3.0-or-later — see [LICENSE](LICENSE).

The network clause is the point: if you run a modified copy of this as a service
that other people use, you have to offer them your modified source. Running it
unmodified for your own team costs you nothing beyond keeping the source link in
the footer intact — that link is how the deployed site meets section 13.
