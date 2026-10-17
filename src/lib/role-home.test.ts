import { describe, expect, it } from "vitest";
import { getDashboardKey, getRoleDashboards, getRoleHome, isUnder, resolveLoginDestination } from "./role-home";

describe("getRoleDashboards", () => {
  const labels = (roles: Parameters<typeof getRoleDashboards>[0]) => getRoleDashboards(roles).map((d) => d.label);

  it("offers one dashboard per role, student first", () => {
    expect(labels(["STUDENT"])).toEqual(["Student"]);
    expect(labels(["TEACHER", "STUDENT"])).toEqual(["Student", "Teacher"]);
    expect(labels(["STUDENT", "TEACHER", "ADMIN"])).toEqual(["Student", "Teacher", "Admin"]);
  });

  it("follows the layout gates for super admins and support staff", () => {
    expect(labels(["SUPER_ADMIN"])).toEqual(["Teacher", "Admin"]);
    expect(getRoleDashboards(["STUDENT", "SUPPORT"])).toEqual([
      { key: "student", label: "Student", href: "/student/dashboard" },
      { key: "admin", label: "Support", href: "/admin/messages" },
    ]);
    // An admin who is also support staff gets the full admin dashboard, once.
    expect(labels(["ADMIN", "SUPPORT"])).toEqual(["Admin"]);
  });
});

describe("getDashboardKey", () => {
  it("maps a path to its dashboard area", () => {
    expect(getDashboardKey("/student/course/abc/learn")).toBe("student");
    expect(getDashboardKey("/teacher/courses/abc/edit")).toBe("teacher");
    expect(getDashboardKey("/admin/messages")).toBe("admin");
  });

  it("ignores public pages, including the teacher application pitch", () => {
    expect(getDashboardKey("/teacher/apply")).toBeNull();
    expect(getDashboardKey("/courses/teacher-tips")).toBeNull();
    expect(getDashboardKey("/students")).toBeNull();
  });
});

describe("isUnder", () => {
  it("matches the page and its sub-pages on whole segments", () => {
    expect(isUnder("/student/certificates", "/student/certificates")).toBe(true);
    expect(isUnder("/student/certificates/abc", "/student/certificates")).toBe(true);
    expect(isUnder("/admin/courses-archive", "/admin/courses")).toBe(false);
    expect(isUnder("/student/dashboard", "/student/my-courses")).toBe(false);
  });
});

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

  it("never redirects off-site, falling back to the role home instead", () => {
    for (const callback of [
      "https://evil.example/phish",
      "http://evil.example",
      "//evil.example/path",
      "/\\evil.example",
      "/\t/evil.example",
      "javascript:alert(1)",
      "courses/no-leading-slash",
    ]) {
      expect(resolveLoginDestination(["STUDENT"], callback)).toBe("/student/dashboard");
    }
  });

  it("keeps query strings on a safe same-origin callback", () => {
    expect(resolveLoginDestination(["STUDENT"], "/courses?q=react")).toBe("/courses?q=react");
  });

  it("falls back to the role home when no callback is given", () => {
    expect(resolveLoginDestination(["ADMIN"], null)).toBe("/admin/dashboard");
    expect(resolveLoginDestination(["ADMIN"], undefined)).toBe("/admin/dashboard");
    expect(resolveLoginDestination(["ADMIN"], "")).toBe("/admin/dashboard");
  });
});
