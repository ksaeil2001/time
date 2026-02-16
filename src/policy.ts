import type { ScheduleMode, ScheduleStatus } from "./types";

export const FINAL_WARNING_SEC_DEFAULT = 60;
export const FINAL_WARNING_SEC_MIN = 15;
export const FINAL_WARNING_SEC_MAX = 300;
export const FINAL_WARNING_RANGE_ERROR =
  "최종 경고 시간은 15초에서 300초 사이로 설정해 주세요.";

const MODE_QUERY_TO_INTERNAL: Record<string, ScheduleMode> = {
  countdown: "countdown",
  "specific-time": "specificTime",
  "process-exit": "processExit",
};

export type ModeQueryToken = keyof typeof MODE_QUERY_TO_INTERNAL;

export function parseModeQueryToken(value: string | null | undefined): ScheduleMode | null {
  if (!value) {
    return null;
  }
  return MODE_QUERY_TO_INTERNAL[value] ?? null;
}

export function serializeModeQueryToken(mode: ScheduleMode): ModeQueryToken {
  if (mode === "countdown") {
    return "countdown";
  }
  if (mode === "specificTime") {
    return "specific-time";
  }
  return "process-exit";
}

export function normalizeFinalWarningSeconds(value: unknown): number {
  const numberValue =
    typeof value === "number" ? value : Number.isFinite(Number(value)) ? Number(value) : NaN;

  if (!Number.isFinite(numberValue)) {
    return FINAL_WARNING_SEC_DEFAULT;
  }

  const rounded = Math.round(numberValue);
  if (rounded < FINAL_WARNING_SEC_MIN || rounded > FINAL_WARNING_SEC_MAX) {
    return FINAL_WARNING_SEC_DEFAULT;
  }
  return rounded;
}

export function validateFinalWarningSeconds(value: unknown): number {
  const numberValue =
    typeof value === "number" ? value : Number.isFinite(Number(value)) ? Number(value) : NaN;
  if (!Number.isFinite(numberValue)) {
    throw new Error(FINAL_WARNING_RANGE_ERROR);
  }

  const rounded = Math.round(numberValue);
  if (rounded < FINAL_WARNING_SEC_MIN || rounded > FINAL_WARNING_SEC_MAX) {
    throw new Error(FINAL_WARNING_RANGE_ERROR);
  }
  return rounded;
}

export function shouldBlockQuit(status: ScheduleStatus | null | undefined): boolean {
  return status === "armed" || status === "finalWarning";
}
