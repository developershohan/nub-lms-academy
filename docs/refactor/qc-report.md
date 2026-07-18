# QC report

This pass had no running dev server + interactive browser available - everything below is either
(a) an **automated check that actually ran** (lint/typecheck/test/build, all passing - see
`docs/refactor/pr-description.md`'s "Commands run" for exact output), or (b) a **static/code-level
review** (tracing the actual auth/ownership checks in source, cross-referencing every route to its
service-layer calls). Anything in category (b) is marked as such below - it is real verification
work, not a guess, but it is not the same thing as clicking through a live instance, and this
report does not pretend otherwise.

## Public routes

| Route | Verified | How |
|---|---|---|
| Home, course listing, category listing, pricing, certificate verification | Not touched this pass | No change made; build compiles these routes without error (automated) |
| Login, registration, forgot/reset password | Static review + fixed | Traced every check in `src/lib/auth.ts`, `auth-service.ts`, and the route handlers - see `docs/security.md` for what was found and fixed (reset-password email-in-URL, dev-only reset-link logging) |
| Auth error page, 404, unexpected-error page | Added this pass, build-verified | `not-found.tsx`/`error.tsx` didn't exist before; `npm run build` confirms they compile and are wired into the route tree (`○ /_not-found` in the build output) |

## Student / Teacher / Admin routes

**Static review**, not live-clicked: every page under `student/`, `teacher/`, `admin/` was
confirmed (via the two research passes and direct reads in this session) to call the correct guard
(`getCurrentUser()` for authenticated-only, `requireAdmin()`/`requireTeacher()` for role-gated
pages) before rendering. The one gap found (`admin/messages/page.tsx` missing `requireAdmin()`)
is fixed - see `docs/security.md`. Cross-role and cross-user denial for every route/service
function is documented in `docs/security.md`'s authorization table, traced to the actual
ownership-check code, not assumed.

**Logout and re-login as another user in the same tab**: covered by the prior session's Socket.IO
hardening work (`sharedSocketUserId` identity-change detection in `src/hooks/use-socket.ts`) -
re-verified by reading the code this pass, not re-tested live.

## Realtime

Not re-tested live this pass (no running socket server + browser). Re-verified by reading the code
against every item in the task's realtime checklist - see `docs/security.md`'s Socket.IO section
for the full trace (auth token verification, room membership re-checks, rate limiting, disconnect
cleanup, CORS allow-list). This was extensively live-tested in a prior session within this same
conversation (the production Vercel↔Render connectivity fix) - not repeated here since nothing in
this pass touched socket transport/connection behavior.

## Payments

**Not live-tested against Stripe** (would require live/test Stripe keys and a real checkout flow,
not available in this session). Verified statically:

- Server-owned pricing: traced `createCheckoutSession`/`createSubscriptionCheckoutSession` -
  confirmed `price_data` is built entirely from DB-owned `course.price`/`salePrice`/
  `plan.price`, never from a client-supplied amount.
- Coupon validation: traced `validateCoupon` - expiry/scope/redemption-limit checks all query the
  DB directly, not client input.
- Webhook idempotency: confirmed via schema (`Payment.stripeEventId @unique`,
  `Subscription.stripeSubscriptionId @unique` + upsert) and code (`markOrderPaid` short-circuits
  on `status === "PAID"`).
- **The one confirmed, fixed bug**: `handleSubscriptionWebhookEvent` was never called - see
  `docs/security.md`. This was found by reading the webhook route against its imports (an unused
  import that should have been a giveaway), then confirmed by tracing what each handler function
  actually does.
- No browser-only enrollment success path exists: confirmed `confirmCheckoutSession` (the
  client-triggered fallback) re-verifies against Stripe's own API before finalizing anything.

## Responsive / accessibility

**Not tested this pass** - no browser available to check rendering at 360px/768px/1024px/desktop
or to drive keyboard-only navigation through login/dashboards/dialogs/tables/forms. This is an
honest gap, not a silent omission: Phase 10's accessibility checklist (focus states, form-label
association, landmark/heading structure, live regions, reduced-motion, dialog focus management)
was **not** audited in this pass beyond what was already true of the component library in use
(the UI primitives are Base UI / shadcn-derived, which have reasonable accessibility defaults out
of the box, but that's an assumption based on the library's reputation, not a verification of this
app's actual usage of it). **Documented follow-up**, not claimed as done.

## What's genuinely automated and re-run at the end

```
npm run lint        → 0 errors, 2 pre-existing unrelated warnings
npm run typecheck     → 0 errors
npm run test:run      → 24 tests passing, 5 files
npm run build          → 44 routes compiled, 0 errors
npx prisma validate    → schema valid
npm audit --omit=dev   → 5 moderate advisories, both confirmed unreachable (see docs/refactor/baseline-report.md)
```

All five ran clean as the very last step of this pass, after every other change - see
`docs/refactor/pr-description.md` for the exact command log.
