import type {
  ActiveSchedule,
  AppSettings,
  ExecutionEvent,
  ProcessInfo,
  QuitGuardAction,
  ScheduleRequest,
  SchedulerSnapshot,
  SettingsUpdate,
} from "./types";

interface MockSchedulerState {
  settings: AppSettings;
  active?: ActiveSchedule;
  history: ExecutionEvent[];
  nowMs: number;
  nextId: number;
}

declare global {
  interface Window {
    __AUTO_SD_E2E_RESET__?: () => void;
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultPreAlerts: [600, 300, 60],
  finalWarningSec: 60,
  simulateOnly: true,
};

const MOCK_PROCESSES: ProcessInfo[] = [
  { pid: 4021, name: "render-worker.exe", executable: "C:\\render\\render-worker.exe" },
  { pid: 1942, name: "python.exe", executable: "C:\\Python\\python.exe" },
  { pid: 1098, name: "pwsh.exe", executable: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" },
];

const state: MockSchedulerState = {
  settings: { ...DEFAULT_SETTINGS },
  history: [],
  nowMs: Date.now(),
  nextId: 1,
};

function resetMockState(): void {
  state.settings = { ...DEFAULT_SETTINGS };
  state.active = undefined;
  state.history = [];
  state.nowMs = Date.now();
  state.nextId = 1;
}

function buildScheduleSummary(request: ScheduleRequest): string {
  if (request.mode === "countdown") {
    const minutes = Math.max(1, Math.round((request.durationSec ?? 3600) / 60));
    return `카운트다운 ${minutes}분`;
  }

  if (request.mode === "specificTime") {
    return `특정 시각 ${request.targetLocalTime ?? "--:--"}`;
  }

  const name = request.processSelector?.name ?? "선택된 프로세스";
  const pid = request.processSelector?.pid;
  return pid ? `${name} (PID ${pid}) 감시` : `${name} 감시`;
}

function computeSpecificTimeTrigger(targetLocalTime: string | undefined, nowMs: number): number {
  if (!targetLocalTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(targetLocalTime)) {
    return nowMs + 60 * 60 * 1000;
  }

  const [hour, minute] = targetLocalTime.split(":").map((value) => Number(value));
  const now = new Date(nowMs);
  const candidate = new Date(now);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() <= nowMs) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.getTime();
}

function pushHistory(eventType: string, result: string, reason: string, scheduleId?: string): void {
  state.history.push({
    scheduleId,
    eventType,
    result,
    reason,
    timestampMs: state.nowMs,
  });

  if (state.history.length > 250) {
    state.history.splice(0, state.history.length - 250);
  }
}

function evaluateTransitions(): void {
  const active = state.active;
  if (!active) {
    return;
  }

  if (
    active.status === "armed" &&
    active.mode !== "processExit" &&
    active.triggerAtMs !== undefined &&
    active.triggerAtMs <= state.nowMs
  ) {
    state.active = {
      ...active,
      status: "finalWarning",
      finalWarningStartedAtMs: state.nowMs,
    };
    pushHistory("final_warning", "ok", "MOCK: FINAL_WARNING_ENTERED", active.id);
    return;
  }

  if (
    active.status === "finalWarning" &&
    active.finalWarningStartedAtMs !== undefined &&
    state.nowMs >= active.finalWarningStartedAtMs + active.finalWarningDurationSec * 1000
  ) {
    pushHistory("shutdown_initiated", "ok", "MOCK: SHUTDOWN_INITIATED", active.id);
    pushHistory("executed", "ok", "MOCK: EXECUTED", active.id);
    state.active = undefined;
  }
}

function buildSnapshot(): SchedulerSnapshot {
  state.nowMs = Date.now();
  evaluateTransitions();
  return {
    active: state.active ? { ...state.active } : undefined,
    settings: { ...state.settings },
    history: state.history.map((item) => ({ ...item })),
    nowMs: state.nowMs,
  };
}

async function getSchedulerSnapshot(): Promise<SchedulerSnapshot> {
  return buildSnapshot();
}

async function listProcesses(): Promise<ProcessInfo[]> {
  return MOCK_PROCESSES.map((item) => ({ ...item }));
}

async function armSchedule(request: ScheduleRequest): Promise<SchedulerSnapshot> {
  state.nowMs = Date.now();

  if (state.active) {
    pushHistory("cancelled", "ok", "MOCK: REPLACED_BY_NEW_SCHEDULE", state.active.id);
  }

  const scheduleId = `mock-${state.nextId++}`;
  const triggerAtMs =
    request.mode === "countdown"
      ? state.nowMs + Math.max(1, request.durationSec ?? 60) * 1000
      : request.mode === "specificTime"
        ? computeSpecificTimeTrigger(request.targetLocalTime, state.nowMs)
        : undefined;

  const preAlerts =
    request.mode === "processExit"
      ? []
      : request.preAlerts && request.preAlerts.length > 0
        ? [...request.preAlerts]
        : [...state.settings.defaultPreAlerts];

  state.active = {
    id: scheduleId,
    mode: request.mode,
    summary: buildScheduleSummary(request),
    armedAtMs: state.nowMs,
    triggerAtMs,
    targetLocalTime: request.targetLocalTime,
    targetTzOffsetMinutes: new Date().getTimezoneOffset(),
    preAlerts,
    firedAlerts: [],
    processSelector: request.processSelector,
    processStableSec: Math.max(5, Math.round(request.processStableSec ?? 10)),
    status: "armed",
    finalWarningDurationSec: state.settings.finalWarningSec,
  };

  pushHistory("armed", "ok", "MOCK: ARMED", scheduleId);
  return buildSnapshot();
}

async function cancelSchedule(reason = "MOCK: USER_CANCELLED"): Promise<SchedulerSnapshot> {
  state.nowMs = Date.now();
  if (state.active) {
    pushHistory("cancelled", "ok", reason, state.active.id);
    state.active = undefined;
  }
  return buildSnapshot();
}

async function postponeSchedule(minutes: number, reason = "MOCK: USER_POSTPONED"): Promise<SchedulerSnapshot> {
  state.nowMs = Date.now();
  if (!state.active) {
    return buildSnapshot();
  }

  const safeMinutes = Math.min(1440, Math.max(1, Math.round(minutes)));
  if (state.active.mode === "processExit") {
    state.active = {
      ...state.active,
      status: "armed",
      finalWarningStartedAtMs: undefined,
      snoozeUntilMs: state.nowMs + safeMinutes * 60 * 1000,
    };
  } else {
    state.active = {
      ...state.active,
      status: "armed",
      finalWarningStartedAtMs: undefined,
      triggerAtMs: state.nowMs + safeMinutes * 60 * 1000,
    };
  }

  pushHistory("postponed", "ok", reason, state.active.id);
  return buildSnapshot();
}

async function updateSettings(updates: SettingsUpdate): Promise<SchedulerSnapshot> {
  state.nowMs = Date.now();
  state.settings = {
    defaultPreAlerts: updates.defaultPreAlerts ? [...updates.defaultPreAlerts] : state.settings.defaultPreAlerts,
    finalWarningSec: updates.finalWarningSec ?? state.settings.finalWarningSec,
    simulateOnly: updates.simulateOnly ?? state.settings.simulateOnly,
  };

  if (state.active) {
    state.active = {
      ...state.active,
      finalWarningDurationSec: state.settings.finalWarningSec,
    };
  }

  pushHistory("settings_updated", "ok", "MOCK: SETTINGS_UPDATED");
  return buildSnapshot();
}

async function requestAppQuit(): Promise<SchedulerSnapshot> {
  return buildSnapshot();
}

async function resolveQuitGuard(action: QuitGuardAction): Promise<SchedulerSnapshot> {
  if (action === "cancelAndQuit") {
    return cancelSchedule("MOCK: CANCEL_AND_QUIT");
  }
  return buildSnapshot();
}

export const mockSchedulerApi = {
  getSchedulerSnapshot,
  listProcesses,
  armSchedule,
  cancelSchedule,
  postponeSchedule,
  updateSettings,
  requestAppQuit,
  resolveQuitGuard,
} as const;

if (typeof window !== "undefined") {
  window.__AUTO_SD_E2E_RESET__ = resetMockState;
}
