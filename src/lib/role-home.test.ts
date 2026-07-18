import { describe, expect, it } from "vitest";
import { getRoleHome, resolveLoginDestination } from "./role-home";

describe("getRoleHome", () => {
  it("ranks admin above teacher above student for multi-role users", () => {
    expect(getRoleHome(["STUDENT", "TEACHER", "ADMIN"])).toBe("/admin/dashboard");
    expect(getRoleHome(["STUDENT", "TEACHER"])).toBe("/teacher/dashboard");
    expect(getRoleHome(["STUDENT"])).toBe("/student/dashboard");
    expect(getRoleHome([])).toBe("/student/dashboard");
  });

  it("treats SUPER_ADMIN the same as ADMIN", () => {
    expect(getRoleHome(["SUPER_ADMIN"])).toBe("/admin/dashboard");
  });
});

describe("resolveLoginDestination", () => {
  it("honors a callback URL outside the role-gated dashboard prefixes", () => {
    expect(resolveLoginDestination(["STUDENT"], "/courses/some-course")).toBe("/courses/some-course");
  });

  it("ignores a callback URL for a different role's dashboard, falling back to the user's own home", () => {
    // A student following a link meant for /admin/* shouldn't land on someone else's dashboard shell.
    expect(resolveLoginDestination(["STUDENT"], "/admin/dashboard")).toBe("/student/dashboard");
    expect(resolveLoginDestination(["TEACHER"], "/student/billing")).toBe("/teacher/dashboard");
  });

  it("falls back to the role home when no callback is given", () => {
    expect(resolveLoginDestination(["ADMIN"], null)).toBe("/admin/dashboard");
    expect(resolveLoginDestination(["ADMIN"], undefined)).toBe("/admin/dashboard");
    expect(resolveLoginDestination(["ADMIN"], "")).toBe("/admin/dashboard");
  });
});
