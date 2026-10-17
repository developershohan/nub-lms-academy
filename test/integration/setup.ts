import { inject, vi } from "vitest";

// Must run before any test file imports @/lib/prisma, which reads DATABASE_URL once at load.
process.env.DATABASE_URL = inject("databaseUrl");
// Same for Redis: src/lib/realtime.ts reads REDIS_URL at load, the rest lazily on first use.
const redisUrl = inject("redisUrl");
if (redisUrl) process.env.REDIS_URL = redisUrl;
else delete process.env.REDIS_URL;
process.env.AUTH_SECRET ??= "integration-test-secret";

// Next.js request-only APIs and outbound side effects. Everything else - services, permission
// checks, Prisma, transactions - runs for real against the integration database.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  notFound: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ ok: true }),
  sendNotificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/realtime", () => ({
  emitRealtime: vi.fn(),
  disconnectUserSockets: vi.fn(),
  removeUserFromRoom: vi.fn(),
  invalidateUserAccess: vi.fn(),
  realtimeBus: { emit: vi.fn(), disconnectUser: vi.fn(), removeUserFromRoom: vi.fn(), invalidateUser: vi.fn() },
}));
