# Socket.IO production deployment (Vercel + Render)

The Next.js app and the standalone Socket.IO server (`socket-server/`) are two separate
deployments on two separate domains. This doc lists the exact production configuration for both.
All secret values below are placeholders - copy the real values from your password manager /
hosting dashboard, never from chat history or old commits.

## Vercel production environment

```dotenv
NEXT_PUBLIC_APP_URL="https://nub-lms-academy.vercel.app"
AUTH_URL="https://nub-lms-academy.vercel.app"
NEXTAUTH_URL="https://nub-lms-academy.vercel.app"

DATABASE_URL="<NEW_ROTATED_NEON_CONNECTION_STRING>"

AUTH_SECRET="<NEW_SHARED_AUTH_SECRET>"
NEXTAUTH_SECRET="<SAME_NEW_SHARED_AUTH_SECRET>"

GITHUB_CLIENT_ID="<GITHUB_CLIENT_ID>"
GITHUB_CLIENT_SECRET="<NEW_ROTATED_GITHUB_CLIENT_SECRET>"

STRIPE_SECRET_KEY="<NEW_ROTATED_STRIPE_SECRET_KEY>"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="<STRIPE_PUBLISHABLE_KEY>"
STRIPE_WEBHOOK_SECRET="<STRIPE_WEBHOOK_SECRET>"

NEXT_PUBLIC_SOCKET_URL="https://nub-lms-academy.onrender.com"
SOCKET_SERVER_URL="https://nub-lms-academy.onrender.com"
SOCKET_INTERNAL_SECRET="<NEW_SHARED_SOCKET_INTERNAL_SECRET>"
```

**`NEXT_PUBLIC_SOCKET_URL` is embedded into the browser bundle at build time**, not read at
request time. Changing it in the Vercel dashboard does nothing until you trigger a new
deployment - a plain "redeploy" (with build cache cleared, see Phase 8 order) is required.

## Render production environment

```dotenv
NODE_ENV="production"
DATABASE_URL="<SAME_NEW_ROTATED_NEON_CONNECTION_STRING>"
AUTH_SECRET="<SAME_NEW_SHARED_AUTH_SECRET>"
SOCKET_CORS_ORIGIN="https://nub-lms-academy.vercel.app"
SOCKET_INTERNAL_SECRET="<SAME_NEW_SHARED_SOCKET_INTERNAL_SECRET>"
```

Do not set `PORT` - Render supplies it, and `socket-server/index.ts` reads `process.env.PORT`
first automatically.

`NEXTAUTH_SECRET`, `NEXT_PUBLIC_SOCKET_URL`, and `SOCKET_SERVER_URL` are not read anywhere in
`socket-server/` (confirmed by inspection) and are not required on Render.

As of this fix, `socket-server/index.ts` fails fast at startup in production if `AUTH_SECRET`,
`DATABASE_URL`, or `SOCKET_CORS_ORIGIN` is missing - the process logs the missing variable
name(s) and exits rather than starting in a half-broken state.

## Render service settings

```text
Service type: Web Service
Repository branch: master
Build command: npm ci
Start command: npm run start:socket
Health check path: /health
```

`npm ci` already triggers `postinstall` → `prisma generate` (defined in `package.json`); no
separate Prisma command is needed in the build step.

## OAuth callback

Confirmed by inspecting `src/app/api/auth/[...nextauth]/route.ts` and `src/lib/auth.ts` (no
custom `basePath` is configured, so NextAuth's default `/api/auth` prefix applies). The GitHub
OAuth App's callback URL must be:

```text
https://nub-lms-academy.vercel.app/api/auth/callback/github
```
