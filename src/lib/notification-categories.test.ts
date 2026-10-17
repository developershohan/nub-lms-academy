import { describe, expect, it } from "vitest";
import { categoriesForRoles, categoryOf, effectivePreference } from "./notification-categories";

describe("notification categories", () => {
  it("maps types to categories, treating unknown ones as account", () => {
    expect(categoryOf("message")).toBe("messages");
    expect(categoryOf("payment-dispute")).toBe("admin");
    expect(categoryOf("something-new")).toBe("account");
  });

  it("keeps locked in-app on, and takes the category's push default when nothing was saved for it", () => {
    expect(effectivePreference("account", { inApp: false, email: false })).toEqual({ inApp: true, email: false, push: true });
    expect(effectivePreference("messages", { inApp: false, email: true, push: false })).toEqual({ inApp: false, email: true, push: false });
    expect(effectivePreference("payments", undefined)).toEqual({ inApp: true, email: true, push: true });
  });

  it("only offers teaching and admin categories to people they apply to", () => {
    expect(categoriesForRoles(["STUDENT"])).toEqual(["messages", "learning", "payments", "account"]);
    expect(categoriesForRoles(["STUDENT", "TEACHER"])).toContain("teaching");
    expect(categoriesForRoles(["SUPPORT"])).toContain("admin");
  });
});
