import { invoke } from "@tauri-apps/api/core";
import type {
  ProcessInfo,
  QuitGuardAction,
  ScheduleRequest,
  SchedulerSnapshot,
  SettingsUpdate,
} from "./types";
import { mockSchedulerApi } from "./mockScheduler";

const shouldUseMockApi =
  typeof window !== "undefined" &&
  !("__TAURI_INTERNALS__" in window) &&
  import.meta.env.VITE_E2E_MOCK === "1";

export async function getSchedulerSnapshot(): Promise<SchedulerSnapshot> {
  if (shouldUseMockApi) {
    return mockSchedulerApi.getSchedulerSnapshot();
  }
  return invoke<SchedulerSnapshot>("get_scheduler_snapshot");
}

export async function listProcesses(): Promise<ProcessInfo[]> {
  if (shouldUseMockApi) {
    return mockSchedulerApi.listProcesses();
  }
  return invoke<ProcessInfo[]>("list_processes");
}

export async function armSchedule(
  request: ScheduleRequest,
): Promise<SchedulerSnapshot> {
  if (shouldUseMockApi) {
    return mockSchedulerApi.armSchedule(request);
  }
  return invoke<SchedulerSnapshot>("arm_schedule", { request });
}

export async function cancelSchedule(
  reason?: string,
): Promise<SchedulerSnapshot> {
  if (shouldUseMockApi) {
    return mockSchedulerApi.cancelSchedule(reason);
  }
  return invoke<SchedulerSnapshot>("cancel_schedule", { reason });
}

export async function postponeSchedule(
  minutes: number,
  reason?: string,
): Promise<SchedulerSnapshot> {
  if (shouldUseMockApi) {
    return mockSchedulerApi.postponeSchedule(minutes, reason);
  }
  return invoke<SchedulerSnapshot>("postpone_schedule", { minutes, reason });
}

export async function updateSettings(
  updates: SettingsUpdate,
): Promise<SchedulerSnapshot> {
  if (shouldUseMockApi) {
    return mockSchedulerApi.updateSettings(updates);
  }
  return invoke<SchedulerSnapshot>("update_settings", { updates });
}

export async function requestAppQuit(): Promise<SchedulerSnapshot> {
  if (shouldUseMockApi) {
    return mockSchedulerApi.requestAppQuit();
  }
  return invoke<SchedulerSnapshot>("request_app_quit");
}

export async function resolveQuitGuard(
  action: QuitGuardAction,
): Promise<SchedulerSnapshot> {
  if (shouldUseMockApi) {
    return mockSchedulerApi.resolveQuitGuard(action);
  }
  return invoke<SchedulerSnapshot>("resolve_quit_guard", { action });
}
