import { describe, expect, it } from "vitest";
import { courseDetailsSchema, courseGoalsSchema, courseLandingSchema, coursePricingSchema, lessonSchema } from "./course";

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

describe("courseLandingSchema thumbnailUrl", () => {
  const landing = { title: "Intro to Web", level: "BEGINNER", language: "English" };

  it("accepts an http(s) image link or a blank field", () => {
    expect(courseLandingSchema.parse({ ...landing, thumbnailUrl: " https://cdn.example.com/a.jpg " }).thumbnailUrl).toBe(
      "https://cdn.example.com/a.jpg"
    );
    expect(courseLandingSchema.parse({ ...landing, thumbnailUrl: "" }).thumbnailUrl).toBe("");
  });

  it("accepts this site's own images by path, but not a protocol-relative link to another site", () => {
    expect(courseLandingSchema.safeParse({ ...landing, thumbnailUrl: "/covers/modern-react.svg" }).success).toBe(true);
    expect(courseLandingSchema.safeParse({ ...landing, thumbnailUrl: "//evil.example/a.png" }).success).toBe(false);
  });

  it("rejects other schemes, which would end up in an img src", () => {
    for (const thumbnailUrl of ["javascript:alert(1)", "data:image/png;base64,AAAA", "ftp://x.com/a.png", "not a url"]) {
      expect(courseLandingSchema.safeParse({ ...landing, thumbnailUrl }).success).toBe(false);
    }
  });
});

describe("courseGoalsSchema", () => {
  it("drops blank rows and trims the rest, keeping their order", () => {
    const parsed = courseGoalsSchema.parse({ outcomes: [" Build an API ", "", "Deploy it"], requirements: ["  "] });
    expect(parsed.outcomes).toEqual(["Build an API", "Deploy it"]);
    expect(parsed.requirements).toEqual([]);
  });

  it("caps the number and length of items", () => {
    expect(courseGoalsSchema.safeParse({ outcomes: Array(21).fill("x"), requirements: [] }).success).toBe(false);
    expect(courseGoalsSchema.safeParse({ outcomes: ["x".repeat(201)], requirements: [] }).success).toBe(false);
  });
});

describe("coursePricingSchema", () => {
  it("applies the same sale-below-price rule as the full details form", () => {
    expect(coursePricingSchema.safeParse({ price: "20", salePrice: "25" }).success).toBe(false);
    expect(coursePricingSchema.parse({ price: "20", salePrice: "" })).toEqual({ price: 20, salePrice: undefined });
  });
});

describe("lessonSchema duration", () => {
  const text = { title: "Intro", type: "TEXT" };

  it("turns the studio's length field into seconds", () => {
    expect(lessonSchema.parse({ ...text, duration: "8:30" }).durationSec).toBe(510);
  });

  it("clears the length when the field is sent blank, but leaves it alone when absent", () => {
    expect(lessonSchema.parse({ ...text, duration: "" }).durationSec).toBeNull();
    expect(lessonSchema.parse({ ...text, durationSec: "90" }).durationSec).toBe(90);
    expect(lessonSchema.parse(text).durationSec).toBeUndefined();
  });

  it("explains a length it can't read", () => {
    const result = lessonSchema.safeParse({ ...text, duration: "half an hour" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/12:30/);
  });
});
