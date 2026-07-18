# Performance review

Static/code-level review (no live profiling - no running instance with realistic data volume was
available in this pass). Findings are evidence-based (traced in the actual source), not
speculative; nothing here was "fixed" without a concrete, low-risk change to point to.

## Completed this pass

- **`export const dynamic = "force-dynamic"`** added to 10 user-specific `GET` routes (see
  `docs/security.md`). This is a *correctness* fix framed as performance-adjacent: it prevents a
  future Next.js caching-default change from either leaking data across users or serving stale
  per-user data - the safe default was made explicit rather than implicit.
- **CSP headers** (`next.config.ts`) add a small, fixed per-response overhead (a few header
  bytes) - negligible.

## Findings, not changed this pass (documented follow-up)

### N+1-shaped query pattern

`certificate-service.ts`'s `listCertificateEligibleCourses` loops over a student's completed
enrollments and, per enrollment, does two more awaited queries in sequence
(`prisma.certificate.findUnique`, then conditionally `canGenerateCertificate` which itself queries
quizzes/attempts). For a student with many completed courses this is O(n) round-trips instead of
one batched query. Not changed this pass: the eligibility logic (`canGenerateCertificate`) is a
shared policy function reused elsewhere (`generateCertificate`), and collapsing this into a single
batched query would mean either duplicating that policy's logic inline (drift risk, exactly the
class of bug found and fixed in `docs/security.md`'s `hideMessage` finding) or refactoring
`canGenerateCertificate` itself to accept a batch of course ids - a real change, not a one-line
fix, and this function only runs for the currently-authenticated student's own dashboard (bounded
by one person's course count, not global data), so the practical impact is low.

### No pagination on admin list pages

`listUsersForAdmin`, `listCoursesForAdmin`, `listAllReviewsForAdmin`, `listCertificatesForAdmin`,
`listCouponsForAdmin`, `listAuditLogsForAdmin` (already `limit`-bounded at 100),
`listSupportConversationsForAdmin`, `listRecentMessagesForAdmin` all use unbounded `findMany()`.
For a platform with a large user/course/order base this becomes a real problem (unbounded page
weight + unbounded query cost). Not changed this pass: adding pagination changes the page
component's data-fetching contract (needs page/cursor state, UI controls) for eight separate admin
pages - a real feature addition, not a bug fix, and out of scope for a pass focused on security-
correctness. Recommended as the highest-value follow-up from this review.

### Broad Prisma `include`s on list views

Several admin list functions `include` full related records (e.g. `listCoursesForAdmin` includes
`teacher: { select: { name, email } }` - already using `select` inside the include, which is good
practice) rather than selecting only display-needed fields at the top level. Spot-checked; no
instance was found pulling genuinely unnecessary large fields (e.g. full lesson/video content into
a list view) - this is a minor, not urgent, finding.

### Repeated session/DB lookups per request

`getCurrentUser()` is deliberately *not* memoized/cached within a single request (unlike the
Next.js auth guide's suggested `React.cache()`-wrapped DAL pattern), and it's called once per
page/layout that needs it. For a page that both a layout and the page itself call `getCurrentUser()`
on, that's two DB round-trips for the same data in one request. **Not changed this pass** - wrapping
it in `React.cache()` is a legitimate, low-risk win (React's request-scoped memoization, not a
cross-request cache, so it doesn't introduce any staleness/security risk), but every current call
site was individually verified as intentional defense-in-depth (the whole point of the "layouts
don't re-run on client nav" fix from a prior session was to have *every* page re-verify, not share
a cached layout-level result) - wrapping in `React.cache()` preserves that (memoization is scoped
to one request/render, not across navigations), so this is safe and recommended, just not done in
this already-large pass.

### Client/server component boundaries

Spot-checked `"use client"` usage - `ChatShell`, `NotificationBell`, form components (React Hook
Form-driven), and theme/UI primitives are the client boundary; everything else (pages, layouts,
list views) is server-rendered by default. No unnecessary `"use client"` was found on a
component that could be server-rendered.

### Socket.IO listener lifecycle

Reviewed in the prior session's hardening pass: `useSocket()` uses a module-level shared socket
(one connection per tab, not per component), listeners are added/removed in matched effect
cleanup pairs, and `set-state-in-effect` lint errors (a real source of listener/render bugs) were
found and fixed then. Re-verified this pass: `npm run lint` is clean.

## Not assessed (needs a live environment)

Image optimization, font loading waterfalls, actual bundle size, and real query latency under
production-like data volume all need a running instance with realistic data - out of reach in this
pass's static-review-only environment. Flagged here rather than silently omitted.
