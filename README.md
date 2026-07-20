# NUB Academy LMS

A production-oriented, role-based learning management system built with Next.js. NUB Academy supports the complete learning lifecycle: course publishing, student enrollment, quizzes, progress tracking, certificates, payments, subscriptions, and real-time messaging.

## Table of contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Database workflow](#database-workflow)
- [Available commands](#available-commands)
- [User roles](#user-roles)
- [Testing and quality checks](#testing-and-quality-checks)
- [Deployment](#deployment)
- [Security guidelines](#security-guidelines)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Features

- Email/password authentication with email verification and password recovery
- Google and GitHub OAuth authentication
- Role-based access for students, teachers, support staff, administrators, and super administrators
- Teacher application and administrator approval workflow
- Course creation, categorization, review, publishing, and instructor assignment
- Structured sections, lessons, video playback, and student progress tracking
- Quizzes, attempts, scoring, and course-completion certificates
- Free and paid enrollment, coupons, Stripe checkout, refunds, and subscriptions
- Course ratings, reviews, and wishlists
- Real-time direct, course, and support messaging with notifications
- Administrative dashboards, moderation tools, audit logs, and platform settings
- Responsive public catalog and role-specific dashboards

## Technology stack

| Area | Technology |
| --- | --- |
| Web application | Next.js 16 App Router, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Authentication | Auth.js / NextAuth 5 |
| Database | PostgreSQL, Prisma 7 |
| Validation | Zod |
| Payments | Stripe |
| Email | Resend |
| Real-time communication | Socket.IO |
| Testing | Vitest |
| CI | GitHub Actions |

## Architecture

The repository contains two deployable services that share the same PostgreSQL database and authentication secret:

1. **Next.js application** — pages, Server Actions, API routes, authentication, business logic, and the web interface. It runs locally on port `3000` and can be deployed to Vercel or another Node.js-compatible platform.
2. **Socket.IO server** — the persistent process under `socket-server/` that handles chat and real-time notifications. It runs locally on port `3001` and must be deployed to a host that supports long-running Node.js processes.

In production, both services must use matching `DATABASE_URL`, `AUTH_SECRET`, and `SOCKET_INTERNAL_SECRET` values. The browser-facing application connects to the socket service through `NEXT_PUBLIC_SOCKET_URL`.

## Project structure

```text
.
├── prisma/
│   ├── migrations/          # Versioned PostgreSQL migrations
│   ├── schema.prisma        # Database schema
│   └── seed.ts              # Roles and demonstration catalog data
├── public/                  # Static images and course assets
├── socket-server/           # Standalone Socket.IO service
├── src/
│   ├── app/                 # App Router pages, API routes, and Server Actions
│   ├── components/          # Reusable interface components
│   ├── generated/prisma/    # Generated Prisma client (not committed)
│   ├── hooks/               # Client-side React hooks
│   ├── lib/                 # Authentication, permissions, and shared utilities
│   └── server/              # Server-side services and data access
├── test/                    # Test support and test suites
├── next.config.ts           # Next.js and security-header configuration
├── prisma.config.ts         # Prisma CLI configuration
└── package.json             # Dependencies and project commands
```

## Prerequisites

Install the following before starting:

- [Node.js](https://nodejs.org/) 20 or newer
- npm (included with Node.js)
- A PostgreSQL database, local or hosted
- Git

The following accounts are optional for local development but required to test their respective integrations:

- Google and/or GitHub OAuth application
- Stripe account and Stripe CLI
- Resend account

## Local development

### 1. Clone and install

```bash
git clone https://github.com/developershohan/nub-lms-academy.git
cd nub-lms-academy
npm ci
```

Use `npm install` only when intentionally changing dependencies. Use `npm ci` for a reproducible installation from `package-lock.json`.

### 2. Create the environment file

Create a file named `.env` in the project root. Start with the configuration below and replace every placeholder used by your environment:

```dotenv
APP_NAME="NUB Academy"
NODE_ENV="development"

NEXT_PUBLIC_APP_URL="http://localhost:3000"
AUTH_URL="http://localhost:3000"
NEXTAUTH_URL="http://localhost:3000"

DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"

AUTH_SECRET="replace-with-a-long-random-secret"
NEXTAUTH_SECRET="replace-with-the-same-value-as-AUTH_SECRET"
SOCKET_INTERNAL_SECRET="replace-with-a-different-long-random-secret"

GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""

ADMIN_EMAIL="admin@example.com"

STRIPE_SECRET_KEY=""
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
STRIPE_WEBHOOK_SECRET=""

RESEND_API_KEY=""
EMAIL_FROM="NUB Academy <onboarding@resend.dev>"

NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
SOCKET_SERVER_URL="http://localhost:3001"
SOCKET_PORT="3001"
SOCKET_CORS_ORIGIN="http://localhost:3000"
```

Generate strong local secrets with Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run it twice and use different values for the authentication and internal socket secrets.

### 3. Prepare the database

```bash
npx prisma generate
npx prisma migrate dev
npx prisma db seed
```

Seeding creates roles, demonstration teachers, categories, and published courses. If `ADMIN_EMAIL` is set and no matching user exists, the command creates a super-administrator and prints a temporary password once. Store it securely and change it after signing in.

### 4. Start both services

Terminal one:

```bash
npm run dev
```

Terminal two:

```bash
npm run dev:socket
```

Open [http://localhost:3000](http://localhost:3000). The socket server listens on `http://localhost:3001` by default.

## Environment variables

| Variable | Used by | Required | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Both services | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Both services | Yes | Signs Auth.js sessions and socket tokens |
| `NEXTAUTH_SECRET` | Next.js | Yes | Compatibility alias; keep equal to `AUTH_SECRET` |
| `SOCKET_INTERNAL_SECRET` | Both services | Yes | Protects server-to-server real-time event requests |
| `NEXT_PUBLIC_APP_URL` | Browser/Next.js | Yes | Public URL of the web application |
| `AUTH_URL`, `NEXTAUTH_URL` | Next.js | Yes | Authentication callback base URL |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Next.js | Optional | Google OAuth credentials |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Next.js | Optional | GitHub OAuth credentials |
| `ADMIN_EMAIL` | Seed script | Optional | User promoted to `SUPER_ADMIN` during seeding |
| `STRIPE_SECRET_KEY` | Next.js | Optional | Stripe server API key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser | Optional | Stripe public key |
| `STRIPE_WEBHOOK_SECRET` | Next.js | Optional | Verifies Stripe webhook signatures |
| `RESEND_API_KEY` | Next.js | Optional | Sends verification and password-reset emails |
| `EMAIL_FROM` | Next.js | Optional | Verified sender used by Resend |
| `NEXT_PUBLIC_SOCKET_URL` | Browser | Yes for real-time features | Public Socket.IO service URL; baked into the client build |
| `SOCKET_SERVER_URL` | Next.js | Yes for real-time features | Server-side Socket.IO service URL |
| `SOCKET_PORT` | Socket service | Local only | Local listening port; production hosts usually inject `PORT` |
| `SOCKET_CORS_ORIGIN` | Socket service | Yes | Comma-separated list of allowed web origins, without trailing slashes |

Never commit `.env` files or real credentials. Variables prefixed with `NEXT_PUBLIC_` are exposed to browser code and must never contain secrets.

## Database workflow

```bash
# Regenerate the Prisma client after schema changes
npx prisma generate

# Create and apply a migration during development
npx prisma migrate dev --name describe_the_change

# Apply committed migrations in production
npx prisma migrate deploy

# Validate the schema
npx prisma validate

# Open the database browser
npx prisma studio

# Load baseline/demo data
npx prisma db seed
```

Commit schema changes and the generated migration directory together. Never use `prisma migrate dev` against a production database, and do not edit a migration after it has been applied to a shared environment.

## Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run dev:socket` | Start the Socket.IO server in watch mode |
| `npm run build` | Create a production Next.js build |
| `npm run start` | Run the built Next.js application |
| `npm run start:socket` | Run the Socket.IO server in production mode |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm run test` | Run Vitest in watch mode |
| `npm run test:run` | Run the test suite once |
| `npm run check` | Run lint, type checking, tests, and production build |

## User roles

| Role | Main responsibilities |
| --- | --- |
| `STUDENT` | Browse and enroll in courses, learn, take quizzes, and receive certificates |
| `TEACHER` | Create and manage owned courses and communicate with enrolled students |
| `SUPPORT` | Handle support conversations and message moderation |
| `ADMIN` | Review courses and teachers and manage platform operations |
| `SUPER_ADMIN` | Full administrative access, including privileged role management |

New accounts receive the student role. A student can apply to become a teacher at `/teacher/apply`; an administrator must approve the application. A user may hold more than one role.

## Testing and quality checks

Run the complete local quality gate before opening a pull request:

```bash
npm run check
```

GitHub Actions runs Prisma generation and validation, linting, type checking, tests, and the production build for pull requests and pushes to `master`.

When changing authorization, payments, enrollment, quizzes, or database transactions, add focused tests for successful requests and rejected unauthorized or invalid requests.

## Deployment

### Next.js application

1. Import the repository into Vercel or another Node.js-compatible host.
2. Configure the production environment variables listed above.
3. Set all application URLs to their HTTPS production values.
4. Run `npx prisma migrate deploy` as a controlled release step.
5. Build with `npm run build` and start with `npm run start` when not using Vercel defaults.

### Socket.IO service

Deploy the same repository to Render, Railway, Fly.io, or another host that supports a persistent Node.js process.

- Start command: `npm run start:socket`
- Health endpoint: `GET /health`
- Set `DATABASE_URL`, `AUTH_SECRET`, and `SOCKET_INTERNAL_SECRET` to the same values used by the Next.js deployment.
- Set `SOCKET_CORS_ORIGIN` to the exact public web origin. Use commas for multiple origins.
- Set `NEXT_PUBLIC_SOCKET_URL` and `SOCKET_SERVER_URL` in the web deployment to the public socket-service URL.

Because `NEXT_PUBLIC_SOCKET_URL` is compiled into the browser bundle, redeploy the Next.js application after changing it.

### Stripe webhooks

Configure Stripe to send events to:

```text
https://YOUR_APP_DOMAIN/api/v1/webhooks/stripe
```

Store the endpoint signing secret in `STRIPE_WEBHOOK_SECRET`. For local webhook testing, use the Stripe CLI and forward events to the local endpoint.

## Security guidelines

- Never commit `.env`, private keys, access tokens, database dumps, or customer data.
- Keep `AUTH_SECRET` and `SOCKET_INTERNAL_SECRET` long, random, private, and different from one another.
- Preserve server-side permission checks when changing pages or API routes; hiding interface controls is not authorization.
- Verify Stripe webhook signatures before processing events.
- Restrict `SOCKET_CORS_ORIGIN` to trusted HTTPS origins; do not use `*` in production.
- Review dependency updates carefully, especially major Next.js, Auth.js, and Prisma upgrades.
- Rotate any credential immediately if it is accidentally committed, even if the commit is later deleted.

## Troubleshooting

### Prisma cannot connect

- Confirm that PostgreSQL is reachable and `DATABASE_URL` is valid.
- URL-encode special characters in the database username or password.
- Confirm that the provider-required SSL options are present.
- Run `npx prisma validate` and `npx prisma generate`.

### OAuth callback fails

- Confirm `AUTH_URL`, `NEXTAUTH_URL`, and `NEXT_PUBLIC_APP_URL` use the same application origin.
- Add the exact callback URLs shown by your OAuth provider configuration.
- Confirm the provider credentials belong to the current environment.

### Real-time messaging does not connect

- Start the socket service and verify its `/health` endpoint.
- Confirm the public and server-side socket URLs point to the socket deployment.
- Confirm `AUTH_SECRET` matches across services.
- Confirm the web origin appears exactly in `SOCKET_CORS_ORIGIN`.
- Check the browser console for Content Security Policy or CORS errors.

### Stripe checkout succeeds but enrollment is missing

- Confirm the webhook endpoint is reachable.
- Confirm `STRIPE_WEBHOOK_SECRET` matches the endpoint signing secret.
- Review application logs for rejected or duplicate webhook events.

## Contributing

1. Create a focused branch from the latest target branch.
2. Make the change and include any required Prisma migration.
3. Run `npm run check` locally.
4. Review `git diff` and confirm no secrets or generated files are included.
5. Commit with a clear, scoped message.
6. Push the branch and open a pull request describing the change, testing performed, migration impact, and any new environment variables.

Example workflow:

```bash
git switch -c feat/short-description
npm run check
git add <files-you-intend-to-commit>
git commit -m "feat: describe the change"
git push -u origin feat/short-description
```

## License

No public license is currently declared. Unless a license is added, all rights are reserved by the repository owner.
