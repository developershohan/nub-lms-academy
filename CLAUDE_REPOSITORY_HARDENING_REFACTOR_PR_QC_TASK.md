# Claude Code Task — Repository-Wide Production Hardening, Professional Refactor, PR Review, and QC

## Repository

- Repository: `https://github.com/developershohan/nub-lms-academy.git`
- Production frontend: `https://nub-lms-academy.vercel.app`
- Production Socket.IO service: `https://nub-lms-academy.onrender.com`
- Default branch: `master`

## Current project context

The repository currently uses:

- Next.js 16.2.x App Router
- React 19.2.x
- TypeScript
- Auth.js / NextAuth v5 beta with Credentials, Google, and GitHub providers
- Prisma 7 with PostgreSQL
- Stripe
- Socket.IO
- Zod validation
- Separate public, admin, student, and teacher route areas
- API routes under `src/app/api/v1`
- Domain services under `src/server/services`
- Shared security and infrastructure utilities under `src/lib`
- A standalone Socket.IO process under `socket-server`

The current route and domain surface includes authentication, password reset, courses, lessons, quizzes, enrollments, certificates, teacher applications, users, subscriptions, orders, coupons, reviews, notifications, chat, Stripe webhooks, video playback, audit logs, and role-based dashboards.

`AGENTS.md` explicitly warns that this Next.js version contains breaking changes. Before changing any Next.js-specific code, read the relevant local documentation under:

```text
node_modules/next/dist/docs/
```

Follow `AGENTS.md` and `CLAUDE.md` throughout the task.

---

# Primary objective

Perform a repository-wide engineering audit and a careful production-hardening refactor so the application becomes:

- clean and professionally organised;
- secure by default;
- easier to maintain;
- easier to test;
- scalable for future features and contributors;
- consistent in architecture and naming;
- free from verified dead code, duplicate code, stale boilerplate, and unnecessary comments;
- protected against unauthorised page, API, server-action, database, payment, and Socket.IO access;
- fully functional with the same existing user-facing behaviour.

You may merge, move, rename, split, or remove files and folders only when there is clear evidence that doing so improves the codebase and does not remove functionality.

This is not permission for a cosmetic mass rewrite. Prefer low-risk, evidence-based changes with tests.

---

# Non-negotiable rules

1. Preserve all existing business features and user-facing flows.
2. Do not change public URLs, API contracts, database semantics, event names, Socket.IO room names, or Stripe behaviour without proving compatibility and documenting the change.
3. Do not delete a file merely because it appears unused. Confirm usage with repository search, Next.js conventions, dynamic imports, route conventions, package scripts, Prisma configuration, and tests.
4. Do not weaken authentication, authorisation, validation, audit logging, payment verification, or Socket.IO security.
5. Do not expose or log secrets, passwords, session tokens, reset tokens, Stripe signatures, database URLs, OAuth secrets, cookies, or personal information.
6. Do not commit `.env` files or real credentials.
7. Do not use `npm audit fix --force`, broad dependency upgrades, or framework migrations as a shortcut.
8. Do not add abstractions that are used only once unless they solve a real consistency, security, or testing problem.
9. Do not create large barrel files that introduce circular dependencies or unclear import ownership.
10. Do not add comments that merely repeat the code.
11. Keep comments only for security rationale, business rules, framework limitations, non-obvious invariants, and deliberate trade-offs.
12. Remove commented-out code, temporary debugging logs, obsolete TODOs, generated boilerplate, and stale explanatory comments after confirming they are unnecessary.
13. No `any`, unsafe type assertions, swallowed errors, empty catch blocks, or silent security fallbacks unless strictly justified and documented.
14. Do not alter generated Prisma client files.
15. Do not directly modify or squash old Prisma migrations that may already be deployed.
16. Do not merge to `master`. Prepare a reviewable branch and PR-quality output.
17. If a high-risk change cannot be verified safely, leave the current implementation working and record the issue and recommended follow-up instead of guessing.
18. Treat all user-supplied identifiers, form data, URL parameters, JSON payloads, query parameters, callback URLs, webhook bodies, socket events, and database records as untrusted input.
19. Security must be enforced on the server. Hiding a button or redirecting a page is not an authorisation control.
20. Run the complete QC suite after every major phase and at the end.

---

# Git and work safety

Before editing:

```bash
git status
git branch --show-current
git log -1 --oneline
```

If the working tree is clean, create a branch:

```bash
git switch -c chore/production-hardening-refactor
```

If there are existing user changes, do not overwrite, discard, reset, or stash them without permission. Record the condition and work around it safely.

Create small logical commits when possible. Suggested commit groups:

1. audit and quality tooling;
2. authentication and authorisation hardening;
3. API and validation hardening;
4. architecture and duplication cleanup;
5. UI route safety, accessibility, and performance;
6. tests and CI;
7. documentation and final cleanup.

Do not push or merge unless explicitly instructed.

---

# Phase 0 — Establish a verified baseline

Before changing code:

1. Install exactly from the lockfile.
2. Record the active Node and npm versions.
3. Inspect package scripts and deployment requirements.
4. Read the relevant Next.js 16 local documentation.
5. Run the existing quality checks.
6. Inventory routes, services, components, Prisma models, socket events, and environment variables.

Run:

```bash
node --version
npm --version
npm ci
npm run lint
npx tsc --noEmit
npm run build
npx prisma validate
npm ls --depth=0
npm audit --omit=dev
```

Do not treat every `npm audit` warning as automatically exploitable. Classify findings based on actual runtime reachability and available non-breaking fixes.

Record baseline results in:

```text
docs/refactor/baseline-report.md
```

Include:

- current commit;
- commands and results;
- existing failures;
- existing warnings;
- build output;
- route inventory;
- top-level architecture;
- security-sensitive entry points;
- known deployment assumptions;
- initial risk list.

Do not hide pre-existing failures.

---

# Phase 1 — Full repository inventory and dependency graph

Inspect the whole repository, including:

```text
.claude/
prisma/
public/
socket-server/
src/app/
src/components/
src/hooks/
src/lib/
src/server/services/
src/types/
src/proxy.ts
AGENTS.md
CLAUDE.md
README.md
lms_nextjs_prisma_requirements.md
next.config.ts
prisma.config.ts
package.json
tsconfig.json
eslint.config.mjs
components.json
```

Create:

```text
docs/refactor/architecture-before.md
```

Document:

- route map;
- role map;
- API map;
- service map;
- data-access map;
- Socket.IO event map;
- Stripe/payment flow;
- authentication flow;
- password-reset flow;
- ownership boundaries;
- shared utilities;
- duplicated logic;
- large or complex files;
- circular dependency risks;
- dead-code candidates;
- stale documentation candidates;
- inconsistent naming;
- files that should remain separate;
- files that may be merged, split, moved, renamed, or removed.

Use tools such as repository search, TypeScript, ESLint, and a dead-code analyser where useful. `knip` may be added as a development tool only if it is configured carefully for Next.js routes, Prisma, scripts, dynamic imports, and Socket.IO entry points.

Never delete a file solely because an automated tool marks it unused.

---

# Phase 2 — Define the target architecture before moving files

Create:

```text
docs/refactor/target-architecture.md
```

Prefer a clear layered structure that preserves Next.js route conventions. A suitable direction may be:

```text
src/
  app/                    # routes, route handlers, layouts, loading/error boundaries
  components/
    ui/                   # generic presentational primitives
    layout/               # shared layout/navigation
    shared/               # truly cross-domain components
    features/             # domain-oriented UI where useful
  features/               # optional domain modules when they improve ownership
  server/
    services/             # business use cases
    repositories/         # only if repeated Prisma access warrants it
    policies/             # server-side authorisation policies
  lib/
    auth/
    security/
    validation/
    payments/
    realtime/
    errors/
    http/
    database/
  hooks/
  types/
socket-server/
  events/
  security/
```

This is guidance, not a mandatory mass migration.

Choose the smallest architecture change that creates clear ownership and future scalability.

Architecture rules:

- Route files should remain thin.
- UI components should not directly implement sensitive business rules.
- Business services should be server-only.
- Prisma queries should not be scattered unpredictably across client-facing files.
- Authorisation policies should be reusable and server-side.
- Zod schemas should be reusable when the same contract is shared.
- Shared utilities must be genuinely shared.
- Domain-specific utilities should remain with the domain.
- Avoid a generic `helpers.ts` dumping ground.
- Avoid a giant `utils.ts`.
- Avoid duplicate role checks and response formatting.
- Keep Socket.IO process boundaries explicit.
- Keep browser-safe and server-only modules separated.
- Add `import "server-only"` to sensitive server modules where appropriate.
- Prevent client bundles from importing Prisma, secrets, Stripe server SDKs, password hashing, or server-only authentication code.

Do not begin major moves until the target structure is documented.

---

# Phase 3 — Authentication and session security audit

Audit all Auth.js configuration and authentication flows, including:

```text
src/lib/auth.ts
src/server/services/auth-service.ts
src/app/api/auth/[...nextauth]/
src/app/api/v1/auth/
src/app/(public)/login/
src/app/(public)/register/
src/app/(public)/forgot-password/
src/app/(public)/reset-password/
src/types/next-auth.d.ts
src/proxy.ts
```

Verify and fix where needed:

## Credentials login

- Zod validation before database work.
- Consistent normalisation of email addresses.
- Password comparison using bcrypt safely.
- Generic invalid-credential errors.
- No email/account enumeration.
- Disabled or inactive accounts cannot authenticate.
- No password hashes returned in sessions, API responses, logs, or client props.
- Appropriate password requirements.
- Avoid excessive database data in session callbacks.
- Session role/status values cannot be supplied by the browser.

## OAuth

- Secure account linking behaviour.
- No privilege inheritance based only on matching unverified input.
- Correct handling of inactive/banned users.
- Safe callback URL validation.
- No open redirects.
- Provider secrets stay server-only.
- OAuth-created users receive safe default roles/statuses.

## Sessions

- Explicit session strategy and expiry.
- Secure production cookies.
- Correct `httpOnly`, `secure`, and `sameSite` behaviour.
- Session data refreshed safely after role or account-status changes.
- Role/status revocation takes effect predictably.
- No sensitive data stored in JWT/session payloads unnecessarily.
- Sign-out clears or disconnects user-scoped Socket.IO state.

## Password reset

Verify:

- generic response whether or not an email exists;
- cryptographically secure reset tokens;
- tokens are stored hashed where feasible;
- short expiry;
- single use;
- old tokens are invalidated;
- password change invalidates relevant sessions/reset tokens;
- no token is logged;
- reset pages do not leak token validity unnecessarily;
- rate limiting or abuse protection is production-compatible.

Do not invent an email provider. Preserve current behaviour and document any required external setup.

---

# Phase 4 — Authorisation and route protection

The current proxy protects role areas primarily by account status, while role enforcement is expected inside pages/layouts. Audit this defence-in-depth model completely.

Create a role/access matrix for at least:

- guest;
- active student;
- inactive student;
- active teacher;
- pending teacher applicant;
- rejected teacher applicant;
- admin;
- super admin or equivalent, if present.

Audit every:

- page;
- layout;
- route handler;
- server action;
- service;
- Socket.IO event;
- internal realtime endpoint;
- Stripe-related endpoint;
- certificate endpoint;
- video playback endpoint.

Requirements:

1. Every protected route must require an authenticated active user server-side.
2. Every role-specific route must verify the correct role server-side.
3. Every admin mutation must require admin permission at the mutation boundary.
4. Every resource mutation/read must verify ownership or explicit elevated permission.
5. Never trust a role, user ID, price, course ID, teacher ID, subscription state, order state, or enrollment state sent by the browser.
6. Avoid UI-only checks.
7. Use central policy/guard helpers where this removes duplicated logic.
8. Do not rely only on `src/proxy.ts`; proxy/layout/API/service layers should provide appropriate defence in depth.
9. Redirects should be for user experience; service/API checks must provide security.
10. Return `401` for unauthenticated access and `403` for authenticated but forbidden access where appropriate.
11. Do not reveal whether inaccessible resources exist.
12. Prevent IDOR/BOLA across:
    - users;
    - teacher applications;
    - courses;
    - lessons;
    - enrollments;
    - progress;
    - quizzes and attempts;
    - certificates;
    - orders;
    - subscriptions;
    - coupons;
    - reviews;
    - notifications;
    - messages/conversations;
    - videos;
    - audit logs.

Create or improve reusable guards/policies only where they simplify verified repeated rules.

Add tests for cross-role and cross-user access.

---

# Phase 5 — API and server-action hardening

Inventory every handler under:

```text
src/app/api/v1/
```

The current surface includes admin, auth, certificates, chat, coupons, courses, enrollments, lesson progress, notifications, orders, quizzes, socket tokens, subscriptions, teacher applications, video playback, and Stripe webhooks.

For every route and server action, verify:

- accepted HTTP methods;
- authentication;
- role/permission;
- resource ownership;
- input validation;
- output shaping;
- error handling;
- response status;
- cache behaviour;
- rate/abuse limits where needed;
- audit logging for sensitive operations;
- transaction safety;
- idempotency;
- no sensitive data leakage;
- no mass assignment.

Create consistent server-side utilities for:

- structured API success responses;
- structured API errors;
- Zod validation failures;
- unauthenticated/forbidden/not-found/conflict responses;
- safe unexpected-error logging;
- request correlation IDs if introduced safely.

Do not wrap every handler in unnecessary abstraction. Standardise only repeated behaviour.

## Input validation

- Validate path parameters, query parameters, headers used for security, form data, and JSON bodies.
- Use strict Zod schemas where unknown fields should be rejected.
- Apply length, range, enum, URL, currency, and identifier limits.
- Normalise only where business-safe.
- Never pass unvalidated user data into Prisma filters or updates.
- Use explicit Prisma `data` objects rather than spreading request bodies.

## Mutation safety

- Use transactions for operations that must succeed atomically.
- Protect against duplicate submissions.
- Use idempotency for payment/webhook flows.
- Do not trust client-provided prices or totals.
- Recalculate billable amounts from server-owned data.
- Prevent race conditions in enrollment, coupon redemption, subscriptions, quiz attempts, and certificate issuance.

## Error handling

- No raw Prisma errors, stack traces, SQL details, or internal exceptions in client responses.
- Log enough sanitised context to diagnose production issues.
- Do not swallow unexpected failures.
- Distinguish expected domain errors from infrastructure errors.

---

# Phase 6 — Stripe and financial integrity

Audit:

```text
src/lib/stripe.ts
src/server/services/order-service.ts
src/server/services/subscription-service.ts
src/app/api/v1/orders/
src/app/api/v1/subscriptions/
src/app/api/v1/webhooks/stripe/
src/app/api/v1/coupons/validate/
```

Verify:

- webhook signature is verified against the raw body before processing;
- missing webhook secrets fail safely;
- event IDs are stored or checked for idempotency;
- repeated Stripe events cannot double-enrol, double-credit, or corrupt orders;
- order/subscription state transitions are explicit and valid;
- totals, course prices, discounts, and currency are calculated server-side;
- coupon validity, usage limits, expiry, scope, and ownership are checked transactionally;
- payment success is not trusted from browser redirects;
- cancellation/refund behaviour is consistent;
- no Stripe secret or webhook body containing sensitive data is logged;
- DB writes that must stay consistent use transactions;
- webhook responses are timely;
- recoverable failures can be retried safely;
- relevant events are audit logged without sensitive payloads.

Do not change live pricing behaviour without explicit evidence and tests.

---

# Phase 7 — Socket.IO and realtime security

Preserve the recently fixed production connection.

Audit:

```text
src/hooks/use-socket.ts
src/lib/socket-token.ts
src/lib/realtime.ts
src/app/api/v1/socket-token/
socket-server/index.ts
socket-server/auth.ts
socket-server/chat-store.ts
socket-server/events/
```

Verify:

- production URL configuration remains correct;
- one authenticated socket per intended browser context;
- logout/login identity changes safely;
- short-lived socket token verification;
- timing-safe signature comparison where applicable;
- token expiry and malformed-token handling;
- CORS exact allow-list;
- no wildcard credentialed origin;
- socket event payload validation;
- room membership authorisation;
- conversation membership checks;
- admin moderation permissions;
- users cannot emit events on behalf of another user;
- internal emit endpoint requires a strong shared secret;
- secret comparison is safe;
- rate/size limits for chat and realtime events;
- message length limits;
- duplicate event handling;
- sanitised logging;
- disconnect cleanup;
- no memory leak from duplicate listeners;
- no confidential event broadcast to broad rooms;
- health endpoint remains safe;
- Render deployment remains compatible.

Keep current transport behaviour unless a tested change is clearly justified.

Do not break the working Vercel-to-Render setup.

---

# Phase 8 — Database, Prisma, and data integrity audit

Audit:

```text
prisma/schema.prisma
prisma/migrations/
prisma/seed.ts
prisma.config.ts
src/lib/prisma.ts
src/server/services/
socket-server/chat-store.ts
```

Requirements:

## Schema

- Preserve deployed migration history.
- Review indexes against actual frequent filters, joins, sorts, and unique lookups.
- Check missing composite uniqueness constraints that protect business invariants.
- Check nullable fields and defaults.
- Check cascade/restrict behaviour.
- Check enum use.
- Check money representation and currency.
- Check timestamp consistency.
- Check token storage.
- Check audit-log immutability expectations.
- Check idempotency storage for webhooks/orders.
- Do not create speculative indexes or schema changes without evidence.

## Queries

- Select only required fields.
- Avoid exposing password hashes, tokens, secrets, private metadata, or unnecessary PII.
- Find N+1 query patterns.
- Add pagination to potentially unbounded lists.
- Use stable ordering.
- Limit search inputs.
- Avoid loading full datasets for counts.
- Use transactions where required.
- Avoid long transactions containing external API calls.
- Ensure Socket.IO and Next.js Prisma usage are safe for their runtimes.
- Preserve the existing Prisma adapter configuration.
- Ensure no database connection is created in client code.

## Seed

- No production secrets.
- No weak fixed production admin password.
- Clear development-only behaviour.
- Safe repeatability where possible.

Run:

```bash
npx prisma format
npx prisma validate
npx prisma generate
```

If a schema change is genuinely required, create a new migration and document rollout and rollback implications. Do not deploy it automatically.

---

# Phase 9 — File/folder cleanup and professional refactor

After security and behaviour are covered by tests, perform evidence-based cleanup.

## Remove or merge only when verified

Candidates include:

- duplicated validation schemas;
- duplicated role/permission checks;
- duplicated Prisma projections;
- duplicated response/error handling;
- duplicated date/currency/status formatting;
- duplicated layout/navigation components;
- duplicate chat/realtime types;
- stale boilerplate;
- unused assets;
- obsolete documentation;
- unused exports;
- abandoned components;
- dead route helpers;
- empty folders;
- placeholder code;
- commented-out implementations;
- temporary console statements;
- stale TODO/FIXME comments;
- unnecessary wrapper components.

For every removed file, record:

- file path;
- why it was safe to remove;
- how usage was verified;
- whether functionality moved elsewhere.

Create:

```text
docs/refactor/deleted-and-moved-files.md
```

## Split files when justified

Split files that combine unrelated responsibilities or have become difficult to test/review. Do not split files solely due to line count.

Good split signals:

- authentication config mixed with unrelated domain logic;
- authorisation rules mixed with UI;
- multiple independent components in one file;
- Prisma queries, business rules, HTTP responses, and rendering all combined;
- large switch statements that represent distinct policies;
- repeated private helpers that form a coherent module.

## Merge files when justified

Merge files only when:

- both files represent one small cohesive responsibility;
- separation causes circular imports or needless indirection;
- there is no meaningful independent reuse or testing boundary.

## Naming

Use clear domain language consistently:

- singular/plural conventions;
- `get`, `list`, `create`, `update`, `delete`, `approve`, `reject`;
- `require*` for guards that throw/redirect;
- `can*` for boolean policies;
- `*Schema` for Zod contracts;
- `*Service` only for real business service modules;
- `*Repository` only if a data-access abstraction actually exists.

Do not rename public routes or public API fields casually.

## Comments

Remove:

- obvious comments;
- restatements of function names;
- old commented code;
- tutorial comments;
- placeholder comments such as `config options here`;
- debugging notes no longer relevant.

Keep concise comments for:

- security-sensitive decisions;
- non-obvious business rules;
- Next.js 16 limitations;
- Stripe idempotency;
- Socket.IO deployment constraints;
- transaction boundaries;
- deliberate performance trade-offs.

---

# Phase 10 — UI route quality, error handling, and required professional pages

Audit the complete route tree.

Add or improve where absent and appropriate:

- root `not-found.tsx`;
- root `error.tsx`;
- route-level error boundaries for role dashboards where useful;
- `loading.tsx` for expensive routes;
- safe empty states;
- safe permission-denied states;
- safe authentication error page;
- password-reset expired/invalid state;
- payment success/pending/failure states where the current flow needs them;
- accessible form errors;
- confirmation for destructive actions;
- consistent page metadata;
- professional 404 and unexpected-error UX.

Do not expose technical details to users.

## Accessibility

Audit:

- keyboard navigation;
- focus states;
- form labels;
- error association;
- button semantics;
- links vs buttons;
- dialog focus management;
- table headers;
- colour contrast;
- landmarks;
- headings;
- live regions for async notifications;
- reduced-motion behaviour;
- mobile responsiveness.

Fix issues without redesigning the site.

## Security-sensitive rendering

- Avoid unsafe HTML.
- Audit any `dangerouslySetInnerHTML`.
- Sanitize stored rich text if it exists.
- Validate video embed URLs.
- Prevent `javascript:` and unsafe schemes.
- Prevent tabnabbing on external links.
- Do not render private fields into client props.
- Check public certificate verification for data minimisation.
- Check PDF/QR generation for untrusted content and resource limits.

---

# Phase 11 — Performance and scalability

Optimise only after profiling or identifying clear issues.

Audit:

- server vs client component boundaries;
- unnecessary `"use client"`;
- large client bundles;
- duplicate requests;
- waterfalls;
- N+1 queries;
- unbounded tables;
- expensive dashboard queries;
- repeated session/database lookups;
- image handling;
- font loading;
- static vs dynamic rendering;
- cache behaviour;
- revalidation;
- route loading states;
- Socket.IO listener lifecycle;
- repeated JSON serialisation;
- overly broad Prisma includes;
- unnecessary rerenders.

Follow the local Next.js 16 documentation before applying caching or rendering changes.

Rules:

- Do not cache user-specific or permission-sensitive data publicly.
- Do not cache authentication decisions incorrectly.
- Do not introduce stale authorisation.
- Do not add `useMemo`/`useCallback` everywhere.
- Do not convert server components to client components without need.
- Use pagination for growing datasets.
- Add database indexes only when query patterns justify them.
- Preserve correct realtime behaviour.

Create:

```text
docs/refactor/performance-review.md
```

Separate completed fixes from future recommendations.

---

# Phase 12 — HTTP security headers and platform configuration

`next.config.ts` currently contains only placeholder configuration. Replace placeholder boilerplate with intentional configuration after reading the Next.js 16 documentation.

Audit and safely configure applicable headers:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`
- frame protection through CSP `frame-ancestors` or an appropriate fallback;
- HSTS in production only;
- Content Security Policy.

CSP requirements:

- Do not deploy a CSP that breaks Next.js, Auth.js, Stripe, OAuth, images, video embeds, Socket.IO, or required third-party resources.
- Prefer an enforceable, tested policy.
- If nonce-based CSP requires a larger architectural change, document it and use a carefully tested interim policy rather than pretending it is complete.
- Do not use broad unsafe sources without documenting why.
- Do not add security headers twice through conflicting layers.

Also review:

- Vercel environment separation;
- Render environment separation;
- trusted host/origin configuration;
- secure redirects;
- production source maps;
- response caching;
- powered-by header;
- body size/resource limits where supported.

Create:

```text
docs/security/platform-security.md
```

---

# Phase 13 — Logging, auditability, and observability

Create a small, consistent server logging approach if one does not exist.

Requirements:

- structured logs;
- levels;
- sanitised context;
- no secrets or sensitive payloads;
- no password/reset/socket/session tokens;
- no full payment objects;
- no full request headers;
- no unnecessary user PII;
- correlation/request IDs where useful;
- clear expected-domain vs unexpected-infrastructure errors;
- Socket.IO connection diagnostics remain sanitised;
- Stripe event IDs may be logged safely, but not secret payload content;
- production console noise is removed.

Audit the existing audit-log system:

- sensitive admin changes recorded;
- role/status changes recorded;
- teacher approval/rejection recorded;
- course publication changes recorded;
- coupon and subscription changes recorded;
- certificate revocation/issuance recorded;
- moderation actions recorded;
- logs cannot be edited by ordinary users;
- audit entries do not contain secrets.

Do not turn every read operation into an audit log.

---

# Phase 14 — Testing strategy and implementation

The current package scripts do not show a complete automated test suite. Add a practical test setup appropriate for the repository.

Preferred layers:

## Unit tests

Cover:

- validation schemas;
- permission/policy helpers;
- slug/video URL utilities;
- socket token signing/verification;
- coupon calculations;
- role-home logic;
- domain state transitions;
- safe error mapping.

## Integration/service tests

Cover critical service behaviour with an isolated test database or safe mocked boundaries:

- login status checks;
- registration;
- password reset;
- teacher application;
- admin approval/rejection;
- course ownership;
- enrollment;
- lesson progress;
- quiz submission;
- certificate eligibility/verification;
- coupon validation/redemption;
- order creation;
- subscription state;
- Stripe webhook idempotency;
- chat membership;
- notification ownership.

## Route tests

Verify:

- `401`, `403`, `404`, `409`, and validation responses;
- cross-role denial;
- cross-user denial;
- safe response shapes;
- no sensitive fields.

## End-to-end tests

Use Playwright if practical. Cover at minimum:

1. guest can view public pages;
2. guest cannot access protected dashboards;
3. student login and dashboard;
4. student cannot access teacher/admin pages;
5. teacher cannot access admin pages;
6. inactive user is denied;
7. admin can access admin pages;
8. critical course/enrollment flow;
9. password-reset page states;
10. Socket.IO/chat connection smoke test where practical;
11. mobile navigation smoke test.

Do not make tests depend on live production Stripe, live OAuth, or real email.

Use fixtures/factories that do not include real credentials or PII.

Add scripts such as:

```json
{
  "typecheck": "tsc --noEmit",
  "test": "...",
  "test:run": "...",
  "test:e2e": "...",
  "check": "npm run lint && npm run typecheck && npm run test:run && npm run build"
}
```

Choose exact commands based on the installed test tools.

Do not add multiple overlapping test frameworks.

---

# Phase 15 — CI, dependency hygiene, and repository professionalism

Add a GitHub Actions workflow such as:

```text
.github/workflows/ci.yml
```

It should run on pull requests and relevant pushes:

- checkout;
- supported Node setup;
- `npm ci`;
- Prisma generation/validation;
- lint;
- typecheck;
- unit/integration tests;
- production build.

Do not require live production secrets for basic CI. Use safe test environment placeholders and document required CI secrets only when unavoidable.

Consider:

- Dependabot configuration for npm and GitHub Actions;
- `SECURITY.md`;
- `CONTRIBUTING.md`;
- `.github/pull_request_template.md`;
- Node engine/version pinning;
- package metadata cleanup;
- lockfile consistency.

Do not add governance files that provide no value.

## Dependency audit

- Remove verified unused dependencies.
- Move packages between dependencies/devDependencies where correct.
- Keep Socket.IO client/server versions compatible.
- Do not upgrade major versions without a separate compatibility plan.
- Check Auth.js beta release risk.
- Check Prisma adapter compatibility.
- Check deprecated packages.
- Explain every dependency change.

Run:

```bash
npm ls
npm outdated
npm audit
```

Classify rather than blindly fixing.

---

# Phase 16 — Documentation cleanup

The current README appears close to default Create Next App boilerplate. Replace it with a project-specific professional README.

The README should include:

- project overview;
- architecture summary;
- technology stack;
- prerequisites;
- local setup;
- environment variable groups with placeholders only;
- database migration/seed steps;
- Next.js development command;
- Socket.IO development command;
- testing commands;
- build commands;
- Vercel frontend deployment;
- Render socket deployment;
- role overview;
- security notes;
- troubleshooting links to internal docs.

Review:

```text
lms_nextjs_prisma_requirements.md
```

If it is current and useful, move it under `docs/` with an accurate name. If it is fully superseded, remove it only after documenting why.

Create or update:

```text
docs/architecture.md
docs/security.md
docs/deployment.md
docs/testing.md
docs/refactor/final-report.md
```

Never place real secrets in documentation.

---

# Phase 17 — Quality-control review

After implementation, perform an independent second-pass review as if reviewing someone else's pull request.

## PR review checklist

Review every diff for:

- accidental feature removal;
- broken imports;
- route changes;
- API contract changes;
- incorrect authorisation;
- missing ownership checks;
- client/server boundary leaks;
- secrets;
- sensitive logs;
- mass assignment;
- raw Prisma errors;
- race conditions;
- missing transactions;
- webhook duplication;
- Socket.IO event leakage;
- caching of private data;
- unstable React keys;
- accessibility regressions;
- responsive regressions;
- dead code;
- over-abstraction;
- unnecessary comments;
- unclear naming;
- migration risk;
- deployment risk.

Use:

```bash
git diff --check
git diff --stat
git status
```

Search for dangerous patterns, reviewing every result manually:

```bash
rg -n "console\.(log|debug)|debugger|TODO|FIXME|HACK|@ts-ignore|@ts-expect-error|eslint-disable|dangerouslySetInnerHTML|process\.env|password|secret|token|authorization|cookie|eval\(|new Function|innerHTML|as any|: any" .
```

Do not mechanically delete legitimate security-related references.

## Final command suite

Run from a clean install:

```bash
rm -rf node_modules .next
npm ci
npx prisma generate
npx prisma validate
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Run E2E tests according to the documented test environment:

```bash
npm run test:e2e
```

Also run:

```bash
npm audit --omit=dev
npm ls
git diff --check
```

If any required check fails, do not state that the task is complete.

---

# Phase 18 — Manual functional regression matrix

Manually verify with test accounts or documented fixtures:

## Public

- home;
- course listing;
- category listing;
- pricing;
- login;
- registration;
- forgot password;
- reset password;
- certificate verification;
- auth error;
- 404;
- unexpected-error page.

## Student

- dashboard;
- my courses;
- course learning;
- lesson progress;
- quiz attempt;
- certificates;
- wishlist;
- billing;
- orders/subscription flow;
- notifications;
- messages/chat;
- logout and re-login as another user.

## Teacher

- teacher application;
- pending/rejected/approved state;
- dashboard;
- course ownership;
- course creation/editing;
- lesson/quiz management;
- student/enrollment visibility according to policy;
- messages;
- role boundaries.

## Admin

- dashboard;
- users;
- teacher applications;
- courses;
- categories;
- reviews;
- certificates;
- orders;
- coupons;
- subscriptions;
- messages/moderation;
- audit logs;
- status/role changes;
- denial of access to non-admins.

## Realtime

- socket connection;
- reconnect;
- logout identity cleanup;
- chat;
- notifications;
- moderation;
- no unauthorised room access;
- no duplicate listeners/messages.

## Payments

- server-owned amount;
- valid coupon;
- invalid/expired/overused coupon;
- successful webhook;
- repeated webhook;
- failed payment;
- cancellation/refund behaviour supported by current app;
- no browser-only enrolment success.

## Responsive/accessibility

Test representative pages at:

- 360px;
- 768px;
- 1024px;
- desktop.

Test keyboard-only navigation for login, dashboards, dialogs, tables, and forms.

Record results in:

```text
docs/refactor/qc-report.md
```

---

# Phase 19 — PR preparation

Prepare a PR-quality summary in:

```text
docs/refactor/pr-description.md
```

Use these headings:

## Summary

## Why this work was needed

## Architecture changes

## Security changes

## Files moved, merged, split, or removed

## Behaviour preserved

## Tests added

## Commands run

## Manual QC completed

## Database or migration impact

## Environment-variable impact

## Deployment impact

## Risks

## Rollback plan

## Follow-up work not included

Include a file-move/deletion table and a concise risk matrix.

Do not claim zero risk.

---

# Required deliverables

At minimum, leave the repository with:

1. Professional project-specific README.
2. Verified clean folder/file structure.
3. Secure authentication and authorisation boundaries.
4. Hardened API handlers and server actions.
5. Hardened Stripe and Socket.IO flows.
6. Consistent validation and error handling.
7. Verified dead-code and comment cleanup.
8. Useful architecture, security, deployment, and testing docs.
9. Automated lint, typecheck, test, and build scripts.
10. CI workflow.
11. Critical security and permission tests.
12. Regression/QC report.
13. PR description.
14. No real secrets.
15. No broken existing functionality.

---

# Change classification

For every meaningful finding, classify it as:

- **Fixed now — low risk**
- **Fixed now — tested structural change**
- **Documented follow-up — medium/high risk**
- **Not an issue after verification**
- **Blocked by missing external configuration**
- **Blocked by missing product decision**

Do not silently ignore unresolved findings.

---

# Final response format

When finished, respond with only these headings:

## Executive summary

## Security findings fixed

## Architecture and cleanup completed

## Files moved, merged, split, or removed

## Tests and QC results

## Commands run

## Database and environment impact

## Deployment steps for me

## PR review notes

## Remaining risks or follow-ups

Under `Files moved, merged, split, or removed`, include the reason and evidence for every deletion.

Under `Tests and QC results`, distinguish automated tests from manual checks.

Do not output secrets, full environment values, tokens, password hashes, cookies, or sensitive production data.
