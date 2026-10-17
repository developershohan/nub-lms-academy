import { describe, expect, it } from "vitest";
import { categoriesForRoles, categoryOf, effectivePreference } from "./notification-categories";

describe("notification categories", () => {
  it("maps types to categories, treating unknown ones as account", () => {
    expect(categoryOf("message")).toBe("messages");
    expect(categoryOf("payment-dispute")).toBe("admin");
    expect(categoryOf("something-new")).toBe("account");
  });

  it("keeps locked in-app on and email off where there is no email", () => {
    expect(effectivePreference("account", { inApp: false, email: false })).toEqual({ inApp: true, email: false });
    expect(effectivePreference("messages", { inApp: false, email: true })).toEqual({ inApp: false, email: false });
    expect(effectivePreference("payments", undefined)).toEqual({ inApp: true, email: true });
  });

  it("only offers teaching and admin categories to people they apply to", () => {
    expect(categoriesForRoles(["STUDENT"])).toEqual(["messages", "learning", "payments", "account"]);
    expect(categoriesForRoles(["STUDENT", "TEACHER"])).toContain("teaching");
    expect(categoriesForRoles(["SUPPORT"])).toContain("admin");
  });
});
