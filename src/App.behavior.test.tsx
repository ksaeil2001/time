// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { ActiveSchedule, SchedulerSnapshot } from "./types";

const apiMocks = vi.hoisted(() => ({
  getSchedulerSnapshot: vi.fn(),
  listProcesses: vi.fn(),
  armSchedule: vi.fn(),
  cancelSchedule: vi.fn(),
  postponeSchedule: vi.fn(),
  resolveQuitGuard: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("./api", () => ({
  getSchedulerSnapshot: apiMocks.getSchedulerSnapshot,
  listProcesses: apiMocks.listProcesses,
  armSchedule: apiMocks.armSchedule,
  cancelSchedule: apiMocks.cancelSchedule,
  postponeSchedule: apiMocks.postponeSchedule,
  resolveQuitGuard: apiMocks.resolveQuitGuard,
  updateSettings: apiMocks.updateSettings,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    hide: vi.fn(),
    setAlwaysOnTop: vi.fn(async () => {}),
    onCloseRequested: vi.fn(async () => () => {}),
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

function baseSnapshot(active?: ActiveSchedule): SchedulerSnapshot {
  return {
    active,
    settings: {
      defaultPreAlerts: [600, 300, 60],
      finalWarningSec: 60,
      simulateOnly: true,
    },
    history: [],
    nowMs: Date.now(),
  };
}

function formatAbsoluteDateTime(targetMs: number): string {
  const target = new Date(targetMs);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  const hour = String(target.getHours()).padStart(2, "0");
  const minute = String(target.getMinutes()).padStart(2, "0");
  const second = String(target.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

describe("App behavior regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem("autosd.onboarding.completed.v1", "true");

    apiMocks.getSchedulerSnapshot.mockResolvedValue(baseSnapshot());
    apiMocks.listProcesses.mockResolvedValue([]);
    apiMocks.armSchedule.mockResolvedValue(baseSnapshot());
    apiMocks.cancelSchedule.mockResolvedValue(baseSnapshot());
    apiMocks.postponeSchedule.mockResolvedValue(baseSnapshot());
    apiMocks.resolveQuitGuard.mockResolvedValue(baseSnapshot());
    apiMocks.updateSettings.mockResolvedValue(baseSnapshot());
  });

  afterEach(() => {
    window.location.hash = "#/dashboard";
  });

  it("loads processes only once on process-exit screen entry", async () => {
    window.location.hash = "#/schedule/new?mode=process-exit";
    render(<App />);

    await waitFor(() => {
      expect(apiMocks.listProcesses).toHaveBeenCalledTimes(1);
    });

    await new Promise((resolve) => {
      window.setTimeout(resolve, 200);
    });

    expect(apiMocks.listProcesses).toHaveBeenCalledTimes(1);
  });

  it("shows absolute shutdown time and remaining time together in final warning", async () => {
    const nowMs = Date.now();
    const shutdownAtMs = nowMs + 25_000;
    apiMocks.getSchedulerSnapshot.mockResolvedValue(
      baseSnapshot({
        id: "sch-final-warning",
        mode: "countdown",
        summary: "final warning",
        armedAtMs: nowMs - 120_000,
        triggerAtMs: nowMs - 35_000,
        preAlerts: [600, 300, 60],
        firedAlerts: [600, 300, 60],
        processStableSec: 10,
        status: "finalWarning",
        finalWarningStartedAtMs: nowMs - 35_000,
        finalWarningDurationSec: 60,
        shutdownAtMs,
      }),
    );

    window.location.hash = "#/dashboard";
    render(<App />);

    const warningLine = await screen.findByText((content) => {
      return content.includes("종료 시각") && content.includes("종료까지");
    });

    expect(warningLine.textContent).toContain(formatAbsoluteDateTime(shutdownAtMs));
    expect(warningLine.textContent).toContain("남았습니다.");
  });

  it("shows the soft countdown banner from 10 minutes before shutdown", async () => {
    const nowMs = Date.now();
    const shutdownAtMs = nowMs + 9 * 60 * 1000 + 15_000;
    apiMocks.getSchedulerSnapshot.mockResolvedValue(
      baseSnapshot({
        id: "sch-soft-countdown",
        mode: "countdown",
        summary: "soft countdown",
        armedAtMs: nowMs - 30_000,
        triggerAtMs: shutdownAtMs - 60_000,
        preAlerts: [600, 300, 60],
        firedAlerts: [600],
        processStableSec: 10,
        status: "armed",
        finalWarningDurationSec: 60,
        shutdownAtMs,
      }),
    );

    window.location.hash = "#/dashboard";
    render(<App />);

    const banner = await screen.findByText((content) => content.includes("종료 대기 모드"));
    expect(banner.textContent).toContain("종료 대기 모드");
    const bannerSection = banner.closest(".soft-countdown-banner");
    expect(bannerSection?.textContent).toContain("10분 미루기");
  });
});
