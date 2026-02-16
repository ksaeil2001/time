export type ScheduleMode = "countdown" | "specificTime" | "processExit";
export type ScheduleStatus = "armed" | "finalWarning";
export type QuitGuardAction = "cancelAndQuit" | "keepBackground" | "return";

export interface QuitGuardPayload {
  source: string;
  status: ScheduleStatus;
}

export interface ProcessSelector {
  pid?: number;
  name?: string;
  executable?: string;
  cmdlineContains?: string;
}

export interface ScheduleRequest {
  mode: ScheduleMode;
  durationSec?: number;
  targetLocalTime?: string;
  processSelector?: ProcessSelector;
  preAlerts?: number[];
  processStableSec?: number;
}

export interface ActiveSchedule {
  id: string;
  mode: ScheduleMode;
  summary: string;
  armedAtMs: number;
  triggerAtMs?: number;
  targetLocalTime?: string;
  targetTzOffsetMinutes?: number;
  preAlerts: number[];
  firedAlerts: number[];
  processSelector?: ProcessSelector;
  processTreePids?: number[];
  processTrackedPids?: number[];
  processStableSec: number;
  processMissingSinceMs?: number;
  snoozeUntilMs?: number;
  status: ScheduleStatus;
  finalWarningStartedAtMs?: number;
  finalWarningDurationSec: number;
}

export interface ExecutionEvent {
  scheduleId?: string;
  eventType: string;
  timestampMs: number;
  result: string;
  reason?: string;
}

export interface AppSettings {
  defaultPreAlerts: number[];
  finalWarningSec: number;
  simulateOnly: boolean;
}

export interface SchedulerSnapshot {
  active?: ActiveSchedule;
  settings: AppSettings;
  history: ExecutionEvent[];
  nowMs: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  executable?: string;
}

export interface SettingsUpdate {
  defaultPreAlerts?: number[];
  finalWarningSec?: number;
  simulateOnly?: boolean;
}
