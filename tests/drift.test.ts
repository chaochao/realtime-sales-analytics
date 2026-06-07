import { describe, it, expect } from "vitest";
import { detectDrift } from "@/src/lib/agent/drift";

describe("detectDrift", () => {
  it("returns null when region has fewer than 3 prior deals", () => {
    expect(detectDrift("West", 1000, [40, 50])).toBeNull();
  });

  it("returns null for an in-distribution deal", () => {
    expect(detectDrift("West", 46, [44, 45, 46, 45, 44])).toBeNull();
  });

  it("flags a deal more than 2 sigma above the mean", () => {
    const insight = detectDrift("West", 250, [40, 42, 38, 41, 39]);
    expect(insight).not.toBeNull();
    expect(insight!.region).toBe("West");
    expect(insight!.z).toBeGreaterThan(2);
    expect(insight!.newAvg).toBeGreaterThan(insight!.prevAvg);
    expect(insight!.message).toContain("West");
  });

  it("returns null when prior deals have zero variance", () => {
    expect(detectDrift("West", 100, [40, 40, 40])).toBeNull();
  });

  it("flags a deal more than 2 sigma below the mean", () => {
    const insight = detectDrift("East", 1, [40, 42, 38, 41, 39]);
    expect(insight).not.toBeNull();
    expect(insight!.z).toBeLessThan(-2);
  });

  it("message includes formatted USD amounts and percent change", () => {
    const insight = detectDrift("North", 250000, [40000, 42000, 38000, 41000, 39000]);
    expect(insight!.message).toContain("North");
    expect(insight!.message).toContain("σ");
    expect(insight!.message).toContain("%");
  });
});
