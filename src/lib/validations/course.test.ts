import { describe, expect, it } from "vitest";
import { courseDetailsSchema } from "./course";

const base = { title: "Intro to Web", level: "BEGINNER", language: "English", price: "49.99" };

describe("courseDetailsSchema salePrice", () => {
  it("treats a blank sale price as no sale price, not as $0 (which would make the course free)", () => {
    const result = courseDetailsSchema.safeParse({ ...base, salePrice: "" });
    expect(result.success).toBe(true);
    expect(result.data?.salePrice).toBeUndefined();
  });

  it("treats a whitespace-only, null or missing sale price as no sale price", () => {
    expect(courseDetailsSchema.parse({ ...base, salePrice: "  " }).salePrice).toBeUndefined();
    expect(courseDetailsSchema.parse({ ...base, salePrice: null }).salePrice).toBeUndefined();
    expect(courseDetailsSchema.parse(base).salePrice).toBeUndefined();
  });

  it("accepts a sale price below the regular price", () => {
    expect(courseDetailsSchema.parse({ ...base, salePrice: "19.99" }).salePrice).toBe(19.99);
    // An explicit 0 is a deliberate "free while on sale", not a blank field.
    expect(courseDetailsSchema.parse({ ...base, salePrice: "0" }).salePrice).toBe(0);
  });

  it("rejects a sale price equal to or above the regular price", () => {
    for (const salePrice of ["49.99", "60"]) {
      const result = courseDetailsSchema.safeParse({ ...base, salePrice });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(["salePrice"]);
    }
  });

  it("rejects a negative or non-numeric sale price", () => {
    expect(courseDetailsSchema.safeParse({ ...base, salePrice: "-1" }).success).toBe(false);
    expect(courseDetailsSchema.safeParse({ ...base, salePrice: "abc" }).success).toBe(false);
  });
});
