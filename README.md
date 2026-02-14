# Burnotes

One-time secret sharing app on Node.js + Next.js.

## Features

- No accounts or authentication.
- User can create a link with a secret text.
- Secret is stored only in memory (`Map`) in Node.js runtime.
- Secret is deleted after first read.
- Secret is deleted automatically after 24 hours.
- Basic hardening: strict input validation, no-store responses, CSP and security headers, simple in-memory rate limiting.

## Local run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Docker Compose + Traefik

```bash
BURNOTES_IMAGE=burnotes:latest docker compose up -d
```

Open app: `http://burnotes.localhost`.
Traefik dashboard: `http://localhost:8080`.

## Build with werf

```bash
werf build --repo <YOUR_REPO> --env production
```

Use the resulting image tag from `werf build` output in `BURNOTES_IMAGE`.

## Notes

- Storage is in-memory only. Restarting container removes all secrets.
- App should run as a single instance, because secrets are not shared across replicas.
