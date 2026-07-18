# Target architecture

## Decision: no mass migration

Phase 1's inventory found an already well-organized codebase: routes stay thin, business logic lives in `src/server/services/*`, authorization policy is centralized in `src/lib/permissions.ts`, Prisma access doesn't leak into client-facing files, and `src/lib/*` has no `helpers.ts`/`utils.ts` dumping ground. The task's own suggested layered structure (`server/repositories/`, `server/policies/`, `lib/auth/`, `lib/security/`, etc.) is guidance, not a mandate - and moving working, correctly-scoped files into new subdirectories for those reasons alone would touch dozens of import paths for zero behavioral or ownership improvement. That fails the task's own bar ("prefer low-risk, evidence-based changes").

**Decision: keep the current top-level structure.** The changes made this pass are targeted, not structural:

1. **New `src/lib/http/json.ts`** - the one genuinely missing shared utility (Phase 5 found 16 route handlers repeating the same unguarded `request.json()` pattern). This is exactly the kind of "standardize only repeated behaviour" the task calls for - one small file, sixteen call sites simplified, no new folder hierarchy needed.
2. **New `src/lib/socket-token.ts` / `src/lib/realtime.ts`** already exist from a prior session's Socket.IO hardening work and already match the target structure's intent (`lib/realtime/`-shaped responsibility) without needing to be moved into a new subfolder.
3. **No `server/policies/` extraction.** `src/lib/permissions.ts` already *is* the policies module - renaming its location would be a pure file move with no behavior change and every call site touched for no reason.
4. **No `server/repositories/` extraction.** Prisma queries are not "scattered unpredictably" (Phase 1 finding) - they live consistently inside the one service file that owns each domain. Introducing a repository layer on top would add a layer of indirection between every service and Prisma with no current pain point it solves (no repeated raw query duplication was found that a repository would eliminate).

## What *did* change structurally

- `src/lib/http/json.ts` - shared JSON body parsing/validation for API routes (Phase 5).
- `test/stubs/server-only.ts` - a Vitest-only stub so files carrying the `"server-only"` guard can still have their pure functions unit-tested without weakening the guard in production code (Phase 14).
- `.github/workflows/ci.yml`, `.github/dependabot.yml` - new, no prior CI existed (Phase 15).
- `vitest.config.ts`, `src/**/*.test.ts` - new test layer (Phase 14).
- `src/app/not-found.tsx`, `src/app/error.tsx` - previously absent (Phase 10).

## Documented follow-up (not done this pass - see `docs/security.md` for full detail)

- Extracting pure calculation logic (e.g. `calculateDiscount` in `coupon-service.ts`) out of files with heavy Next.js/Prisma/NextAuth imports, into a plain `src/lib/payments/` module, would make it independently unit-testable. Confirmed necessary by direct experiment this pass (see `docs/testing.md`) rather than assumed.
- The ~10 duplicated `canAdminAccess → mutate → logAudit → revalidatePath` call sites (Phase 1) are a real pattern but were **not** wrapped in a shared helper this pass - one instance of exactly this kind of duplication (`chat-service.ts`'s `hideMessage`) had silently drifted from the canonical `canAdminAccess` check and dropped a security-relevant guard. Introducing a wrapper now, without tests covering every one of the ~10 call sites first, risks repeating that mistake in the other direction. Recommended order for a future pass: add route/service-level authorization tests for all ten call sites first, *then* extract the wrapper with those tests as a regression guard.
