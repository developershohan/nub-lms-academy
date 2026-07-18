# Architecture before the hardening refactor

Snapshot as of the start of `chore/production-hardening-refactor`, before Phase 9+ cleanup.

## Route map (39 pages, role-scoped by top-level path)

- **Public** (`src/app/(public)/*`, `src/app/*`): home, `/courses`, `/courses/[slug]`, `/categories/[slug]`, `/pricing`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/error`, `/certificates/verify/[certificateNumber]`.
- **Student** (`src/app/student/*`, gated by `student/layout.tsx`): dashboard, my-courses, course/[courseId]/learn, quiz/[quizId] (+ attempts/[attemptId]), certificates (+ [certificateId]), wishlist, billing, messages.
- **Teacher** (`src/app/teacher/*`): `teacher/apply` (open to any active user), `teacher/(dashboard)/*` (dashboard, courses, courses/create, courses/[courseId]/edit, messages) gated by the `(dashboard)` layout.
- **Admin** (`src/app/admin/*`, gated by `admin/layout.tsx` **and** by `requireAdmin()` in every individual `page.tsx` - added in an earlier hardening pass specifically because layouts don't re-run their auth check on client-side navigation): dashboard, users, teachers, courses, categories, reviews, certificates, orders, coupons, subscriptions, messages, audit-logs.

## Role map

| Role | Granted by | Key permissions (`src/lib/permissions.ts`) |
|---|---|---|
| STUDENT | Default on registration/OAuth sign-up | `course:submit-review`, `certificate:generate` |
| TEACHER | Admin-approved `TeacherProfile` application | `course:create/update-own/delete-own/submit-review` |
| ADMIN | Manually assigned (no self-service path) | approve/reject/publish courses, teacher approve/reject, user ban/unban, coupon CRUD, order view/refund, chat moderate, `admin:access` |
| SUPER_ADMIN | Manually assigned | same as ADMIN (identical permission set today - see Phase 4 access matrix for why this matters) |

Multi-role users are supported (a user keeps STUDENT after becoming TEACHER); `getRoleHome()` ranks ADMIN/SUPER_ADMIN > TEACHER > STUDENT for where to land.

## API map (31 route handlers under `src/app/api/`)

Grouped by domain - see `docs/refactor/baseline-report.md` for the full path list. Notable structural facts:
- `auth/register`, `auth/forgot-password`, `auth/reset-password` exist as **both** a JSON API route (`src/app/api/v1/auth/*`) **and** a Server Action used by the actual page (`src/app/(public)/{register,forgot-password,reset-password}/actions.ts`) - both paths call the same `src/server/services/auth-service.ts` functions. The API routes appear to be an intentional public-API surface (documented for external clients earlier this session) rather than dead code; not consolidated in this pass since removing either would be a public-contract change without a confirmed decision to do so.
- `courses` has the same duplication shape: `POST /api/v1/courses` and the teacher dashboard's `createCourseAction` Server Action both call `createCourse()`.
- Every route in `src/app/api/v1/` now uses the shared `parseJsonBody()` helper (`src/lib/http/json.ts`, added this pass) instead of a bare `await request.json()`.

## Service map (`src/server/services/*`, 19 files)

One file per domain (audit, auth, category, certificate, chat, coupon, course, enrollment, notification, order, progress, quiz, quiz-attempt, review, settings, subscription, teacher, user, wishlist). Consistent internal shape across almost all of them:

```
mutation(actorId, ...args) {
  if (!(await canAdminAccess(actorId))) return { error: "Forbidden" };
  // ...write...
  await logAudit(actorId, "action:name", "Entity", entityId);
  revalidatePath(...);
  return { ok: true };
}
```

This shape is duplicated ~10 times (category, certificate, coupon, course, review, user services) - see `docs/refactor/deleted-and-moved-files.md` / Phase 9 notes for why it was **not** extracted into a shared wrapper in this pass (readability/traceability tradeoff, documented as a follow-up rather than done reflexively).

A second, more consequential pattern: several `list*ForAdmin()`-style read functions take **no `actorId` parameter and perform no internal permission check**, relying entirely on the page/route that calls them to have already gated access (`listUsersForAdmin`, `listCoursesForAdmin`, `listAllReviewsForAdmin`, `listCertificatesForAdmin`, `listAuditLogsForAdmin`, `listCouponsForAdmin`, `listSupportConversationsForAdmin`, `listRecentMessagesForAdmin`). One of these (`listCouponsForAdmin`, via `GET /api/v1/admin/coupons`) was confirmed exploitable and fixed this pass; the rest were confirmed safe (their only callers are the now-fully-`requireAdmin()`-gated admin pages) but remain a **documented follow-up** for defense-in-depth (see `docs/security.md`).

## Data-access map

Prisma is accessed directly from `src/server/services/*` (Next.js runtime) and from `socket-server/chat-store.ts` (standalone Node process, **cannot** import anything using `"server-only"` or `next/cache` - see the comment at the top of that file). Both share the same `src/lib/prisma.ts` client construction (`@prisma/adapter-pg`), which contains no Next-specific imports, which is exactly why it's safely shareable across both runtimes.

## Socket.IO event map

- **Rooms**: `user:${userId}` (personal), `admins` (all connected ADMIN/SUPER_ADMIN sockets), `conversation:${conversationId}` (chat).
- **Client → server**: `conversation:join`, `conversation:leave`, `message:send` (rate-limited, 15/10s per socket), `message:read`, `typing:start`, `typing:stop`.
- **Server → client**: `message:new`, `message:read`, `typing:start`/`typing:stop`, `notification:new` (also pushed cross-process from the Next.js app via `src/lib/realtime.ts` → `POST /internal/emit`, shared-secret guarded), `user:online`/`user:offline`.
- **Auth**: short-lived (60s) HMAC-signed token (`src/lib/socket-token.ts`), not a cookie - the Next.js app and socket server are deployed on different domains (Vercel + Render) in production, and browsers don't share cookies across domains. Full detail in `docs/socket-production-deployment.md`.

## Stripe / payment flow

1. `createCheckoutSession`/`createSubscriptionCheckoutSession` (order-service / subscription-service) build a Stripe Checkout session with server-computed pricing (`price_data`, never a client-supplied amount) and a PENDING `Order`/pending `Subscription` row.
2. Two convergent finalization paths, both idempotent: (a) `POST /api/v1/webhooks/stripe` (signature-verified, dispatches to **both** `handleStripeWebhookEvent` and `handleSubscriptionWebhookEvent` - the latter was imported but never called before this pass, a confirmed bug fixed here), (b) `confirmCheckoutSession`, a client-triggered fallback on the billing-page success redirect for environments where the webhook can't reach the app (e.g. local dev).
3. A `PlatformSetting.autoApprovePayments` toggle (admin-controlled) decides whether a successful payment immediately enrolls the student or leaves the order PENDING for manual admin approval.

## Authentication flow

Auth.js v5 (`src/lib/auth.ts`), JWT session strategy, Credentials + Google + GitHub providers. `getCurrentUser()` (`src/lib/permissions.ts`) always re-reads role/status from the DB rather than trusting the JWT claim - this is the app's answer to the documented Next.js limitation that layouts don't re-run their auth check on client-side navigation (see that function's own doc comment, and `src/proxy.ts`'s comment on why role checks were deliberately moved out of the middleware).

## Password-reset flow

`POST /api/v1/auth/forgot-password` (or the `forgot-password` Server Action) → `requestPasswordReset()` → always returns success regardless of whether the email exists (no enumeration) → inserts a `VerificationToken` (32 random bytes, 30-minute expiry, no email provider wired up yet - logs the link to console, documented limitation). `resetPassword()` looks the token up by the `{identifier, token}` composite key, checks expiry, and deletes it on success (single-use).

## Ownership boundaries

- Course content ownership: `canManageCourse(userId, courseId)` - the *owning teacher only*, not any teacher, not admins (admins review/publish, never edit content).
- Course viewing access: `canAccessCourse` - owning teacher, admins, active enrollment, or active subscription with `isSubscriptionIncluded`.
- Conversation access: `canAccessConversation` - moderators always; `COURSE_GROUP` derived live from course access; `DIRECT`/`SUPPORT` require an explicit `ConversationParticipant` row.

## Shared utilities (`src/lib/*`)

`auth.ts`, `audit.ts`, `certificate-pdf.ts`, `permissions.ts`, `prisma.ts`, `realtime.ts`, `role-home.ts`, `slug.ts`, `socket-token.ts`, `stripe.ts`, `utils.ts`, `video-embed.ts`, `validations/*`, and (added this pass) `http/json.ts`. No generic `helpers.ts`/giant `utils.ts` dumping ground exists today - `utils.ts` is small (className merge helper only, confirmed by inspection) and each other file has one clear responsibility. This is a genuinely good existing pattern, preserved rather than restructured.

## Duplicated logic (confirmed by direct inspection, not just automated scanning)

1. **Admin-mutation shape** (`canAdminAccess` → mutate → `logAudit` → `revalidatePath`) - ~10 near-identical instances across `category-service.ts`, `certificate-service.ts`, `coupon-service.ts`, `course-service.ts`, `review-service.ts`, `user-service.ts`.
2. **"Resolve foreign key up to owning course, then `canManageCourse`" chain resolvers** - `getCourseIdForSection`/`getCourseIdForLesson` (`course-service.ts`) and `getCourseIdForQuiz`/`getCourseIdForQuestion` (`quiz-service.ts`), 4 nearly-identical one-off lookups.
3. **Admin role re-implementation bug** (fixed this pass): `chat-service.ts`'s `hideMessage` reimplemented the admin-role check inline instead of calling `canAdminAccess`, and the reimplementation silently dropped the `status === "ACTIVE"` requirement - a banned admin account could still moderate messages. Now calls `canAdminAccess` directly.
4. **JSON body parsing** (fixed this pass): 16 route handlers called `request.json()` with no try/catch, so a malformed body threw an uncaught exception instead of a clean 400. Consolidated into `src/lib/http/json.ts`'s `parseJsonBody()`.

## Large or complex files

None of the service files are unreasonably large by responsibility - the biggest (`course-service.ts`, `chat-service.ts`) each own one cohesive domain (course CRUD + curriculum management; conversations + messages + moderation) rather than mixing unrelated concerns. No file was found to combine Prisma queries + business rules + HTTP response shaping + rendering in one place (the Next.js route/service/component layering is consistently respected).

## Circular dependency risk

None found. `socket-server/` explicitly avoids importing anything from `src/server/services/*` or `src/lib/*` that uses `"server-only"`/`next/cache` (see `chat-store.ts`'s own comment); it only shares pure-Node files (`prisma.ts`, `socket-token.ts`) via the `@/*` path alias. `src/lib/*` files don't import from `src/server/services/*` or `src/components/*`, keeping the dependency direction one-way (app/components → services → lib).

## Dead-code candidates (verified, not automated-only)

- No verifiably dead files were found in `src/`. Every service/lib file has at least one confirmed caller (checked via `grep`, not just an automated unused-export tool, per the task's explicit rule against deleting on automated-only evidence).
- Two files sit outside the app's normal structure: `CLAUDE_SOCKET_IO_RENDER_FIX_TASK.md` and `CLAUDE_REPOSITORY_HARDENING_REFACTOR_PR_QC_TASK.md` at the repo root - these are task specifications for this and a prior session's work, not application code or documentation meant for contributors. Recommend relocating or removing once their content is fully actioned (not touched during this audit itself, since the current task file must remain readable while this task is in progress).

## Stale documentation candidates

- `README.md` is default `create-next-app` boilerplate (confirmed by inspection) - replaced in Phase 16.
- `lms_nextjs_prisma_requirements.md` (repo root) - reviewed in Phase 16; see `docs/deployment.md`/README for its disposition.

## Inconsistent naming

- HTTP status codes for "not authenticated" are inconsistent: most routes return 401, but several (`courses/[courseId]` PATCH, `courses/[courseId]/approve`, `courses/[courseId]/submit-review`) returned 403. The `courses/[courseId]/reject` instance was corrected to 401 in this pass as part of an adjacent edit; the remaining instances are **documented follow-up** (cosmetic, not exploitable - client error handling reliability only).
- `*Service` is used consistently only for real business-logic modules (confirmed - no stray `*Service` naming on simple CRUD wrappers). `require*`/`can*` naming conventions (`requireAdmin`, `requireTeacher`, `canManageCourse`, `canAccessCourse`, ...) are already followed consistently in `src/lib/permissions.ts`.

## Files that should remain separate

`src/lib/permissions.ts` (policy/authorization) and `src/lib/auth.ts` (Auth.js wiring) are already separate and should stay that way - merging would mix framework configuration with reusable business policy.

## Files that may be split in a future pass (not done in this one - see Phase 9 for why)

`course-service.ts` (19 exports spanning course CRUD, sections, lessons) is the closest candidate to a split (e.g. `course-service.ts` + `curriculum-service.ts`), but every exported function is already correctly scoped and none combine unrelated responsibilities - the file is long because the *domain* is large, not because it's disorganized. Splitting it would mean updating ~10 import sites for no behavior change and no clearer ownership boundary, which fails this task's own bar ("do not split files solely due to line count"). Left as-is; documented as a follow-up candidate only if the file continues to grow.
