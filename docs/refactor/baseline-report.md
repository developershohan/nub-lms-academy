# Baseline report

Captured before any hardening/refactor changes on `chore/production-hardening-refactor`.

- Base commit: `4bd0a3f9654fd4cd599863da42100290fe46e1a4` (master, 2026-07-18)
- Node: v25.9.0
- npm: 11.12.1

## Commands and results

| Command | Result |
|---|---|
| `npm ci` | Passed (765 packages). First attempt this session failed with `EPERM` from a locked native binary held by a running local Node process; retried once the lock cleared and it succeeded. No code implication - a local Windows environment quirk, not a repo issue. |
| `npm run lint` | Passed. 0 errors, 2 pre-existing warnings (see below). |
| `npx tsc --noEmit` | Passed. 0 errors. |
| `npm run build` | Passed. 65 routes compiled (Next.js 16.2.9, Turbopack). All API/page routes render as dynamic (`ƒ`) except `/_not-found` (static). |
| `npx prisma validate` | Passed. Schema valid. |
| `npm ls --depth=0` | Clean. A handful of `extraneous` native-binding packages (`@emnapi/*`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`) are optional platform fallbacks pulled in transitively by the Tailwind v4/Lightning CSS toolchain, not a project dependency issue. |
| `npm audit --omit=dev` | 5 moderate advisories, both **not reachable in this app's runtime** (see Dependency audit below). |

### Pre-existing lint warnings (not introduced by this work)

- `src/app/api/v1/webhooks/stripe/route.ts:4` - `handleSubscriptionWebhookEvent` imported but unused.
- `src/app/student/billing/actions.ts:8` - `_prevState` parameter unused (convention for `useActionState`, technically flagged by the rule but intentional).

### Dependency audit detail

Both advisories are transitive and not reachable through this app's actual code paths:

1. **`@hono/node-server` (moderate)** - pulled in only via `@prisma/dev` → `prisma` CLI tooling, used at dev-time by the Prisma CLI itself, never imported by application code. The suggested fix (`npm audit fix --force`) would downgrade `prisma` to `6.19.3`, a breaking major-version change to the ORM this app depends on in production - not acceptable for a moderate, unreachable advisory.
2. **`postcss` (moderate, XSS via unescaped `</style>` in stringified output)** - bundled inside `next`'s own `node_modules` (`next/node_modules/postcss`), used internally by Next.js's build-time CSS pipeline against this repo's own authored CSS, not untrusted user input. The suggested fix would downgrade `next` to `9.3.3` - a ~7 major version downgrade that would break the entire application.

Classification: **Not an issue after verification** (both). Documented rather than "fixed" per the rule against `npm audit fix --force` and framework downgrades.

## Route inventory (counts)

- Page routes: 39
- API route handlers (`src/app/api/v1/**/route.ts` + `src/app/api/auth/[...nextauth]`): 31
- `src/server/services/*`: 19 files
- Prisma models: 39

Full route/service/event maps are in `docs/refactor/architecture-before.md` (Phase 1).

## Known deployment assumptions (from current `.env` / prior session work)

- Next.js app deploys to Vercel; standalone Socket.IO process (`socket-server/`) deploys separately (Render), on a different domain - socket auth uses a short-lived signed token, not cookies, because of this domain split (see `src/lib/socket-token.ts`, `socket-server/auth.ts`).
- `AUTH_SECRET` is the single shared signing secret between the Next.js app and the socket server; it must be identical on both hosts (a mismatch was diagnosed and documented in a prior session - see `docs/socket-production-deployment.md`).
- Stripe webhook processing is optional in dev (`STRIPE_WEBHOOK_SECRET` may be empty) - checkout/refunds still work via the API, auto-enrollment on payment does not without it, with a client-confirmation fallback (`confirmCheckoutSession`) covering that gap.
- `socket-server` fails fast in production if `AUTH_SECRET`, `DATABASE_URL`, or `SOCKET_CORS_ORIGIN` is missing.
- `.env.example` and `docs/socket-production-deployment.md` already exist from a prior hardening pass this session - real secrets were rotated as part of that work per the developer's own account.

## Initial risk list (pre-audit, to be revised through Phases 3-8)

- Broad surface: 31 API routes, 19 services, role-based access across STUDENT/TEACHER/ADMIN/SUPER_ADMIN - IDOR/BOLA risk needs systematic per-route verification (Phase 4/5).
- No automated test suite exists yet (`package.json` has no `test` script) - all current correctness guarantees are typecheck/lint/build plus manual QA (Phase 14 gap).
- No CI workflow exists yet (Phase 15 gap).
- `next.config.ts` is placeholder-only - no security headers/CSP configured yet (Phase 12 gap).
- README is default `create-next-app` boilerplate, not project-specific (Phase 16 gap).
- Two markdown task files (`CLAUDE_SOCKET_IO_RENDER_FIX_TASK.md`, `CLAUDE_REPOSITORY_HARDENING_REFACTOR_PR_QC_TASK.md`) sit at the repo root - not application code, candidates for relocation/removal at the end once their content is fully actioned (not touched during the audit itself).
