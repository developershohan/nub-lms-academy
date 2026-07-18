# Architecture

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Auth.js v5 (beta) · Prisma 7 +
PostgreSQL · Stripe · Socket.IO (standalone process) · Zod · Tailwind v4.

## Two deployables

1. **The Next.js app** - pages, API routes (`src/app/api/v1/*`), Server Actions. Deployed to
   Vercel.
2. **`socket-server/`** - a standalone Node process (Socket.IO), deployed separately (Render).
   Talks to the same Postgres database directly. See `docs/socket-production-deployment.md` for
   why these are split and how they authenticate across the domain boundary.

## Layers

```
src/app/            routes, layouts, route handlers, Server Actions - kept thin
src/components/     presentational + client-interactive UI, grouped by domain
src/server/services/  business logic - the only layer that owns Prisma writes/complex reads
src/lib/            shared, single-responsibility utilities (auth, permissions, validation, http, ...)
src/hooks/          client-side React hooks
src/types/          ambient type augmentation (next-auth.d.ts)
socket-server/       standalone realtime process - deliberately isolated from Next-only code
```

See `docs/refactor/architecture-before.md` for the full route/service/Socket.IO event inventory,
and `docs/refactor/target-architecture.md` for why this pass kept the structure rather than moving
files.

## Roles

STUDENT (default) → TEACHER (admin-approved application) → ADMIN / SUPER_ADMIN (manually
assigned, currently identical permission sets). Users can hold multiple roles simultaneously (a
teacher keeps their STUDENT role). See `docs/security.md`'s authorization section for the full
access matrix and how each role boundary is enforced server-side.

## Authorization model

Defense-in-depth, not a single gate:

1. `src/proxy.ts` - authentication + active-status only (deliberately *not* role-specific - see
   the comment in that file for why role checks were moved out of the middleware).
2. Layout-level role checks (e.g. `admin/layout.tsx`) - first line of defense on initial
   navigation.
3. **Every individual page** additionally calls `requireAdmin()`/`requireTeacher()` itself, because
   Next.js layouts don't re-run their check on client-side navigation between sibling routes - this
   is the layer that actually matters for a role change (e.g. a teacher approval) to take effect
   without requiring the user to log out and back in.
4. Service-layer functions re-verify ownership/permission again (`canManageCourse`,
   `canAccessConversation`, etc.) rather than trusting the caller - this is what actually prevents
   IDOR, since it holds even if a future caller forgets step 3.

## Realtime

Socket.IO, polling transport only (see `docs/security.md`). Rooms: `user:${userId}` (personal),
`admins`, `conversation:${id}`. The Next.js app pushes events cross-process to the socket server
via a shared-secret HTTP bridge (`src/lib/realtime.ts` → `POST /internal/emit`), since server
actions have no direct handle on the socket server's `io` instance (it's a separate process).

## Payments

Stripe Checkout, redirect-based (no client-side Stripe.js). Server-computed pricing only. Two
convergent, idempotent finalization paths (webhook + client-confirmation fallback) - see
`docs/security.md`'s Stripe section for the full detail, including a bug found and fixed this pass
(subscription webhook events were never actually processed).
