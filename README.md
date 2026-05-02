# Burnotes

One-time secret sharing app on Node.js + Next.js.

## Features

- No accounts or authentication.
- User can create a link with a secret text.
- Ciphertext and rate-limit state are stored in Valkey (Redis-compatible) with a 24h TTL.
- By default, the secret is destroyed on first read. With `BURNOTES_MULTIREAD_ENABLED=true` the sender can pick `1`, `3`, `5`, `10`, or `∞` reads per link.
- Secret is deleted automatically after 24 hours.
- Basic hardening: strict input validation, no-store responses, CSP and security headers, sliding-window rate limiting.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VALKEY_URL` | _(required)_ | Connection string for Valkey/Redis. The app refuses to start without it. |
| `BURNOTES_MULTIREAD_ENABLED` | `false` | When `true`, exposes the multi-view UI control and lets the API persist `maxViews ∈ {1,3,5,10,null}`. When `false`, the server forces every link to single-read regardless of what the client sent — keep it `false` during a rolling deploy until every instance is on the new code, then flip to `true` (env-only, no rebuild). |

## Local run

```bash
npm install
npm run hooks:install
npm run dev
```

Open `http://localhost:3000`.

## Git hooks

Install repository hooks once per clone:

```bash
npm run hooks:install
```

This enables the versioned pre-commit hook from `.githooks/`. Before each commit it runs `npm run check`, which executes `biome check` and blocks the commit if formatting, lint, or assist checks fail.
It also runs `npm test`, which executes the Vitest suite and blocks the commit if core behavior regresses.

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

## Infrastructure (Valkey)

Burnotes stores encrypted secrets and rate-limit state in Valkey
(a Redis-compatible server). Valkey runs in its **own** Compose stack so it is
not affected by `./start.sh --down` or `--purge` — only the app comes and goes.

### Bring the infrastructure up (once per host)

```bash
docker compose -f docker-compose.infra.yml up -d
```

This creates:
- Docker network `burnotes-infra` (shared with the app via `external: true`).
- Named volume `burnotes-infra_valkey-data` with AOF + periodic RDB snapshots.

The app reads `VALKEY_URL` from `.env` and connects to `valkey:6379` inside
that network. `APP` and `DEV` Compose files both attach to `burnotes-infra`.

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

# Stop the infrastructure (data stays in the volume):
docker compose -f docker-compose.infra.yml down

# DANGEROUS: stop and wipe all stored secrets:
docker compose -f docker-compose.infra.yml down -v
```

### Backup

The data lives in the named volume `burnotes-infra_valkey-data`:

```bash
docker run --rm \
  -v burnotes-infra_valkey-data:/data \
  -v "$PWD":/backup \
  alpine tar czf /backup/valkey-backup.tgz /data
```

### Running the app on the host (`npm run dev`) against Dockerised Valkey

Uncomment the `ports:` block in `docker-compose.infra.yml` (binds `127.0.0.1:6379`)
and set `VALKEY_URL=redis://localhost:6379/0` in `.env`.

### Security notes

Valkey is not exposed outside the internal network, so it runs without a
password. If you ever route traffic across an untrusted network, add
`--requirepass` to the `valkey-server` command and update `VALKEY_URL`
accordingly (`redis://:password@valkey:6379/0`).

## Build with werf

```bash
werf build --repo <YOUR_REPO> --env production
```

Use the resulting image tag from `werf build` output in `BURNOTES_IMAGE`.

## Notes

- Encrypted payloads live in Valkey. Restarting the app container preserves all active links; restarting Valkey preserves them via AOF + RDB.
- App can run as multiple instances since state is external; Valkey itself must remain a single reachable endpoint.
