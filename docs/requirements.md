# LMS Platform Requirements for Next.js + Prisma + PostgreSQL

## Project Goal

Build a full LMS platform similar to Udemy using **Next.js**, **TypeScript**, **Prisma**, and **PostgreSQL**.

The platform should support students, teachers/instructors, and admins. The design can be basic and simple for the first version, but the system architecture, database models, API structure, permissions, and core functionality should be clean, scalable, and production-ready.

The system should be built with a **free or near-free development process**. Paid services should be optional and replaceable later when the platform gets real users, traffic, and revenue.

---

## Important Instruction for Claude AI

You are building a complete LMS platform. Do not only create UI pages. Implement the full backend logic, database models, authentication, role permissions, course management, video access control, quiz system, payment structure, coupon system, student progress tracking, teacher dashboard, admin dashboard, and dynamic certificate generation.

The visual design can be basic for now. Use clean, responsive, minimal UI with reusable components. The main priority is functionality, architecture, maintainability, and future scalability.

Use placeholder environment variables in `.env.example`. I will provide real credentials later in `.env`.


### Claude Execution Workflow Instruction

The Markdown file is the single source of truth for the project. Claude should not ask me to repeat requirements that are already written in this file.

When I give this file to Claude, Claude should work like this:

1. Read this full requirements file first.
2. Build one phase at a time only.
3. Start with Phase 1 only unless I explicitly ask for another phase.
4. Do not generate the entire LMS in one response.
5. Use limited tokens and avoid long theory.
6. Prioritise complete functionality, security, database structure, API logic, and permissions.
7. Keep the UI very basic and clean using shadcn/ui.
8. Do not compromise functionality. Only compromise advanced visual design.
9. Use environment variables only. Never hard-code credentials, secrets, provider keys, URLs, or API tokens.
10. Create and maintain `.env.example` with placeholder values.
11. After each phase, provide only:
   - Files created or updated
   - Short setup commands
   - Short testing instructions
   - Any missing credentials I need to add to `.env`
12. When continuing to the next phase, reuse existing code and avoid rewriting files unnecessarily.
13. If a feature is too large, implement the smallest fully working version first, then improve it in the next step.
14. Do not add premium/paid services by default. Keep everything local/free where possible, but keep provider abstraction for future upgrades.

Recommended Claude start command:

```txt
Read this attached lms_nextjs_prisma_requirements.md file carefully. Build this LMS SaaS according to the file. Use limited tokens, do not compromise functionality, compromise only on design, and use basic shadcn/ui. Build one phase at a time. Start with Phase 1 only.
```

Recommended Claude continue command after each completed phase:

```txt
Continue with the next phase. Keep the same rules: limited tokens, full functionality, basic design only, and follow the requirements file as the source of truth.
```


### Claude Token-Saving Development Instruction

Because this project will be built with Claude AI, keep token usage low during implementation.

Claude should follow these rules:

- Do not generate long design explanations unless requested.
- Build the project module by module.
- Before editing a file, inspect only the necessary files.
- Reuse existing components, utilities, services, and Prisma models instead of rewriting large files.
- Keep UI basic and functional because advanced design will be improved later manually.
- Use shadcn/ui components instead of writing large custom UI from scratch.
- When creating code, output only the required files or patches, not repeated full-project explanations.
- Keep comments useful but short.
- Avoid unnecessary animations, complex landing page sections, and heavy visual polish in the first version.
- Prioritise working backend logic, security, permissions, database relations, API routes, and tests over fancy UI.
- If a feature is large, implement the smallest working version first, then improve it step by step.
- Do not add paid services by default. Use local/free development options and `.env.example` placeholders.


---

### Server-Side Validation & Mutation Convention

Never trust client-side validation as the source of truth. It is UX only. Every mutation must be
independently validated and authorized on the server, because any client (browser devtools, curl,
a modified mobile app) can bypass the UI entirely.

Concretely, for every page that writes data:

- Business logic (Zod validation, permission checks, Prisma writes) lives in a **service function**
  under `src/server/services/*`, never inline in a component and never only in the client.
- The web app's own forms call that service through a **Next.js Server Action**
  (`"use server"`, co-located as `actions.ts` next to the `page.tsx` that uses it), not a client
  `fetch()` call to a JSON API route. Server Actions keep the mutation code out of the client
  bundle entirely, work without JavaScript (progressive enhancement), and get Next.js's built-in
  origin/CSRF check for free - a hand-rolled `fetch()`-to-API-route does not.
- Client components stay as thin as possible: `useActionState` for pending/error state,
  `useFormStatus` for the submit button, plain `<form action={...}>` - no manual `fetch`,
  `useState` loading flags, or client-side-only validation as the enforcement point. Client-side
  Zod/react-hook-form is fine to keep for instant UX feedback on more complex forms, but it is
  never a substitute for the server check.
- The `/api/v1/*` JSON routes still exist and stay as thin wrappers calling the **same** service
  functions, because the requirements above call for a mobile-ready API. Web UI and mobile clients
  must not end up with two different implementations of the same business rule.

Reference implementation from Phase 1: `src/server/services/auth-service.ts` and
`src/server/services/teacher-service.ts`, used by both `src/app/(public)/login/actions.ts` (Server
Action) and `src/app/api/v1/auth/register/route.ts` (JSON API), so registration/login validation
and password hashing exist in exactly one place.

Apply this same pattern in every later phase (course creation, quiz submission, checkout, coupons,
etc.): service function first, Server Action for the web form, API route delegates to the same
service.

---

### Instant UI Updates After Mutations (no manual reload)

Next.js Server Actions do **not** automatically refresh other pages' cached Server Component data -
only the `useActionState` return value updates on the client. Without explicit revalidation, a
mutation can succeed in the database while every other open page (and the same page after a soft
navigation) keeps showing stale data until a hard reload. This is easy to miss because testing a
Server Action with `curl` always looks correct (`curl` makes a fresh request every time), which is
exactly what masked this bug through Phase 1 and 2 - real browser testing in the actual app caught
it.

The fix: **every mutating function in `src/server/services/*` must call `revalidatePath()`** (from
`next/cache`) for every route that displays the data it just changed, right after the write
succeeds. Do this in the service layer, not in the Server Action or API route, so both call sites
get it for free and there is exactly one list of "who reads this data" to maintain. See
`revalidateCoursePaths()` in `src/server/services/course-service.ts` for the pattern - a small
per-entity helper listing every page (teacher, admin, and public) that shows that entity.

Two things `revalidatePath` does **not** fix, because they are different caches:

- **Session/JWT claims** (roles, status) only refresh on next sign-in, not on `revalidatePath`.
  Example: approving a teacher application updates the DB immediately (and the admin's queue
  reflects it instantly), but the *approved user's own* browser session still carries their old
  role claims until they log in again. A future phase should consider a "refresh my session" action
  if this friction matters, but it is out of scope for now - don't treat it as the same bug as stale
  page data.
- **Dev-mode first-compile latency.** In `next dev` with Turbopack, the *first* request to any given
  route/action can take several seconds to tens of seconds while it compiles on demand; the same
  route is fast on every request after. This is a dev-only artifact (`next build` + `next start`
  precompiles everything) - don't mistake it for a real performance regression.

---

### Permission Scoping: Admin Reviews, Owner Edits

When a resource has both an **owner** (teacher/creator) and an **admin review step** (approve/
reject/publish), the owner-only mutation checks (e.g. `canManageCourse`) must **not** grant a
blanket admin bypass, even though it's tempting to let admins "manage everything" for support
purposes. Admin's power over that resource is limited to whatever the review workflow explicitly
grants (`canAdminAccess`-gated actions: approve/reject/publish/unpublish) - never direct content
edits. Route-level access (proxy/layout redirect checks) can stay permissive for admins so they can
see the shell for context, but the actual data/mutation-layer permission check is what must be
strict. Apply this same split for every future owner+admin-reviewed resource (e.g. quizzes).

---

### Post-Login Redirect Must Match the User's Own Role

`callbackUrl` (where to send the user after login) must never be honored blindly. If an
unauthenticated visit to a role-gated URL (e.g. `/student/dashboard`) redirects to
`/login?callbackUrl=/student/dashboard`, and the person who actually logs in there turns out to be
a teacher or admin, redirecting them into `/student/dashboard` afterward is wrong even though they
may be *permitted* to view it - it's simply not their own dashboard. Use
`resolveLoginDestination()` / `getRoleHome()` in `src/lib/role-home.ts`: a requested callback is
only honored as-is when it is *not* one of the role-gated dashboard prefixes (`/student`,
`/teacher`, `/admin`); otherwise the user is sent to their own role's home. Reuse `getRoleHome()`
anywhere else a "go to my dashboard" link is needed (see `SiteHeader`) instead of re-deriving it.

---

### Base UI Component Gotchas (shadcn/ui is Base UI, not Radix, in this project)

Two recurring console warnings from `@base-ui/react`, both fixed at the shared-component level so
individual call sites don't need to think about them:

- **`<Button render={<Link .../>}>` needs `nativeButton={false}`.** Base UI's `Button` assumes it
  renders a real `<button>` (`nativeButton` defaults `true`) and warns whenever `render` points to
  something else (an `<a>` via `next/link`, which is how every nav-styled-as-a-button in this app
  works). Fixed once in `src/components/ui/button.tsx`: `nativeButton` now defaults to `!render`
  unless the caller overrides it. Don't add `nativeButton={false}` manually at call sites - it's
  automatic.
- **"changing the default value state of an uncontrolled FieldControl after being initialized."**
  Any *always-mounted* form (a settings-style form with no edit/cancel toggle) whose `Input`/
  `Textarea` `defaultValue` is derived from a server-fetched prop will trigger this the moment that
  prop's underlying record changes and the page re-renders after a `revalidatePath` (e.g. saving the
  form updates the very record whose fields feed its own `defaultValue`). The fix is to `key` the
  form on something that only changes when its own record changes (e.g. `key={record.updatedAt.getTime()}`)
  so React remounts it with a fresh initial value instead of feeding a changed `defaultValue` into a
  live instance. See `CourseDetailsForm`, `QuizSettingsForm`, and `ReviewForm` for the pattern.
  Forms that toggle between a read view and an edit view via `if (editing) return <form>...` (most
  add/rename/delete rows in this app) are naturally immune, since toggling `editing` already
  unmounts/remounts the form - no key needed there.

### "Effective Price" Convention: Always `salePrice ?? price`, Never Raw `price`

A course's real price for every purpose (which enroll/buy button renders, whether self-enroll is
allowed, checkout subtotal) is `Number(course.salePrice ?? course.price)`, never `course.price`
alone. `order-service.ts`'s `createCheckoutSession` already computed it this way; the course detail
page's button logic (free `EnrollButton` vs paid `CheckoutButton`) also already used it. But
`enrollment-service.ts`'s `enrollInFreeCourse` only checked raw `price`, so a course with a
positive `price` and a `salePrice` of `0` showed the free Enroll button (page said effective price
0) while the server rejected it with "This course requires payment" (guard only saw the non-zero
`price`). Fixed by computing the same `effectivePrice` in `enrollInFreeCourse`. Any new code path
that needs to know "is this course free" must reuse this same expression, not re-derive it from
`price` alone.

---

## Recommended Tech Stack

### Core Stack

- Next.js App Router
- TypeScript
- Prisma ORM
- PostgreSQL
- Tailwind CSS
- shadcn/ui component system
- next-themes for light, dark, and system theme mode
- Zod for validation
- React Hook Form for forms
- Auth.js / NextAuth for authentication
- Credentials login with email/password
- Google/Gmail OAuth login
- GitHub OAuth login
- Stripe for payments, optional at first but code should be ready
- Cloudflare R2 / S3-compatible storage for files and videos later
- Real-time Socket.IO chat in the first version
- PostgreSQL message persistence for chat history
- PDF generation for certificates

### Free Development Stack

Use free or local options during development:

- Local PostgreSQL with Docker or free Neon/Supabase PostgreSQL
- Vercel Hobby for hosting later
- Cloudflare R2 free tier for file storage later
- Stripe test mode for payment testing
- Resend free tier or SMTP for emails later
- Real-time Socket.IO chat in the first version with PostgreSQL message persistence

---

## Main Product Modules

The LMS must include these main modules:

1. Authentication and user management
2. Role-based access control
3. Public course marketplace
4. Student dashboard
5. Teacher/instructor dashboard
6. Admin dashboard
7. Course creation and publishing workflow
8. Course section and lesson management
9. Video lesson support
10. File attachment support
11. Quiz and question system
12. Course purchase system
13. Subscription system
14. Coupon and discount system
15. Student enrollment system
16. Lesson progress tracking
17. Course completion tracking
18. Dynamic certificate generation
19. Reviews and ratings
20. Wishlist
21. Real-time Socket.IO chat/messaging system
22. Notifications
23. Audit logs
24. Settings management
25. Mobile-app-ready API structure

---

## User Roles

The platform should support role-based access control.

### Roles

- Student
- Teacher / Instructor
- Admin
- Super Admin
- Moderator, optional for later
- Support Staff, optional for later

### Permission Examples

Use permission checks instead of only checking direct role names.

Examples:

- `course:create`
- `course:update-own`
- `course:delete-own`
- `course:submit-review`
- `course:approve`
- `course:reject`
- `course:publish`
- `teacher:approve`
- `teacher:reject`
- `user:ban`
- `user:unban`
- `coupon:create`
- `coupon:update`
- `coupon:delete`
- `order:view`
- `order:refund`
- `chat:moderate`
- `certificate:generate`
- `admin:access`

---

## Environment Variables

Create `.env.example` with placeholder values only. Real values will be added later in `.env`.

```env
# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
APP_NAME="LMS Platform"
NODE_ENV="development"

# Database
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"

# Auth.js / NextAuth
AUTH_SECRET="replace-with-secure-secret"
AUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-secure-secret"
NEXTAUTH_URL="http://localhost:3000"

# OAuth Providers, optional
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

# Email, optional
EMAIL_FROM="noreply@example.com"
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""
RESEND_API_KEY=""

# Stripe, optional during development
STRIPE_SECRET_KEY=""
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
STRIPE_WEBHOOK_SECRET=""

# File Storage - S3 / Cloudflare R2 compatible
STORAGE_PROVIDER="local"
S3_ENDPOINT=""
S3_REGION="auto"
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
S3_BUCKET_NAME=""
S3_PUBLIC_URL=""

# Video Provider, optional future upgrade
VIDEO_PROVIDER="local"
MUX_TOKEN_ID=""
MUX_TOKEN_SECRET=""
CLOUDFLARE_STREAM_ACCOUNT_ID=""
CLOUDFLARE_STREAM_API_TOKEN=""

# Redis, optional for Socket.IO scaling, rate limiting, queues, and caching
REDIS_URL=""
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""

# Socket.IO / Realtime Chat
NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
SOCKET_SERVER_URL="http://localhost:3001"
SOCKET_CORS_ORIGIN="http://localhost:3000"

# UI Theme
NEXT_PUBLIC_DEFAULT_THEME="system"

# Certificate
CERTIFICATE_SIGNER_NAME="Platform Admin"
CERTIFICATE_SIGNER_TITLE="Course Director"
CERTIFICATE_BRAND_LOGO_URL=""

# Security
RATE_LIMIT_ENABLED="false"
ADMIN_EMAIL="admin@example.com"
```

---

## High-Level Architecture

Use a modular monolith architecture.

```txt
Next.js App Router
  |
  |-- Public website
  |-- Student dashboard
  |-- Teacher dashboard
  |-- Admin dashboard
  |
API Layer
  |
  |-- Auth module
  |-- User module
  |-- Course module
  |-- Lesson module
  |-- Video module
  |-- Quiz module
  |-- Payment module
  |-- Subscription module
  |-- Coupon module
  |-- Certificate module
  |-- Chat module
  |-- Notification module
  |-- Admin module
  |
PostgreSQL + Prisma
Socket.IO realtime server
Redis optional for Socket.IO scaling later
Local/R2/S3 file storage
Stripe test/live mode
```

---

## Recommended Folder Structure

```txt
src/
  app/
    (public)/
      page.tsx
      courses/
      courses/[slug]/
      categories/[slug]/
      pricing/
      login/
      register/

    student/
      dashboard/
      my-courses/
      course/[courseId]/learn/
      quiz/[quizId]/
      certificates/
      wishlist/
      messages/
      billing/

    teacher/
      dashboard/
      courses/
      courses/create/
      courses/[courseId]/edit/
      students/
      messages/
      revenue/
      settings/

    admin/
      dashboard/
      users/
      teachers/
      courses/
      orders/
      subscriptions/
      coupons/
      categories/
      certificates/
      reports/
      audit-logs/
      settings/

    api/
      v1/
        auth/
        users/
        courses/
        lessons/
        videos/
        enrollments/
        quizzes/
        orders/
        subscriptions/
        coupons/
        certificates/
        chat/
        notifications/
        admin/
        webhooks/

  components/
    ui/
    layout/
    course/
    lesson/
    dashboard/
    forms/
    certificate/
    theme/

  modules/
    auth/
    users/
    courses/
    lessons/
    videos/
    quizzes/
    payments/
    subscriptions/
    coupons/
    certificates/
    chat/
    notifications/
    admin/

  server/
    services/
    repositories/
    policies/
    validators/

  lib/
    prisma.ts
    auth.ts
    permissions.ts
    storage.ts
    stripe.ts
    email.ts
    certificate.ts
    socket.ts
    theme.ts
    utils.ts

  types/
  hooks/
    use-socket.ts
    use-theme.ts
  utils/

socket-server/
  index.ts
  auth.ts
  events/
    chat.events.ts
  adapters/
    redis.adapter.ts
```

---

## Public Website Features

The public website should include:

- Home page
- Course listing page
- Course detail page
- Category pages
- Teacher profile page
- Pricing/subscription page
- Login page
- Registration page
- Search and filtering
- Course reviews and ratings
- Free preview lesson indicator
- Course price and discount display
- CTA buttons:
  - Buy Course
  - Enroll Now
  - Start Learning
  - Subscribe

---

## Authentication Features

The first version must include secure authentication using Auth.js / NextAuth.

### Required Login Methods

The platform must support these login methods from the first version:

- Credentials login with email and password
- Google/Gmail OAuth login
- GitHub OAuth login
- Logout
- Protected routes
- Role-based route access
- User status check before dashboard/API access

### Credentials Login Requirements

For email/password login:

- Hash passwords with bcrypt or Argon2.
- Never store plain text passwords.
- Validate all auth inputs with Zod.
- Prevent login for banned, suspended, or deleted users.
- Return safe error messages without exposing whether an email exists.
- Add basic rate limiting for repeated login attempts if Redis/Upstash is configured.

### OAuth Login Requirements

For Google/Gmail and GitHub login:

- Use Auth.js / NextAuth providers.
- Store OAuth accounts in the `Account` model.
- Link OAuth accounts to the same user email where safe and supported.
- If a new OAuth user registers, assign the default role as `Student`.
- Allow users to later apply as teacher from the dashboard.
- Do not automatically make OAuth users teachers or admins.

### User Statuses

User statuses:

- Active
- Suspended
- Banned
- Deleted

Banned users should not be able to access courses, videos, chat, quizzes, certificates, payments, or dashboards.

### Auth Pages

Create these pages:

```txt
/login
/register
/forgot-password
/reset-password
/auth/error
```

The login page should show:

- Email/password login form
- Continue with Google/Gmail button
- Continue with GitHub button
- Link to registration page
- Link to forgot password page

---

## Student Features

Student dashboard should include:

- Overview dashboard
- My courses
- Continue learning section
- Course progress percentage
- Last watched lesson
- Course learning page
- Video lesson player
- Text lessons
- Downloadable attachments
- Quiz attempts
- Quiz results
- Certificates
- Wishlist
- Reviews submitted by student
- Messages with teacher
- Billing/order history
- Subscription status
- Profile settings

### Student Learning Flow

```txt
Student registers or logs in
  ↓
Browses courses
  ↓
Buys course or subscribes
  ↓
Enrollment is created
  ↓
Student starts course
  ↓
Lesson progress is tracked
  ↓
Student attempts quiz
  ↓
Course completion is calculated
  ↓
Certificate is generated dynamically
```

---

## Teacher Features

Teacher dashboard should include:

- Teacher application/profile setup
- Teacher approval status
- Course creation
- Course editing
- Course section builder
- Lesson builder
- Video lesson upload or video URL support
- Text lesson support
- Attachment upload support
- Quiz builder
- Course requirements
- Course outcomes
- Course pricing
- Course thumbnail upload
- Submit course for admin review
- View published courses
- View enrolled students
- View student progress
- View student quiz results
- Reply to student messages
- Course announcements, optional later
- Revenue dashboard, basic version

### Teacher Approval Flow

```txt
User applies as teacher
  ↓
TeacherProfile status = PENDING
  ↓
Admin reviews application
  ↓
Admin approves or rejects
  ↓
Approved teacher can create and submit courses
```

---

## Admin Features

Admin dashboard should include:

- Overview analytics
- User management
- Student management
- Teacher management
- Approve/reject teacher
- Ban/unban users
- Course management
- Approve/reject courses
- Publish/unpublish courses
- Category management
- Coupon management
- Order management
- Subscription plan management
- Enrollment management
- Certificate management
- Chat/message moderation
- Reports and abuse reports, optional later
- Platform settings
- Audit logs

Admin must be able to:

- Create category
- Edit category
- Delete category
- Approve teacher
- Reject teacher
- Ban user
- Unban user
- Approve course
- Reject course with reason
- Feature course
- Archive course
- Create coupon
- Disable coupon
- View orders
- View subscriptions
- Manually grant course access
- Revoke access if needed

Every sensitive admin action must create an audit log.

---

## Course Management Features

Course should include:

- Title
- Slug
- Subtitle
- Description
- Thumbnail
- Preview video, optional
- Category
- Level:
  - Beginner
  - Intermediate
  - Advanced
  - All Levels
- Language
- Price
- Sale price
- Subscription included flag
- Requirements
- Learning outcomes
- Target audience
- Sections
- Lessons
- Quizzes
- Attachments
- Status
- Published date

Course statuses:

- Draft
- In Review
- Approved
- Published
- Rejected
- Archived

### Course Publishing Workflow

```txt
Teacher creates course
  ↓
Course status = DRAFT
  ↓
Teacher adds sections, lessons, quizzes, videos, and details
  ↓
Teacher submits course for review
  ↓
Course status = IN_REVIEW
  ↓
Admin approves or rejects
  ↓
If approved, course can be PUBLISHED
  ↓
Students can buy or enroll
```

---

## Lesson Features

Lesson types:

- Video
- Text
- Quiz
- Assignment, optional later

Each lesson should include:

- Title
- Course ID
- Section ID
- Lesson type
- Content
- Video asset reference
- Duration in seconds
- Sort order
- Preview/free flag
- Attachments
- Completion tracking

---

## Video Features

For free development, support simple video methods first.

### MVP Video Options

Support one or more:

1. Local video URL for development
2. External video URL
3. Cloudflare R2/S3 file URL later
4. Future provider support for Mux/Cloudflare Stream

Do not store video files inside PostgreSQL.

Store only metadata:

- Provider
- Provider asset ID
- Playback URL
- Duration
- Status
- Lesson ID
- Uploaded by

Video statuses:

- Uploading
- Processing
- Ready
- Failed

### Video Access Control

Before returning a video URL, the backend must check:

- Is user logged in?
- Is user banned?
- Is lesson preview?
- Is course published?
- Has user purchased the course?
- Does user have an active subscription?
- Has admin manually granted access?

---

## Quiz Features

Quiz system should include:

- Quiz creation by teacher
- Quiz attached to course or lesson
- Multiple questions
- Question types:
  - Single choice
  - Multiple choice
  - True/false
  - Short text, optional later
- Question options
- Correct answer marking
- Point value
- Passing score
- Max attempts
- Time limit, optional
- Student quiz attempt
- Auto scoring
- Pass/fail status
- Attempt history

### Quiz Flow

```txt
Student opens quiz
  ↓
System checks course access
  ↓
Student starts quiz attempt
  ↓
Student submits answers
  ↓
System calculates score
  ↓
System stores attempt and answers
  ↓
If score is enough, quiz is marked passed
```

---

## Certificate Generation Features

The LMS must support dynamic certificate generation.

### Certificate Requirements

Generate certificate when:

- Student is enrolled in the course
- Student completes required lessons
- Student passes required quizzes
- Course completion percentage reaches the required threshold
- User is not banned

### Certificate Data

Certificate should include:

- Certificate ID
- Student name
- Course title
- Teacher name
- Completion date
- Issue date
- Platform name
- Unique certificate number
- Verification URL
- QR code, optional but recommended
- Instructor signature text/image, optional
- Platform/admin signature text/image, optional

### Certificate Features

- Generate certificate dynamically as PDF
- Save certificate record in database
- Allow student to download PDF
- Allow public verification by certificate ID
- Admin can view issued certificates
- Admin can revoke certificate if needed
- Regeneration should not create duplicates unless explicitly requested

### Certificate URL Structure

```txt
/student/certificates
/student/certificates/[certificateId]
/certificates/verify/[certificateNumber]
/api/v1/certificates/generate
/api/v1/certificates/[certificateId]/download
```

### Certificate Completion Logic

Create a function:

```ts
canGenerateCertificate(userId: string, courseId: string)
```

It should check:

```txt
1. User is enrolled
2. User is active and not banned
3. Course is published
4. Required lessons are completed
5. Required quizzes are passed
6. Certificate was not already issued, unless regenerating
```

### Certificate Design

The first design can be basic:

- White background
- Platform logo
- Certificate title
- Student name
- Course name
- Completion date
- Certificate number
- Verification link

Later the design can be improved.

---

## Payment Features

Use Stripe, but allow payment to be optional or disabled during development.

Payment features:

- One-time course purchase
- Stripe Checkout session creation
- Stripe webhook handling
- Order creation
- Order item creation
- Payment status update
- Auto enrollment after successful payment
- Failed payment handling
- Refund status support
- Coupon support

Order statuses:

- Pending
- Paid
- Failed
- Cancelled
- Refunded

Important rule:

Never mark an order as paid from the frontend. Only update payment status from Stripe webhook or trusted backend verification.

---

## Subscription Features

Subscription can be added after one-time course purchase works.

Subscription features:

- Monthly plan
- Yearly plan
- Active subscription access
- Subscription cancellation
- Subscription expired state
- Course included in subscription flag
- Subscription order history

Subscription statuses:

- Active
- Past Due
- Cancelled
- Expired
- Trialing, optional

Access logic:

```txt
If user has active subscription
  ↓
User can access all courses where isSubscriptionIncluded = true
```

Purchased courses should remain accessible even if subscription expires.

---

## Coupon Features

Admin should be able to create coupons.

Coupon fields:

- Code
- Discount type:
  - Percentage
  - Fixed amount
- Discount value
- Applies to:
  - All courses
  - Specific course
  - Subscription
- Max redemptions
- Per-user limit
- Start date
- Expiry date
- Active/inactive status

Coupon validation should check:

- Coupon exists
- Coupon is active
- Coupon is not expired
- Coupon has remaining redemptions
- User has not exceeded usage limit
- Coupon applies to selected course/subscription

---

## Enrollment Features

Enrollment can come from:

- Direct purchase
- Active subscription
- Admin manual grant
- Free course enrollment
- Coupon promotion

Enrollment statuses:

- Active
- Expired
- Refunded
- Cancelled
- Revoked

Enrollment must be unique per user and course.

---

## Progress Tracking Features

Track:

- Lesson watched seconds
- Lesson completed/not completed
- Course progress percentage
- Quiz passed/not passed
- Last watched lesson
- Course completion date

Progress should update from backend APIs, not only frontend state.

Recommended endpoint:

```txt
POST /api/v1/lessons/[lessonId]/progress
```

Payload example:

```json
{
  "watchedSeconds": 320,
  "completed": true
}
```

---

## Reviews and Ratings

Students should be able to review courses they are enrolled in.

Review fields:

- User ID
- Course ID
- Rating from 1 to 5
- Comment
- Created date
- Updated date

Rules:

- Only enrolled students can review
- One review per student per course
- Admin can hide/delete abusive reviews

---

## Wishlist Features

Students should be able to:

- Add course to wishlist
- Remove course from wishlist
- View wishlist from dashboard

Wishlist should be unique per user and course.

---

## Real-Time Chat and Messaging Features

The first version must include real-time chat using Socket.IO, while also saving all messages in PostgreSQL.

### Required First-Version Chat Features

- Student-to-teacher direct chat
- Teacher-to-student direct chat
- Course group chat
- Support/admin conversation type
- Conversation list
- Message thread
- Message persistence in PostgreSQL
- Read/unread status
- Basic read receipts
- Typing indicator
- Online/offline indicator, basic
- Admin moderation view, basic
- Soft delete message support
- Report message support, basic

### Socket.IO Requirements

Implement a Socket.IO server for realtime events.

Required events:

```txt
connection
disconnect
conversation:join
conversation:leave
message:send
message:new
message:read
typing:start
typing:stop
user:online
user:offline
```

### Chat Security Rules

Before sending or reading messages, the backend must check:

- User is authenticated
- User is active and not banned
- User is a participant in the conversation
- Student can only message teachers/admins connected to their course/enrollment where applicable
- Teacher can only access conversations connected to their own students/courses where applicable
- Admin/moderator can access moderation views according to permission

### Chat Storage Rules

Use PostgreSQL for permanent chat storage:

- Conversation
- ConversationParticipant
- Message
- MessageReadReceipt

Socket.IO should only handle real-time delivery. It should not be the source of truth.

### Scaling Note

For local development and MVP, Socket.IO can run as a separate Node.js server inside the same repository under `socket-server/`.

When the app grows, add Redis adapter for Socket.IO so multiple realtime servers can broadcast events correctly.

Conversation types:

- Direct
- Course group
- Support

---

## Notification Features

Basic notifications should be stored in the database.

Notification examples:

- Course approved
- Course rejected
- New student enrolled
- New message received
- Quiz passed
- Certificate issued
- Subscription expired
- Coupon applied

Notification statuses:

- Unread
- Read

Email notifications can be added later.

---

## Search and Filtering

For MVP, use PostgreSQL search/filtering.

Course filters:

- Keyword
- Category
- Level
- Price
- Free/paid
- Rating
- Teacher
- Language

Later upgrade to Meilisearch, Typesense, or Algolia if needed.

---

## API Requirements

Design API routes so that a future mobile app can use the same backend.

Recommended API structure:

```txt
/api/v1/auth/register
/api/v1/auth/login
/api/v1/users/me
/api/v1/courses
/api/v1/courses/[courseId]
/api/v1/courses/[courseId]/submit-review
/api/v1/courses/[courseId]/approve
/api/v1/courses/[courseId]/reject
/api/v1/lessons/[lessonId]
/api/v1/lessons/[lessonId]/progress
/api/v1/videos/[videoId]/playback
/api/v1/enrollments
/api/v1/quizzes/[quizId]
/api/v1/quizzes/[quizId]/attempts
/api/v1/orders/create-checkout
/api/v1/orders/[orderId]
/api/v1/subscriptions
/api/v1/coupons/validate
/api/v1/certificates/generate
/api/v1/certificates/[certificateId]/download
/api/v1/chat/conversations
/api/v1/chat/conversations/[conversationId]/messages
/api/v1/chat/conversations/[conversationId]/read
/api/v1/chat/conversations/[conversationId]/participants
/api/v1/admin/users
/api/v1/admin/users/[userId]/ban
/api/v1/admin/teachers/[teacherId]/approve
/api/v1/admin/courses/[courseId]/approve
/api/v1/admin/coupons
/api/v1/admin/audit-logs
/api/v1/webhooks/stripe
```

---

## Database Models Required

Create Prisma models for the following:

### User and Auth

- User
- Account
- Session
- VerificationToken
- Role
- UserRole
- TeacherProfile
- StudentProfile, optional
- UserBan

### Courses

- Course
- Category
- CourseCategory, if many-to-many
- CourseSection
- Lesson
- LessonAttachment
- VideoAsset
- CourseRequirement
- CourseOutcome
- CourseReview
- Wishlist

### Enrollment and Progress

- Enrollment
- LessonProgress
- CourseProgress, optional calculated or stored

### Quizzes

- Quiz
- Question
- QuestionOption
- QuizAttempt
- QuizAnswer

### Payments

- Order
- OrderItem
- Payment
- SubscriptionPlan
- Subscription
- Coupon
- CouponRedemption
- Refund, optional

### Certificates

- Certificate
- CertificateTemplate, optional

### Chat

- Conversation
- ConversationParticipant
- Message
- MessageReadReceipt

### Notifications and Admin

- Notification
- AuditLog
- Report, optional
- PlatformSetting

---

## Important Prisma Model Rules

- Use PostgreSQL as the main database.
- Use `cuid()` or `uuid()` for IDs.
- Add `createdAt` and `updatedAt` fields to important models.
- Add unique constraints where needed.
- Add indexes for frequently queried fields.
- Use transactions for payment, enrollment, coupon redemption, and certificate generation.
- Do not store video binary files in the database.
- Store only video metadata and file URLs.

---

## Core Access Control Functions

Create these server-side functions:

```ts
canAccessCourse(userId: string, courseId: string): Promise<boolean>
canAccessLesson(userId: string, lessonId: string): Promise<boolean>
canAttemptQuiz(userId: string, quizId: string): Promise<boolean>
canGenerateCertificate(userId: string, courseId: string): Promise<boolean>
canManageCourse(userId: string, courseId: string): Promise<boolean>
canAdminAccess(userId: string): Promise<boolean>
```

Do not duplicate access logic across pages. Keep access logic in one policy/service layer.

---

## Security Requirements

Implement:

- Password hashing with bcrypt or Argon2 for credentials login
- Google/Gmail OAuth login using Auth.js / NextAuth
- GitHub OAuth login using Auth.js / NextAuth
- Credentials login using Auth.js / NextAuth
- Strong `AUTH_SECRET` / `NEXTAUTH_SECRET`
- Server-side permission checks
- Input validation with Zod
- Protected API routes
- Protected dashboards
- Admin-only routes
- Teacher-only routes
- Student-only routes
- CSRF-safe forms where needed
- Basic rate limiting for login, registration, chat messages, and sensitive APIs
- Secure Socket.IO authentication before joining conversations
- Socket.IO room authorization before sending/receiving chat messages
- Secure file upload validation
- File type validation
- Max file size validation
- Stripe webhook signature verification
- Audit logs for admin actions
- No paid content access from frontend-only checks
- No certificate generation from frontend-only checks
- No admin action without audit logging

### Auth Security Rules

- Do not allow banned/suspended/deleted users to login or use existing sessions.
- Check user status on every protected server request.
- Never expose password hashes in API responses.
- Never expose OAuth access tokens to the frontend.
- Admin users should only be created manually by seed script or direct admin action, not public registration.

### Socket.IO Security Rules

- Authenticate socket connections using the current session/JWT.
- Disconnect unauthenticated users.
- Re-check database user status on connection.
- Do not allow users to join arbitrary conversation rooms.
- Validate conversation membership before `conversation:join`.
- Validate message payloads with Zod before saving.
- Rate limit chat message sending.

---

## UI Design Requirement

Design can be basic for now, but use a clean component system from the start.

### Required UI Stack

Use:

- Tailwind CSS
- shadcn/ui
- Radix UI components through shadcn/ui
- lucide-react icons
- next-themes for theme switching

### Theme Requirements

The platform must support:

- Light mode
- Dark mode
- System mode
- Theme toggle in the header or user menu
- Theme persistence across sessions
- Correct theme styling across public pages and dashboards

Default theme should be:

```txt
system
```

### UI Requirements

- Clean layout
- Mobile responsive
- Simple dashboard UI
- Reusable shadcn/ui cards, tables, buttons, forms, inputs, badges, dropdowns, dialogs, sheets, tabs, toasts, and modals
- Sidebar layouts for student, teacher, and admin dashboards
- Basic loading states
- Basic empty states
- Basic error states
- Toast notifications for important actions
- No need for advanced animation now

Use Tailwind CSS and shadcn/ui reusable components. Avoid hard-coding repeated UI patterns.

Advanced visual design, custom branding, complex animations, and premium landing page design are not required in the first version. Keep the interface clean, accessible, responsive, and easy to replace later.

### shadcn/ui Setup Requirements

Claude should initialise shadcn/ui and use it for the main interface components.

Required components to add/use:

```txt
button
input
label
textarea
select
checkbox
radio-group
card
table
badge
dialog
dropdown-menu
sheet
tabs
toast/sonner
avatar
progress
separator
skeleton
alert
```

Theme provider should wrap the application layout so public pages and all dashboards support light, dark, and system mode.

---

## Pages to Build

### Public Pages

```txt
/
/courses
/courses/[slug]
/categories/[slug]
/teachers/[username]
/pricing
/login
/register
/certificates/verify/[certificateNumber]
```

### Student Pages

```txt
/student/dashboard
/student/my-courses
/student/course/[courseId]/learn
/student/quiz/[quizId]
/student/certificates
/student/certificates/[certificateId]
/student/wishlist
/student/messages
/student/billing
/student/settings
```

### Teacher Pages

```txt
/teacher/dashboard
/teacher/apply
/teacher/courses
/teacher/courses/create
/teacher/courses/[courseId]/edit
/teacher/courses/[courseId]/sections
/teacher/courses/[courseId]/lessons
/teacher/courses/[courseId]/quizzes
/teacher/students
/teacher/messages
/teacher/revenue
/teacher/settings
```

### Admin Pages

```txt
/admin/dashboard
/admin/users
/admin/teachers
/admin/courses
/admin/categories
/admin/orders
/admin/subscriptions
/admin/coupons
/admin/enrollments
/admin/certificates
/admin/messages
/admin/audit-logs
/admin/settings
```

---

## MVP Build Order

Build the system in this order:

### Phase 1: Foundation

- Next.js setup
- Tailwind setup
- shadcn/ui setup
- next-themes light/dark/system setup
- Prisma setup
- PostgreSQL setup
- Auth setup with credentials, Google/Gmail, and GitHub login
- Role and permission setup
- Public layout
- Dashboard layouts

### Phase 2: Course System

- Category CRUD
- Course CRUD
- Section CRUD
- Lesson CRUD
- Video metadata
- Course status workflow
- Admin course approval

### Phase 3: Student Learning

- Course listing
- Course detail page
- Enrollment
- Learning page
- Lesson access control
- Progress tracking
- Reviews
- Wishlist

### Phase 4: Quiz System

- Teacher quiz builder
- Question builder
- Student quiz attempt
- Auto scoring
- Attempt history

### Phase 5: Certificate System

- Completion check
- Certificate record creation
- Dynamic PDF generation
- Certificate download
- Public certificate verification
- Admin certificate management

### Phase 6: Payment System

- Stripe Checkout
- Orders
- Order items
- Payment webhook
- Auto enrollment
- Coupons

### Phase 7: Subscription System

- Subscription plans
- Stripe subscription checkout
- Subscription webhook
- Subscription access logic

### Phase 8: Realtime Messaging and Notifications

Real-time Socket.IO chat is required in the first complete version, not only a future upgrade.

- Socket.IO realtime server
- Direct student-teacher messages
- Course group chat
- Conversation list
- Message persistence in PostgreSQL
- Message read status
- Typing indicator
- Basic notifications

### Phase 9: Admin Polish

- User banning
- Teacher approval
- Course approval
- Coupon management
- Order management
- Audit logs

---

## Acceptance Criteria

The first full version is complete when the following flow works:

```txt
1. User can register as student using credentials.
2. User can login using credentials, Google/Gmail, or GitHub.
3. User can switch between light, dark, and system theme.
4. User can apply as teacher.
5. Admin can approve teacher.
6. Teacher can create a course.
7. Teacher can add sections and lessons.
8. Teacher can add video/text lessons.
9. Teacher can create quiz questions.
10. Teacher can submit course for review.
11. Admin can approve course.
12. Public users can view course detail page.
13. Student can buy/enroll in course.
14. Student can watch lessons.
15. Student progress is saved.
16. Student can attempt quiz.
17. Student can complete course.
18. Certificate is generated dynamically.
19. Student can download certificate PDF.
20. Public certificate verification page works.
21. Student can review course.
22. Student can message teacher in real time using Socket.IO.
23. Teacher can reply in real time using Socket.IO.
24. Course group chat works in real time.
25. Chat messages are saved in PostgreSQL.
26. Admin can moderate messages.
27. Admin can ban/unban users.
28. Admin can create coupons.
29. Coupon can be applied during purchase.
30. Admin actions are stored in audit logs.
```

---

## Things Not Required in First Version

These can be added later:

- Advanced UI design
- Mobile app
- Live classes
- AI recommendations
- Teacher payout automation
- Affiliate system
- Complex DRM
- Advanced analytics
- Multi-language support
- Native push notifications
- Advanced chat features beyond MVP, such as voice messages, reactions, and advanced moderation automation

However, the database and API should be designed so these can be added later.

---

## Final Development Rule

Build functionality first with a simple clean UI. Avoid overengineering, but do not compromise the database structure, permissions, access control, payment security, or certificate logic.

The platform should be simple enough to build as a solo/mid-level engineer, but structured enough to scale into a serious LMS business later.
