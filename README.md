# NUB Academy LMS

A role-based learning management platform: course creation and review, enrollment, quizzes,
certificates, payments/subscriptions, and realtime chat/notifications.

## Architecture

Two separate deployables sharing one PostgreSQL database:

1. **Next.js app** (this repo, App Router) - pages, API routes, Server Actions. Deploys to Vercel.
2. **`socket-server/`** - a standalone Socket.IO process for chat/realtime notifications. Deploys
   separately (e.g. Render) because it needs a persistent process, which serverless functions
   don't provide.

Full detail: `docs/architecture.md`. Security posture and what was audited/fixed:
`docs/security.md`. Deployment steps for both apps: `docs/deployment.md`.

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Auth.js v5 (beta) · Prisma 7 +
PostgreSQL · Stripe · Socket.IO · Zod · Tailwind v4.

## Prerequisites

- Node.js 20+
- A PostgreSQL database (developed against [Neon](https://neon.tech))
- (Optional for full functionality) Stripe account, Google/GitHub OAuth apps

## Local setup

```bash
npm install
cp .env.example .env   # fill in real values - see the "Environment variables" section below
npx prisma migrate dev
npx prisma db seed     # optional - creates baseline data, see prisma/seed.ts
npm run dev             # Next.js app on :3000
npm run dev:socket      # in a second terminal - Socket.IO server on :3001
```

## Environment variables

See `.env.example` for the full list with placeholders and inline comments on which service needs
each one. Grouped:

- **Shared** (Next.js app *and* socket server, must match byte-for-byte on both):
  `DATABASE_URL`, `AUTH_SECRET`/`NEXTAUTH_SECRET`, `SOCKET_INTERNAL_SECRET`.
- **Next.js only**: OAuth client IDs/secrets, Stripe keys, `NEXT_PUBLIC_APP_URL`,
  `AUTH_URL`/`NEXTAUTH_URL`.
- **Socket server only**: `SOCKET_PORT` (local dev only - hosts inject their own `PORT`),
  `SOCKET_CORS_ORIGIN`.
- **Both, pointing at the socket server**: `NEXT_PUBLIC_SOCKET_URL`, `SOCKET_SERVER_URL`.

Never commit `.env` - it's gitignored (`.env.example` is the one intentional exception).

## Commands

```bash
npm run dev            # Next.js dev server
npm run dev:socket     # Socket.IO dev server
npm run lint            # ESLint
npm run typecheck       # tsc --noEmit
npm run test             # Vitest (watch mode)
npm run test:run        # Vitest (CI mode)
npm run build            # production build
npm run check             # lint && typecheck && test:run && build
npm run start              # production Next.js server (after build)
npm run start:socket      # production socket server
```

See `docs/testing.md` for what's covered by the automated suite today and what isn't yet.

## Database

```bash
npx prisma migrate dev       # create/apply a migration locally
npx prisma migrate deploy    # apply pending migrations in production - never `migrate dev` against prod
npx prisma studio            # browse data
npx prisma db seed           # run prisma/seed.ts
```

## Deployment

- **Next.js app** → Vercel.
- **Socket.IO server** → Render (or any host that runs a persistent Node process - not Vercel).

Full step-by-step for both, plus the reasoning behind the cross-domain socket-auth design:
`docs/deployment.md` and `docs/socket-production-deployment.md`.

## Roles

STUDENT (default on sign-up) → TEACHER (apply at `/teacher/apply`, admin-approved) → ADMIN /
SUPER_ADMIN (manually assigned). A user can hold multiple roles at once. See `docs/security.md`
for how each role boundary is enforced server-side (not just hidden in the UI).

## Security

`docs/security.md` is the source of truth for what's been audited, what was fixed, and what's a
documented follow-up (including a short list of confirmed-safe-today-but-not-defense-in-depth
findings worth closing next). `docs/security/platform-security.md` covers the CSP/security-headers
policy specifically.

## Troubleshooting

- Realtime connection issues (Vercel ↔ Render) → `docs/socket-production-deployment.md`.
- Test/CI setup → `docs/testing.md`.
- General architecture questions → `docs/architecture.md`.
