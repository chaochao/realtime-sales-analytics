import { describe, it, expect } from "vitest";
import { toUsd, SUPPORTED_CURRENCIES } from "@/src/lib/currency";

describe("toUsd", () => {
  it("returns same amount for USD", () => {
    expect(toUsd(100, "USD")).toBe(100);
  });

  it("converts EUR to USD", () => {
    expect(toUsd(100, "EUR")).toBe(108);
  });

  it("converts GBP to USD", () => {
    expect(toUsd(100, "GBP")).toBe(127);
  });

  it("is case-insensitive", () => {
    expect(toUsd(100, "eur")).toBe(108);
    expect(toUsd(100, "Gbp")).toBe(127);
  });

  it("rounds to 2 decimal places", () => {
    // JPY: 0.0067 — 19300 * 0.0067 = 129.31
    expect(toUsd(19300, "JPY")).toBe(129.31);
  });

  it("throws on unknown currency", () => {
    expect(() => toUsd(100, "XYZ")).toThrow("Unsupported currency: XYZ");
  });

  it("exposes supported currencies list including USD and EUR", () => {
    expect(SUPPORTED_CURRENCIES).toContain("USD");
    expect(SUPPORTED_CURRENCIES).toContain("EUR");
    expect(SUPPORTED_CURRENCIES).toContain("GBP");
  });
});
