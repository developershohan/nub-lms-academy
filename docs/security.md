# Security

This document consolidates the security posture of the application: what was audited, what was
fixed, and what's a documented follow-up. See `docs/refactor/architecture-before.md` for the full
inventory this was derived from.

## Authentication (Auth.js v5)

- **Credentials login**: Zod-validated before any DB query; email/password mismatch and
  nonexistent-account both return the same generic error (no enumeration); `bcrypt.compare` used
  correctly; only `status === "ACTIVE"` users can authenticate; password hashes are never
  returned in any session/API/client payload (confirmed by grep - `passwordHash` only appears in
  `auth-service.ts` and `auth.ts`'s `authorize()`).
- **OAuth (Google/GitHub)**: new OAuth sign-ups get the same default `STUDENT` role as credential
  registrations (`assignDefaultRole`, triggered from the Auth.js `createUser` event - not from
  matching an email, so there's no unverified-input privilege inheritance). Inactive/banned users
  are rejected in the `signIn` callback via a fresh DB lookup, not a JWT claim.
- **Sessions**: JWT strategy, explicit. `getCurrentUser()` (`src/lib/permissions.ts`) always
  re-reads role/status from the DB rather than trusting the JWT - this is deliberate and
  documented in that function's own comment, because Next.js layouts don't re-run their auth
  check on client-side navigation between sibling routes (confirmed against the local Next.js 16
  docs during a prior session). Every admin/teacher page calls `requireAdmin()`/`requireTeacher()`
  itself rather than relying solely on the parent layout - this pass found and closed the one
  remaining gap (`admin/messages/page.tsx` was checking authentication only, not the admin role -
  see "Fixed this pass" below).
- **Session revocation on role/status change**: takes effect on the *next request* (DB is always
  re-read at the page/route level), not instantly for an already-open tab - no push-based session
  invalidation exists. This is an accepted, documented tradeoff (see the socket-server work from a
  prior session, which *does* push live notifications on role changes as a partial mitigation for
  the highest-visibility case, teacher approval).

## Password reset

- Generic response regardless of whether the email exists (no enumeration).
- Reset tokens: `crypto.randomBytes(32)` (256 bits) - cryptographically secure, effectively
  unguessable.
- 30-minute expiry, single-use (deleted from `VerificationToken` on successful reset).
- **Fixed this pass**: `email` was read from the URL query string on `POST
  /api/v1/auth/reset-password` (a state-changing request), with no format validation. Moved into
  the validated JSON body (`resetPasswordSchema` now includes `email`), matching how the actual
  UI's Server Action already worked. PII no longer rides in a URL that lingers in server/proxy
  access logs and browser history.
- **Not fixed (documented follow-up)**: tokens are stored in plaintext in `VerificationToken`, not
  hashed. Given the table only holds short-lived (30 min), single-use, high-entropy tokens and
  isn't otherwise sensitive, the risk is low, but hashing at rest would be a stronger posture -
  left as a follow-up since it changes the lookup query shape and wasn't validated against a live
  DB in this pass.
- **Not implemented (blocked by missing external configuration, not this pass)**: no email
  provider is wired up - reset links are logged to the server console instead. This is a
  pre-existing, explicitly-commented limitation (`// No email provider configured yet`), not
  something this pass can safely invent a decision for.
- **Fixed this pass**: that console log ran unconditionally, including in production - meaning a
  live, unexpired password-reset token would land in production server logs. Gated to development
  only (`NODE_ENV !== "production"`); this removes no working production capability, since
  password reset was already non-functional for real users there without an email provider.
- **Documented follow-up**: no rate limiting on `forgot-password`/`register`/`reset-password`
  (see "Rate limiting" below).

## Authorization / IDOR

### Fixed this pass (confirmed live, not theoretical)

| Finding | Where | Fix |
|---|---|---|
| **Broken access control**: any authenticated user (not just admins) could list every coupon | `GET /api/v1/admin/coupons` checked authentication only | Added `canAdminAccess` check before calling `listCouponsForAdmin()` |
| **Missing role gate**: any authenticated user could reach the admin support-messages page | `admin/messages/page.tsx` called `getCurrentUser()` (auth only), not `requireAdmin()` | Now calls `requireAdmin()`, matching every other admin page |
| **Authorization bypass**: a plain STUDENT session could create `Course` rows via the Server Action directly (Server Actions are reachable independent of page rendering) | `createCourseAction` checked authentication only, not the `TEACHER` role | Now calls `getCurrentUser()` + `hasRole(user.roles, "TEACHER")` |
| **Stale-check drift → privilege bypass**: a banned/inactive admin account could still hide/moderate chat messages, because the check was hand-rolled instead of reusing the shared helper and silently omitted the `status === "ACTIVE"` requirement | `chat-service.ts`'s `hideMessage` | Replaced the inline reimplementation with `canAdminAccess(actorId)` |
| **Logic bug enabling privilege restoration**: a student could silently *undo* an admin's certificate revocation just by re-clicking "generate certificate" | `certificate-service.ts`'s `generateCertificate` | A revoked certificate is now a terminal state - re-generation returns an error instead of resurrecting it |
| **Answer-key exposure, no defense-in-depth**: the function backing the quiz editor returns each option's `isCorrect` flag with zero internal ownership check (safe today only because its one caller already gates ownership) | `quiz-service.ts`'s `listQuizzesForEdit` | Now takes `userId` and calls `canManageCourse` itself |

### Confirmed safe, documented as follow-up (defense-in-depth gap, not a live exploit)

A recurring pattern: several `list*ForAdmin()`-style read functions (`listUsersForAdmin`,
`listCoursesForAdmin`, `listAllReviewsForAdmin`, `listCertificatesForAdmin`,
`listAuditLogsForAdmin`, `listSupportConversationsForAdmin`, `listRecentMessagesForAdmin`) take no
`actorId` and perform no internal check - every current caller was individually verified to be a
page already gated by `requireAdmin()`, so none of these are currently reachable without the
correct role. But they have zero defense-in-depth: a single future caller that forgets the
page-level guard (exactly the class of bug found and fixed in `admin/coupons` and
`admin/messages` above) would silently reintroduce a full-table data leak. **Recommended follow-up**:
add an `actorId` parameter + internal `canAdminAccess` check to each, mirroring the fix already
applied to `listQuizzesForEdit`. Not done in this pass because it touches ~10 functions and their
call sites at once - a broader diff than the confirmed-exploitable fixes above, better done as its
own reviewed change with the new permission tests (`docs/testing.md`) as a safety net.

Similarly, `listTeacherCourses(teacherId)`, `listStudentsForTeacher(teacherId)`, and
`listTeachersForStudent(userId)` filter Prisma queries by a caller-suppliable foreign id with no
internal ownership check. Verified: both current call sites pass the caller's own session id.
**Documented follow-up**, same reasoning as above.

### Rate limiting (documented follow-up - infra decision needed)

No rate-limiting library exists anywhere in the repository. The most abusable endpoints, in
priority order:

1. `POST /api/v1/auth/forgot-password` - unlimited `VerificationToken` creation per email.
2. `POST /api/v1/auth/register` - unlimited account creation; combined with the intentional
   "email already registered" 409 response, this is an email-enumeration oracle without a
   rate limit backstopping it.
3. `POST /api/v1/coupons/validate` - differentiated error messages ("not found" vs "expired" vs
   "already used") make this a coupon-code brute-force oracle.
4. `POST/PATCH /api/v1/quizzes/[quizId]/attempts` - unbounded when a quiz's `maxAttempts` is null.

**Not implemented this pass** - this needs a product/infra decision (in-memory limiter only works
for a single instance; a real deployment needs a shared store like Upstash Redis or Vercel KV),
which the task's own rules classify as "blocked by missing product decision" rather than something
to guess at silently.

## API/server-action hardening (Phase 5, applied broadly)

- **Fixed**: 16 route handlers called `request.json()` with no try/catch, so a malformed body threw
  an uncaught exception instead of a clean `400`. Consolidated into `src/lib/http/json.ts`'s
  `parseJsonBody()`, applied to all 16.
- **Fixed**: unbounded array sizes on `PATCH /api/v1/quizzes/[quizId]/attempts` (`answers`,
  `selectedOptionIds`) and coupon code length on `coupons/validate` / `orders/create-checkout` -
  added `.max()` bounds.
- **Fixed**: 10 user-specific `GET` routes now explicitly export `dynamic = "force-dynamic"` as
  defense-in-depth against any future Next.js caching-default change silently making one user's
  data visible to another (notifications, chat conversations/messages/participants, quizzes,
  quiz attempts, certificate download, orders, subscriptions, socket-token).
- **Not fixed (cosmetic, documented follow-up)**: several routes return `403` for "not
  authenticated" instead of `401` (found: `courses/[courseId]` PATCH, `courses/[courseId]/approve`,
  `courses/[courseId]/submit-review`; the `reject` sibling was corrected to `401` this pass while
  already touching that file). Not exploitable - all error messages are hand-authored strings,
  never raw Prisma/stack output - just reduces client-side error-handling reliability. Left as
  follow-up rather than touched broadly, to keep this pass's diff focused on confirmed security
  issues rather than a sweep with no functional effect.
- **Verified, no change needed**: no route in the audited set returns raw Prisma errors, stack
  traces, or SQL details to the client anywhere in the codebase.

## Stripe / financial integrity

- **Fixed this pass**: `handleSubscriptionWebhookEvent` was imported into the webhook route but
  **never called** - `customer.subscription.created/updated/deleted` events were signature-verified
  and acknowledged to Stripe, but silently never applied to the `Subscription` table. Subscription
  renewals, cancellations, and payment failures from Stripe's side were never reflected in the
  app. The function's own doc comment already said "call from the webhook route only, alongside
  order-service's handler" - this was clearly the intended behavior, just never wired up. Both
  handlers are now dispatched on every webhook event (safe - each ignores event types it doesn't
  own).
- **Verified correct, no change needed**:
  - Webhook signature verified against the raw body (`stripe.webhooks.constructEvent`) before any
    processing; missing `STRIPE_WEBHOOK_SECRET` fails closed (`400`, not silently accepted).
  - Idempotency: `Payment.stripeEventId` is `@unique`; `markOrderPaid` short-circuits if
    `order.status === "PAID"` already. `Subscription.stripeSubscriptionId` is `@unique` and the
    handler `upsert`s by that key - repeated webhook delivery is a no-op re-write, not a
    duplicate.
  - All prices/totals/discounts are computed server-side from DB-owned data
    (`course.salePrice`/`price`, `coupon.discountValue`) - never trusted from the client or from a
    Stripe redirect. `createCheckoutSession`/`createSubscriptionCheckoutSession` build
    `price_data` server-side; there is no pre-created Stripe Price the client could reference.
  - Payment success is never trusted from the browser redirect alone - `confirmCheckoutSession`
    (the client-triggered fallback for environments where the webhook can't reach the app) still
    re-verifies against Stripe's own API (`session.payment_status === "paid"`) before finalizing.
- **Documented follow-up (schema-level race, low likelihood)**: `Subscription` has no DB
  constraint preventing two `ACTIVE` rows for the same user - `createSubscriptionCheckoutSession`'s
  application-level check (`existing = await getActiveSubscriptionForUser(userId)`) prevents this
  in the normal flow, but two concurrent checkout attempts could theoretically both pass that
  check before either subscription is created. A Postgres partial unique index
  (`CREATE UNIQUE INDEX ... ON "Subscription" (userId) WHERE status = 'ACTIVE'`) would close this
  at the DB level, but Prisma's schema DSL can't declare a partial index directly - it would need a
  hand-written raw-SQL migration. Not done this pass per the rule against schema changes without
  strong, tested justification; recorded here as the recommended fix.

## Socket.IO / realtime

Extensively hardened in a prior session this same conversation (production Vercel↔Render
connectivity fix); re-verified rather than re-litigated in this pass:

- Auth uses a 60-second HMAC-signed token (`src/lib/socket-token.ts`), not a cookie - required
  because the Next.js app and socket server are separate domains in production and a cookie set
  on one domain never reaches the other. Timing-safe comparison (`crypto.timingSafeEqual`),
  distinguishes malformed/bad-signature/invalid-payload/expired for **server-side logging only**
  (the client always gets a generic "Unauthorized" - confirmed no reason is ever sent to the
  browser).
- `/internal/emit` (the Next.js → socket-server push bridge) requires `SOCKET_INTERNAL_SECRET` and
  rejects every request if it's unset (fails closed, not open).
- CORS is an explicit allow-list (`SOCKET_CORS_ORIGIN`, comma-separated), never a wildcard.
- Room membership: `conversation:join` re-checks `canAccessConversation` on every join, not just
  once; `message:send` re-checks the same before persisting. Rate-limited (15 messages/10s per
  socket, in-memory, cleared on disconnect).
- Reconnect/logout identity: the shared client-side socket now detects a same-tab user switch
  (e.g. signing in as someone else without a full page reload) and forces a re-handshake rather
  than silently staying joined to the previous user's rooms (`src/hooks/use-socket.ts`,
  `sharedSocketUserId` tracking - added in the prior session's hardening pass).
- **Documented, not re-opened**: the socket server uses `transports: ["polling"]` only (WebSocket
  upgrade disabled) because it was confirmed in production to get killed mid-upgrade on the
  current hosting setup. Per this task's explicit instruction, this was **not** re-enabled or
  re-tested in this pass.

## Database / Prisma

- Money is consistently `Decimal @db.Decimal(10, 2)` throughout (`Course.price/salePrice`,
  `Order.subtotal/discountAmount/total`, `Coupon.discountValue`, `SubscriptionPlan.price`,
  `Payment.amount`) - never `Float`. No change needed.
- `onDelete` behavior: 45 `Cascade`, 5 `SetNull` across the schema - reviewed, all consistent with
  the actual ownership relationships (e.g. deleting a `User` cascades their `Enrollment`s; deleting
  a `Coupon` sets `Order.couponId` to null rather than deleting the order).
- No client-side Prisma usage anywhere (confirmed by grep for `PrismaClient`/`@/lib/prisma`
  outside `src/server/`, `socket-server/`, and generated code).
- `socket-server/chat-store.ts` and Next.js both construct their own Prisma client from
  `src/lib/prisma.ts` - the same file, safe for both runtimes because it has no `"server-only"` or
  `next/cache` imports (confirmed).
- **Documented follow-up**: the `Subscription` active-row race condition (see Stripe section
  above).

## Logging / auditability

- The audit log (`AuditLog` via `src/lib/audit.ts`) already covers the events Phase 13 asks for:
  role/status changes (`user:ban`/`user:unban`), teacher approval/rejection, course
  approve/reject/publish, coupon create/activate/deactivate, subscription plan
  create/activate/deactivate, certificate revocation, message moderation (`message:moderate`),
  order refund/approve. Confirmed: ordinary reads are never logged (matches the task's explicit
  "do not turn every read into an audit log").
- **Fixed this pass** (as a side effect of the security fixes above): `chat-service.ts`'s
  `hideMessage` now goes through `canAdminAccess`, keeping the audit trail's actor-verification
  consistent with every other admin mutation.
- Socket-server logging (from the prior session's hardening) already distinguishes handshake vs.
  auth-layer failures with sanitised, specific reasons - never logs the token, cookies, or a full
  user object.
- **Not done this pass**: no structured/leveled logging library was introduced for the Next.js
  side (`console.error`/`console.warn` only, matching the existing codebase convention rather than
  introducing a new dependency for its own sake - the task explicitly warns against
  over-abstraction). If production log volume/searchability becomes a real problem, this is a
  reasonable follow-up.

## Security headers / CSP

See `docs/security/platform-security.md` for the full rationale and the exact policy shipped in
`next.config.ts`.
