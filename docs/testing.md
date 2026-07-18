# Testing

## What exists

**Unit tests** (Vitest, `npm run test` / `npm run test:run`): 24 tests across 5 files, covering
pure functions with no I/O:

- `src/lib/socket-token.test.ts` - token round-trip, wrong secret, malformed, tampered payload,
  expiry.
- `src/lib/role-home.test.ts` - role→dashboard ranking, cross-role callback redirect protection.
- `src/lib/slug.test.ts` - slugification, non-alphanumeric stripping, conflict-suffix increment.
- `src/lib/video-embed.test.ts` - YouTube/Vimeo URL → embed URL conversion, malformed-URL fallback.
- `src/lib/validations/auth.test.ts` - registration/login/reset-password schema edge cases.

Run: `npm run test:run`. Config: `vitest.config.ts`.

## A confirmed testability gap (not a style preference)

`calculateDiscount` (pure math, `src/server/services/coupon-service.ts`) was written as a unit
test, then **empirically failed to import** in Vitest - not because the function itself is wrong,
but because the file it lives in also imports `@/lib/permissions` → `@/lib/auth` → `next-auth`,
which in turn imports `next/server` in a way Vitest's plain Node module resolver can't follow
(Next.js's package-export conditions need Next's own bundler). The same applies to
`hasRole`/`hasPermission` in `src/lib/permissions.ts`.

This was verified by trying, not assumed - see the removed `coupon-service.test.ts` in the commit
history of this branch for the exact failure. **Recommended follow-up**: extract pure calculation/
policy logic that has no real I/O dependency (like `calculateDiscount`, `hasRole`, `hasPermission`)
into files with no Next.js/Prisma/NextAuth imports, so they're trivially testable. Not done in this
pass - see `docs/refactor/target-architecture.md` for why a broader extraction wasn't done
alongside the security fixes.

### Why `"server-only"` files can still be partly tested

Files carrying `import "server-only"` (e.g. `src/lib/slug.ts`) import fine under test because
`vitest.config.ts` aliases `server-only` to a no-op stub (`test/stubs/server-only.ts`) - the
production guard in source is untouched; only the test runner's resolution is affected. This does
**not** help files that additionally import `next-auth`/`next/cache`/a live Prisma client chain -
those need the extraction above, not a bigger stub.

## Integration/route/E2E tests: not added this pass

The task's fuller test matrix (service-level integration tests against an isolated DB, route-level
`401`/`403`/`404` assertions, and a Playwright E2E suite covering guest/student/teacher/admin
flows) was **not** implemented in this pass. Reasoning, stated plainly rather than silently
skipped:

- **Integration tests** need either a real isolated test database or a mocking strategy for
  Prisma - given the same `next-auth` import-chain issue above affects nearly every service file,
  a proper integration harness needs its own dedicated setup (test DB provisioning + seeding +
  teardown, or a Prisma mock layer) that's a meaningfully sized piece of infrastructure on its own,
  not a same-pass addition alongside ~20 other security/architecture phases.
- **Playwright E2E** needs a running app + running socket server + a seeded test database, none of
  which exist as a scripted, repeatable local/CI setup yet.

**This is recorded as "documented follow-up - medium risk," not silently dropped.** Recommended
next step: stand up the integration test harness first (highest leverage - it directly exercises
the ~10 authorization call sites flagged in `docs/security.md` as defense-in-depth follow-ups),
then layer route tests and a small Playwright smoke suite on top once that foundation exists.

## Manual QC

Since automated route/E2E coverage doesn't exist yet, `docs/refactor/qc-report.md` records what
was verified through static/code-level review instead (every route's auth/ownership check traced
by direct file inspection, not by clicking through a live instance - this session had no running
dev server + browser available). That document is explicit about the distinction between
"verified by reading the code" and "verified by exercising it live" - don't conflate the two.

## Scripts

```
npm run lint        # ESLint
npm run typecheck    # tsc --noEmit
npm run test          # vitest (watch mode)
npm run test:run     # vitest run (CI mode)
npm run build        # next build
npm run check         # lint && typecheck && test:run && build - the full local gate
```

`.github/workflows/ci.yml` runs the same `check` sequence (plus `prisma generate`/`validate`) on
every PR and push to `master`.
