# Deployment

Two separate deployments, on two different hosts.

## Next.js app → Vercel

1. Connect the GitHub repo, framework preset: Next.js (auto-detected).
2. Set production environment variables - see `.env.example` for the full list with placeholders,
   and `docs/socket-production-deployment.md` for the exact production values (secrets themselves
   are never written down in any doc - copy from your own credential store).
3. `NEXT_PUBLIC_*` variables are baked into the client bundle **at build time** - changing one in
   the Vercel dashboard does nothing until the next deployment.
4. Deploy.

## Socket.IO server → Render (or any long-running Node host)

**Cannot run on Vercel** - it needs a persistent process (in-memory presence/rate-limit state, a
long-lived `io` instance), which Vercel's serverless functions don't provide.

1. New Web Service, same repo, root directory unchanged.
2. Build command: `npm ci` (or `npm install`). Start command: `npm run start:socket`.
3. Health check path: `/health` → `{"status":"ok","service":"socket-server"}`.
4. Environment variables: `DATABASE_URL`, `AUTH_SECRET` (must be byte-identical to the Vercel
   deployment's value - it's the shared signing secret for socket auth tokens), `SOCKET_CORS_ORIGIN`
   (the Vercel app's exact URL, no trailing slash), `SOCKET_INTERNAL_SECRET` (must match Vercel's
   value), `NODE_ENV=production`. Do **not** set `PORT` - the host supplies it.
5. `socket-server/index.ts` fails fast (logs the missing variable name, exits) if `AUTH_SECRET`,
   `DATABASE_URL`, or `SOCKET_CORS_ORIGIN` is missing in production - a broken deploy will be
   visibly broken in the logs, not silently half-working.

Full context on *why* the socket server needs a separate token-based auth scheme instead of
cookies (the two apps are on different domains), why the transport is polling-only, and a
diagnosed-live incident walkthrough (mismatched `AUTH_SECRET` between the two hosts) is in
`docs/socket-production-deployment.md` - not repeated here.

## Database

Postgres (this app was built against Neon). `npx prisma migrate deploy` for production migrations
(never `migrate dev` against a production database). `npx prisma generate` runs automatically via
the `postinstall` script on both hosts.

## Deployment order for a change touching both apps

1. Deploy the socket server first, confirm `/health`.
2. Deploy the Next.js app.
3. If `AUTH_SECRET`/`SOCKET_INTERNAL_SECRET` were rotated: existing sessions are invalidated -
   users need to sign out/in.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, unit tests, and a production build on every PR
and push to `master`, using placeholder environment values (no real secrets in CI - the build
never needs a live database connection, since every route in this app renders dynamically).
