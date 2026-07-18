# Claude Code Task: Fix Socket.IO 400 Errors on Vercel + Render

## Project context

- Repository: `developershohan/nub-lms-academy`
- Branch: `master`
- Next.js frontend: `https://nub-lms-academy.vercel.app`
- Standalone Socket.IO server: `https://nub-lms-academy.onrender.com`
- Database: Neon PostgreSQL
- Current symptom:
  - Render root URL returns `ok`.
  - The application remains on `connecting...`.
  - Browser Network/Console intermittently shows Socket.IO `400` requests.
  - An older deployment also attempted a WebSocket upgrade even though the current repository specifies polling-only transport.

## Critical security rule

The developer previously exposed real credentials while debugging. Do not copy, print, log, commit, or preserve any existing secret values.

Use placeholders only. Assume the following credentials will be rotated manually:

- `DATABASE_URL`
- `AUTH_SECRET`
- `NEXTAUTH_SECRET`
- `GITHUB_CLIENT_SECRET`
- `STRIPE_SECRET_KEY`
- `SOCKET_INTERNAL_SECRET`
- Any webhook secret that was exposed

Never commit `.env`, `.env.local`, Render secrets, Vercel secrets, database credentials, API keys, socket tokens, session cookies, or authentication headers.

---

# Your objective

Diagnose and fix the production Socket.IO connection reliably without redesigning the application or changing unrelated features.

The final result must provide:

1. Clear client-side Socket.IO errors instead of an endless `connecting...` state.
2. Clear, sanitised Render logs that identify handshake, CORS, authentication, token, user, and database failures.
3. Correct Vercel-to-Render production configuration.
4. A safe committed `.env.example` containing placeholders only.
5. Successful lint and production build.
6. A concise deployment and verification checklist.

Follow `AGENTS.md`. This project uses Next.js 16, so inspect the relevant local documentation under `node_modules/next/dist/docs/` before changing Next.js-specific code.

Work phase by phase. Inspect only the files required for each phase. Do not produce long explanations or repeat full files unnecessarily.

---

# Phase 1 — Inspect before editing

Inspect at minimum:

- `AGENTS.md`
- `CLAUDE.md`
- `package.json`
- `.gitignore`
- `src/hooks/use-socket.ts`
- `src/app/api/v1/socket-token/route.ts`
- `src/lib/socket-token.ts`
- `src/lib/auth.ts`
- `src/lib/prisma.ts`
- `socket-server/index.ts`
- `socket-server/auth.ts`
- `socket-server/chat-store.ts`
- Any component that displays the socket connection state
- Vercel/Render documentation already present in the repository, if any

Determine and report briefly:

- Whether the deployed frontend is likely stale compared with the current polling-only source.
- Every code path that can reject the socket connection.
- Whether the Socket.IO client and server versions match.
- Whether production environment variables are read at build time or runtime.
- Whether the socket server can start successfully while authentication is actually misconfigured.
- Whether `.env.example` exists and can be committed under the current `.gitignore`.

Do not modify code until this inspection is complete.

---

# Phase 2 — Improve the Socket.IO client

Update `src/hooks/use-socket.ts` carefully.

Requirements:

1. Keep one shared Socket.IO connection per browser tab.
2. Keep `transports: ["polling"]` while diagnosing production. Do not re-enable WebSocket upgrade yet.
3. Fetch `/api/v1/socket-token` before every connection or reconnection attempt.
4. Use:
   - `cache: "no-store"`
   - same-origin credentials
5. Check `response.ok`.
6. Validate that the response contains a non-empty string token.
7. Catch network, JSON, authentication, and validation errors.
8. Add a `connect_error` listener.
9. Log only sanitised information:
   - error message
   - error description/context when safe
   - socket URL
   - selected transport
   - never the token, cookies, headers, secret, or full user object
10. Ensure the UI leaves the indefinite `connecting...` state and exposes a useful error state such as:
    - `Not authenticated`
    - `Socket token request failed`
    - `Socket authentication failed`
    - `Socket server unavailable`
11. Prevent duplicate listeners during React rerenders and development Strict Mode.
12. Ensure listeners are removed during cleanup.
13. Avoid an unhandled rejection inside the asynchronous Socket.IO auth callback.
14. In production, do not silently fall back to `http://localhost:3001` when `NEXT_PUBLIC_SOCKET_URL` is missing. Surface a clear configuration error.
15. Preserve existing event APIs and application behaviour.

Also inspect whether the persistent module-level `sharedSocket` can remain authenticated as the wrong user after logout/login in the same tab. Fix this safely if applicable, without opening multiple sockets.

---

# Phase 3 — Improve the token API

Review `src/app/api/v1/socket-token/route.ts`.

Requirements:

1. Keep authentication mandatory.
2. Return structured JSON errors with appropriate status codes.
3. Add `Cache-Control: no-store`.
4. Do not expose internal exceptions or secrets.
5. Add server-side sanitised logging for unexpected failures.
6. Confirm `AUTH_SECRET` is the single shared signing secret used by both Vercel and Render.
7. Preserve the short token lifetime unless there is a proven reason to change it.

Review `src/lib/socket-token.ts` for:

- Signature verification safety
- Expiry validation
- Malformed token handling
- Timing-safe comparison
- No logging of token contents

Do not replace the existing mechanism with cookies, because Vercel and Render use different domains.

---

# Phase 4 — Improve the Render Socket.IO server

Update `socket-server/index.ts` and `socket-server/auth.ts`.

## Startup validation

At startup, validate required production variables:

- `AUTH_SECRET`
- `DATABASE_URL`
- `SOCKET_CORS_ORIGIN`

Treat a missing `SOCKET_INTERNAL_SECRET` according to current feature requirements. It may remain a warning only if chat connections do not require it, but `/internal/emit` must remain protected.

Fail fast with a clear variable-name-only error when a required variable is missing. Never print values.

## Health endpoint

Add a health endpoint such as `/health` that returns safe JSON:

```json
{
  "status": "ok",
  "service": "socket-server"
}
```

It may include uptime/version, but it must not include secrets, environment values, database URLs, tokens, user data, or internal configuration.

Keep `/` compatible with Render health checks if needed.

## Engine.IO diagnostics

Add:

- `io.engine.on("connection_error", ...)`
- Sanitised logs for:
  - error code
  - message
  - request origin
  - request method
  - request path
  - transport
- Never log query tokens, auth payloads, cookies, or full headers.

Use the Engine.IO error code to distinguish:

- `Session ID unknown`
- `Bad request`
- `Forbidden`
- incompatible protocol/version problems

## Socket authentication diagnostics

Refactor authentication logging so Render logs can safely distinguish:

- missing `AUTH_SECRET`
- missing token
- malformed/invalid/expired token
- missing or inactive database user
- database query failure
- successful authentication

Do not tell the browser whether a specific user exists. The client-facing error can remain generic, while Render receives a sanitised internal reason.

Ensure `next()` is called exactly once.

## CORS

Use the exact production frontend origin:

```text
https://nub-lms-academy.vercel.app
```

Support local development:

```text
http://localhost:3000
```

A comma-separated allow-list may be implemented for maintainability, but do not use unrestricted `*` with credentialed requests.

Do not include a trailing slash in origins.

## Render networking

Continue listening on:

- `process.env.PORT`
- host `0.0.0.0`

Do not hard-code Render's port.

Keep the Socket.IO path consistent on client and server. Use the default `/socket.io` unless the existing project intentionally configures another path.

---

# Phase 5 — Create a safe environment template

The repository currently references `.env.example`; create it if missing.

Update `.gitignore` so:

```gitignore
.env*
!.env.example
```

Create `.env.example` with placeholders only. Include separate comments showing which service needs each variable.

Suggested template structure:

```dotenv
# Shared application configuration
APP_NAME="LMS Platform"

# Next.js / Vercel
NEXT_PUBLIC_APP_URL="http://localhost:3000"
AUTH_URL="http://localhost:3000"
NEXTAUTH_URL="http://localhost:3000"

# Shared by Vercel and Render — values must match
AUTH_SECRET="replace-with-a-new-random-secret"
NEXTAUTH_SECRET="replace-with-the-same-auth-secret"
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"
SOCKET_INTERNAL_SECRET="replace-with-a-new-random-secret"

# OAuth — Vercel only
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

# Stripe — Vercel only
STRIPE_SECRET_KEY=""
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
STRIPE_WEBHOOK_SECRET=""

# Socket client / Next.js server — Vercel
NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
SOCKET_SERVER_URL="http://localhost:3001"

# Standalone socket server — Render
SOCKET_PORT="3001"
SOCKET_CORS_ORIGIN="http://localhost:3000"
```

Do not add real values.

---

# Phase 6 — Add deployment documentation

Create `docs/socket-production-deployment.md`.

It must contain these exact production variable assignments using placeholders for secrets.

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

Explain that `NEXT_PUBLIC_SOCKET_URL` is embedded into the browser build, so Vercel must be redeployed after changing it.

## Render production environment

```dotenv
NODE_ENV="production"
DATABASE_URL="<SAME_NEW_ROTATED_NEON_CONNECTION_STRING>"
AUTH_SECRET="<SAME_NEW_SHARED_AUTH_SECRET>"
SOCKET_CORS_ORIGIN="https://nub-lms-academy.vercel.app"
SOCKET_INTERNAL_SECRET="<SAME_NEW_SHARED_SOCKET_INTERNAL_SECRET>"
```

Do not set `PORT`; Render supplies it.

`NEXTAUTH_SECRET`, `NEXT_PUBLIC_SOCKET_URL`, and `SOCKET_SERVER_URL` are not required by the standalone Render socket process unless code inspection proves otherwise.

## Render service settings

Document:

```text
Service type: Web Service
Repository branch: master
Build command: npm ci
Start command: npm run start:socket
Health check path: /health
```

Confirm whether `postinstall` already runs `prisma generate`. Avoid redundant commands unless required.

## OAuth callback

Confirm the GitHub OAuth callback configured in GitHub matches the application's Auth.js route, expected to be similar to:

```text
https://nub-lms-academy.vercel.app/api/auth/callback/github
```

Do not guess blindly—verify the actual route before documenting it.

---

# Phase 7 — Verification

Run locally:

```bash
npm ci
npm run lint
npm run build
```

Run the Next.js app and socket server using the repository scripts.

Verify locally:

1. Authenticated user can obtain `/api/v1/socket-token`.
2. Unauthenticated request receives `401`.
3. Missing `AUTH_SECRET` produces a safe configuration failure.
4. Valid socket token connects.
5. Invalid token produces a generic client error and useful sanitised server log.
6. A tampered token is rejected.
7. An expired token is rejected.
8. Chat events still work.
9. Notification events still work.
10. No duplicate connections/listeners appear after navigation or React Strict Mode remounts.

After deployment, verify:

```bash
curl -i https://nub-lms-academy.onrender.com/health
curl -i "https://nub-lms-academy.onrender.com/socket.io/?EIO=4&transport=polling"
```

The Engine.IO request should return a successful handshake payload, not a generic HTML error.

In an authenticated browser session:

1. Open `/api/v1/socket-token`; expect `200` and a token field.
2. Open DevTools Console and Network.
3. Filter by `socket-token` and `socket.io`.
4. Confirm the token endpoint is `200`.
5. Confirm polling requests remain successful.
6. Confirm the application changes from `connecting...` to connected.
7. Confirm Render logs show an authenticated socket connection.
8. Send a message and verify realtime delivery.
9. Sign out and sign in as a different user in the same tab; confirm the socket identity changes safely.

If a `400` remains, capture and report:

- Response body of the failed Socket.IO request
- Engine.IO error code
- Sanitised Render log line
- Whether it occurred before or after authentication
- Whether Render restarted
- Whether more than one Render instance is running
- Current deployed Git commit on Vercel and Render

Do not reveal tokens or headers while reporting.

---

# Phase 8 — Deployment order

Provide this final deployment order:

1. Rotate all exposed credentials.
2. Add the new shared values to both Vercel and Render.
3. Deploy Render first.
4. Verify `/health`.
5. Push the code changes to `master`.
6. Redeploy Vercel with the build cache cleared.
7. Sign out and sign back in because rotating `AUTH_SECRET` invalidates old sessions.
8. Hard refresh the browser.
9. Test Socket.IO and chat.
10. Review Render logs for any remaining sanitised errors.

---

# Scope restrictions

Do not:

- Redesign pages or components.
- Change the database schema unless absolutely required and justified.
- Replace Socket.IO with another realtime service.
- move the entire app to Render.
- add Redis or multi-instance scaling for this fix.
- enable wildcard CORS.
- commit any secret.
- print secret values in terminal output.
- add a new testing framework solely for this issue unless the repository already has one.
- re-enable WebSocket upgrades until polling works reliably in production.
- claim the issue is fixed without completing tests.

---

# Required final response from Claude

Keep the final response concise and use only these headings:

## Root cause found

## Files created or updated

## Environment variables I must set

## Commands run and results

## Deployment steps for me

## Production verification checklist

## Remaining blocker, if any

Do not output full secret values. Do not repeat entire files; show only concise patches or file names unless explicitly asked.
