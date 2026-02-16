import { describe, expect, it } from "vitest";
import {
  FINAL_WARNING_RANGE_ERROR,
  FINAL_WARNING_SEC_DEFAULT,
  parseModeQueryToken,
  serializeModeQueryToken,
  shouldBlockQuit,
  validateFinalWarningSeconds,
} from "./policy";
import type { ScheduleMode } from "./types";

describe("mode query mapping", () => {
  it("supports kebab-case to camelCase parsing", () => {
    expect(parseModeQueryToken("countdown")).toBe("countdown");
    expect(parseModeQueryToken("specific-time")).toBe("specificTime");
    expect(parseModeQueryToken("process-exit")).toBe("processExit");
  });

  it("round-trips mode query tokens", () => {
    const modes: ScheduleMode[] = ["countdown", "specificTime", "processExit"];
    for (const mode of modes) {
      const token = serializeModeQueryToken(mode);
      expect(parseModeQueryToken(token)).toBe(mode);
    }
  });
});

describe("final warning validation", () => {
  it("accepts range boundaries", () => {
    expect(validateFinalWarningSeconds(15)).toBe(15);
    expect(validateFinalWarningSeconds(300)).toBe(300);
  });

  it("rejects out-of-range and invalid values with policy message", () => {
    expect(() => validateFinalWarningSeconds(14)).toThrow(FINAL_WARNING_RANGE_ERROR);
    expect(() => validateFinalWarningSeconds(301)).toThrow(FINAL_WARNING_RANGE_ERROR);
    expect(() => validateFinalWarningSeconds(Number.NaN)).toThrow(FINAL_WARNING_RANGE_ERROR);
    expect(() => validateFinalWarningSeconds(null)).toThrow(FINAL_WARNING_RANGE_ERROR);
  });

  it("keeps default value explicit", () => {
    expect(FINAL_WARNING_SEC_DEFAULT).toBe(60);
  });
});

describe("quit block policy", () => {
  it("blocks quit while armed or final warning", () => {
    expect(shouldBlockQuit("armed")).toBe(true);
    expect(shouldBlockQuit("finalWarning")).toBe(true);
  });

  it("does not block quit when no active status exists", () => {
    expect(shouldBlockQuit(undefined)).toBe(false);
    expect(shouldBlockQuit(null)).toBe(false);
  });
});
