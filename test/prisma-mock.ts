import { vi, type Mock } from "vitest";

type ModelMock = Record<string, Mock>;
export type PrismaMock = Record<string, ModelMock> & { $transaction: Mock; $reset: () => void };

/**
 * Stand-in for the `prisma` client in service/permission tests, used as
 * `vi.mock("@/lib/prisma", () => import("../../test/prisma-mock").then((m) => m.prismaModule()))`.
 * Every `prisma.<model>.<method>` is a lazily created vi.fn() (resolving to undefined unless the
 * test sets it up), and `$transaction` runs its callback against the same mock - so a write made
 * inside a transaction is asserted exactly like one made outside it. Call `$reset()` in beforeEach.
 */
export function createPrismaMock(): PrismaMock {
  let models = new Map<string, ModelMock>();
  const transaction = vi.fn(async (arg: unknown) =>
    typeof arg === "function" ? arg(mock) : Promise.all(arg as Promise<unknown>[])
  );

  const mock: PrismaMock = new Proxy({} as PrismaMock, {
    get(_target, prop) {
      if (prop === "$transaction") return transaction;
      if (prop === "$reset") {
        return () => {
          models = new Map();
          transaction.mockClear();
        };
      }
      if (typeof prop !== "string" || prop === "then") return undefined;
      let model = models.get(prop);
      if (!model) {
        const fns: ModelMock = {};
        model = new Proxy(fns, {
          get: (target, method: string) => (target[method] ??= vi.fn()),
        });
        models.set(prop, model);
      }
      return model;
    },
  });
  return mock;
}

export function prismaModule() {
  return { prisma: createPrismaMock() };
}
