import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AppShellV2, type AppShellNavItem } from "./components/layout/AppShellV2";
import {
  AlertBanner,
  Badge,
  Button,
  Card,
  CardActions,
  CardDescription,
  CardHeader,
  CardTitle,
  Chip,
  ChipGroup,
  DataTable,
  DetailDrawer,
  EmptyState,
  EventList,
  FormField,
  HistoryTable,
  Input,
  SegmentedControl,
  SectionHeader,
  Select,
  Skeleton,
  TimelineList,
  Toggle,
  type IconName,
} from "./components/ui";
import {
  armSchedule,
  cancelSchedule,
  getSchedulerSnapshot,
  listProcesses,
  postponeSchedule,
  resolveQuitGuard,
  updateSettings,
} from "./api";
import type {
  ActiveSchedule,
  ExecutionEvent,
  ProcessInfo,
  QuitGuardAction,
  QuitGuardPayload,
  ScheduleMode,
  ScheduleStatus,
  ScheduleRequest,
  SchedulerSnapshot,
} from "./types";
import {
  FINAL_WARNING_SEC_DEFAULT,
  FINAL_WARNING_SEC_MAX,
  FINAL_WARNING_SEC_MIN,
  parseModeQueryToken,
  serializeModeQueryToken,
  validateFinalWarningSeconds,
} from "./policy";
import {
  BRAND_COPY,
  COUNTDOWN_PRESET_MINUTES,
  MODE_LABEL_MAP,
  NAV_LABEL_MAP,
  ROUTE_LABEL_MAP,
  STATUS_LABEL_MAP,
  STATUS_TAG_COPY,
  UI_COPY,
  eventTypeLabel,
} from "./constants/copy";
import "./App.css";
import "./styles/design-system-v2.css";

const ONBOARDING_KEY = "autosd.onboarding.completed.v1";

const PRE_ALERT_OPTION_MINUTES = [10, 5, 1] as const;
const QUICK_SNOOZE_OPTION_MINUTES = [5, 10, 15] as const;
const HISTORY_PAGE_SIZE = 120;
const SOFT_COUNTDOWN_WINDOW_SEC = 10 * 60;

type RoutePath =
  | "/onboarding/welcome"
  | "/onboarding/permissions"
  | "/onboarding/safety"
  | "/dashboard"
  | "/schedule/new"
  | "/schedule/active"
  | "/history"
  | "/settings/general"
  | "/settings/notifications"

  | "/help";

const KNOWN_PATHS = new Set<RoutePath>(Object.keys(ROUTE_LABEL_MAP) as RoutePath[]);

const NAV_ICON_MAP: Record<string, IconName> = {
  "/dashboard": "clock",
  "/schedule/new": "clock",
  "/schedule/active": "power",
  "/history": "chevron",
  "/settings/general": "chevron",
  "/settings/notifications": "bell",

  "/help": "chevron",
};

const NAV_GROUP_MAP: Record<RoutePath, string> = {
  "/onboarding/welcome": "온보딩",
  "/onboarding/permissions": "온보딩",
  "/onboarding/safety": "온보딩",
  "/dashboard": "예약",
  "/schedule/new": "예약",
  "/schedule/active": "예약",
  "/history": "기록",
  "/settings/general": "설정",
  "/settings/notifications": "설정",

  "/help": "도움말",
};

const ROUTE_GUIDE_MAP: Record<RoutePath, string> = {
  "/onboarding/welcome": "핵심 동작과 안전 정책을 확인하세요.",
  "/onboarding/permissions": "권한과 알림 동작을 확인하세요.",
  "/onboarding/safety": "취소/미루기 경로를 확인하세요.",
  "/dashboard": "상태, 종료 시각, 즉시 행동을 확인하세요.",
  "/schedule/new": "입력값 검증 후 예약을 시작하세요.",
  "/schedule/active": "타임라인과 취소/미루기를 확인하세요.",
  "/history": "필터/검색/정렬로 빠르게 스캔하세요.",
  "/settings/general": "안전 모드와 저장 정책을 점검하세요.",
  "/settings/notifications": "알림 임계값과 미리보기를 확인하세요.",

  "/help": "안전 고지와 FAQ를 확인하세요.",
};

const EVENT_STATE_MACHINE_MAP: Record<string, string> = {
  armed: "Armed",
  cancelled: "Cancelled",
  postponed: "Armed(Rescheduled)",
  alerted: "PreAlert",
  final_warning: "FinalWarning",
  final_warning_reverted: "Armed(Return)",
  shutdown_initiated: "ShutdownRequested",
  executed: "Executed",
  failed: "Failed",
};

interface AppRoute {
  path: RoutePath;
  search: URLSearchParams;
}

interface ConfirmDraft {
  request: ScheduleRequest;
  summary: string;
  timingText: string;
}

type HistoryFilter = "all" | "success" | "failed" | "info";
type HistorySort = "latest" | "oldest";


interface HistoryEventViewModel {
  id: string;
  title: string;
  description: string;
  channelLabel: string;
  modeLabel: string;
  resultTone: "success" | "info" | "danger";
  resultCategory: "success" | "failed" | "info";
  resultLabel: string;
  eventIcon: IconName;
  absoluteTime: string;
  relativeTime: string;
  metaChips: string[];
  stateMachineStep: string;
  item: ExecutionEvent;
}

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.offsetParent !== null,
  );
}

function formatSeconds(totalSeconds: number): string {
  const seconds = Math.max(totalSeconds, 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}시간 ${minutes}분 ${secs}초`;
  }
  if (minutes > 0) {
    return `${minutes}분 ${secs}초`;
  }
  return `${secs}초`;
}

function normalizeAlertMinutes(minutes: number[]): number[] {
  const normalized = minutes
    .map((minute) => Math.round(minute))
    .filter((minute) => Number.isFinite(minute) && minute > 0);
  return [...new Set(normalized)].sort((a, b) => b - a);
}

function encodeAlertMinutes(minutes: number[]): number[] {
  return normalizeAlertMinutes(minutes).map((minute) => minute * 60);
}

function decodeAlertMinutes(alerts: number[] | undefined): number[] {
  if (!alerts || alerts.length === 0) {
    return [...PRE_ALERT_OPTION_MINUTES];
  }
  return normalizeAlertMinutes(alerts.map((seconds) => Math.round(seconds / 60)));
}

function toggleAlertMinute(selected: number[], minute: number): number[] {
  const next = selected.includes(minute)
    ? selected.filter((item) => item !== minute)
    : [...selected, minute];
  const normalized = normalizeAlertMinutes(next);
  if (normalized.length === 0) {
    throw new Error("사전 알림은 최소 1개 이상 선택해 주세요.");
  }
  return normalized;
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

function formatRelativeFromMs(targetMs: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
  if (diffSec < 60) {
    return `${diffSec}초 후`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}분 후`;
  }
  const diffHour = Math.floor(diffMin / 60);
  return `${diffHour}시간 ${diffMin % 60}분 후`;
}

function formatRelativePastFromMs(timestampMs: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (diffSec < 60) {
    return `${diffSec}초 전`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}분 전`;
  }
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return `${diffHour}시간 전`;
  }
  return `${Math.floor(diffHour / 24)}일 전`;
}

function formatAbsoluteAndRelative(targetMs: number, nowMs: number): string {
  return `${formatAbsoluteDateTime(targetMs)} · ${formatRelativeFromMs(targetMs, nowMs)}`;
}

function formatCountdownPresetLabel(minutes: number): string {
  return minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60}시간` : `${minutes}분`;
}

function statusToneFromActive(active: ActiveSchedule | undefined): "idle" | "armed" | "finalWarning" {
  if (!active) {
    return "idle";
  }
  return active.status === "finalWarning" ? "finalWarning" : "armed";
}

function parseRouteFromHash(): AppRoute {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) {
    return { path: "/dashboard", search: new URLSearchParams() };
  }

  const [rawPath, rawSearch = ""] = hash.split("?");
  const normalized = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const path = KNOWN_PATHS.has(normalized as RoutePath)
    ? (normalized as RoutePath)
    : "/dashboard";

  return { path, search: new URLSearchParams(rawSearch) };
}

function buildHash(path: RoutePath, search?: URLSearchParams): string {
  const query = search?.toString();
  return query ? `#${path}?${query}` : `#${path}`;
}

function useHashRoute(): [AppRoute, (path: RoutePath, query?: URLSearchParams) => void] {
  const [route, setRoute] = useState<AppRoute>(() => parseRouteFromHash());

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = buildHash("/dashboard");
    }
    const sync = () => setRoute(parseRouteFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = useCallback((path: RoutePath, query?: URLSearchParams) => {
    window.location.hash = buildHash(path, query);
  }, []);

  return [route, navigate];
}

function computeSpecificTimePreviewMs(targetLocalTime: string, nowMs: number): number | null {
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(targetLocalTime)) {
    return null;
  }

  const [hourText, minuteText] = targetLocalTime.split(":");
  const now = new Date(nowMs);
  const candidate = new Date(now);
  candidate.setHours(Number(hourText), Number(minuteText), 0, 0);
  if (candidate.getTime() <= nowMs) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.getTime();
}

function isShellLikeProcessName(name: string | undefined): boolean {
  if (!name) {
    return false;
  }
  const normalized = name.toLowerCase();
  return (
    normalized.includes("powershell") ||
    normalized.includes("pwsh") ||
    normalized === "bash" ||
    normalized.endsWith("/bash") ||
    normalized === "zsh" ||
    normalized.endsWith("/zsh") ||
    normalized === "sh" ||
    normalized.endsWith("/sh")
  );
}

function classifyHistoryEvent(item: ExecutionEvent): "success" | "failed" | "info" {
  if (item.eventType === "failed" || item.result === "error") {
    return "failed";
  }

  if (
    item.eventType === "cancelled" ||
    item.eventType === "alerted" ||
    item.eventType === "settings_updated" ||
    item.eventType === "resume_not_supported" ||
    item.eventType === "state_parse_failed" ||
    item.eventType === "state_restored_from_backup"
  ) {
    return "info";
  }

  return "success";
}

function inferEventIcon(item: ExecutionEvent): IconName {
  if (item.eventType === "failed") {
    return "bell";
  }
  if (item.eventType === "cancelled" || item.eventType === "shutdown_initiated") {
    return "power";
  }
  if (item.eventType === "alerted" || item.eventType === "final_warning") {
    return "bell";
  }
  return "clock";
}
function inferEventMode(item: ExecutionEvent): string {
  const reason = (item.reason ?? "").toLowerCase();
  if (reason.includes("process") || reason.includes("sentinel")) {
    return MODE_LABEL_MAP.processExit;
  }
  if (reason.includes("specific") || reason.includes("time")) {
    return MODE_LABEL_MAP.specificTime;
  }
  return MODE_LABEL_MAP.countdown;
}

function inferEventChannel(item: ExecutionEvent): string {
  const reason = (item.reason ?? "").toLowerCase();
  if (reason.includes("tray")) {
    return "트레이";
  }
  if (reason.includes("shortcut")) {
    return "단축키";
  }
  return "UI";
}

function isTimestampLikeToken(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  return (
    /\d{4}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}/.test(normalized) ||
    /\d{1,2}:\d{2}(:\d{2})?/.test(normalized) ||
    normalized.includes("오전") ||
    normalized.includes("오후")
  );
}

function sanitizeEventReason(item: ExecutionEvent): string {
  const reason = item.reason?.trim();
  if (!reason) {
    return "";
  }

  const normalized = reason.replace(/\s+/g, " ");
  const statusLabel = eventTypeLabel(item.eventType);

  const segments = normalized
    .split("·")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const filtered = (segments.length > 1 ? segments : [normalized]).filter(
    (segment) =>
      segment !== statusLabel &&
      segment !== "성공" &&
      segment !== "실패" &&
      segment !== "정보" &&
      !isTimestampLikeToken(segment),
  );

  const unique = [...new Set(filtered)];
  if (unique.length === 0) {
    return "";
  }

  return unique[0];
}

function inferEventDescription(item: ExecutionEvent): string {
  const sanitizedReason = sanitizeEventReason(item);
  if (sanitizedReason) {
    return sanitizedReason;
  }

  const fallback: Record<string, string> = {
    armed: "예약이 활성화됐어요.",
    cancelled: "예약이 취소됐어요.",
    postponed: "예약 시간이 미뤄졌어요.",
    alerted: "사전 알림이 전송됐어요.",
    final_warning: "최종 경고가 시작됐어요.",
    final_warning_reverted: "최종 경고가 해제됐어요.",
    shutdown_initiated: "종료 명령 실행을 시작했어요.",
    executed: "예약이 정상 처리됐어요.",
    failed: "예약 처리 중 오류가 발생했어요.",
    settings_updated: "설정이 변경됐어요.",
  };

  return fallback[item.eventType] ?? "상세 사유가 기록되지 않았어요.";
}

function buildEventMetaChips(item: ExecutionEvent, nowMs: number): string[] {
  return [
    formatAbsoluteDateTime(item.timestampMs),
    formatRelativePastFromMs(item.timestampMs, nowMs),
    `출처: ${inferEventChannel(item)}`,
    `모드: ${inferEventMode(item)}`,
  ];
}

function buildHistoryEventViewModel(item: ExecutionEvent, nowMs: number): HistoryEventViewModel {
  const category = classifyHistoryEvent(item);
  const tone = category === "failed" ? "danger" : category === "info" ? "info" : "success";
  const label = category === "failed" ? "실패" : category === "info" ? "정보" : "성공";

  return {
    id: `${item.timestampMs}-${item.eventType}-${item.result}`,
    title: eventTypeLabel(item.eventType),
    description: inferEventDescription(item),
    channelLabel: inferEventChannel(item),
    modeLabel: inferEventMode(item),
    resultTone: tone,
    resultCategory: category,
    resultLabel: label,
    eventIcon: inferEventIcon(item),
    absoluteTime: formatAbsoluteDateTime(item.timestampMs),
    relativeTime: formatRelativePastFromMs(item.timestampMs, nowMs),
    metaChips: buildEventMetaChips(item, nowMs),
    stateMachineStep: EVENT_STATE_MACHINE_MAP[item.eventType] ?? "Unknown",
    item,
  };
}

function summarizeScheduleRequest(request: ScheduleRequest): string {
  if (request.mode === "countdown") {
    const durationMinutes = Math.max(1, Math.round((request.durationSec ?? 3600) / 60));
    return `카운트다운 ${durationMinutes}분 뒤 종료`;
  }

  if (request.mode === "specificTime") {
    return `${request.targetLocalTime ?? "--:--"} 종료`;
  }

  const selector = request.processSelector;
  const processName = selector?.name?.trim() || "선택된 프로세스";
  const pidText = selector?.pid !== undefined ? `PID ${selector.pid}` : "PID 없음";
  const stableSec = Math.max(5, Math.round(request.processStableSec ?? 10));
  return `${processName} (${pidText}) 종료 감지 + ${stableSec}초 안정 후 종료`;
}

function summarizeScheduleTiming(request: ScheduleRequest, nowMs: number): string {
  if (request.mode === "processExit") {
    return UI_COPY.preAlertProcessExitHint;
  }

  const triggerAtMs =
    request.mode === "countdown"
      ? nowMs + Math.max(1, request.durationSec ?? 60) * 1000
      : computeSpecificTimePreviewMs(request.targetLocalTime ?? "", nowMs);

  if (!triggerAtMs) {
    return "종료 시각 계산에 실패했습니다. 입력값을 확인해 주세요.";
  }

  return formatAbsoluteAndRelative(triggerAtMs, nowMs);
}

function buildConfirmDraft(
  mode: ScheduleMode,
  durationMinutes: number,
  targetLocalTime: string,
  selectedProcess: ProcessInfo | null,
  stableSeconds: number,
  processExecutable: string,
  processCmdlineContains: string,
  preAlertMinutes: number[],
  nowMs: number,
): ConfirmDraft {
  const preAlerts = mode === "processExit" ? [] : encodeAlertMinutes(preAlertMinutes);

  if (mode === "countdown") {
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      throw new Error("카운트다운 시간은 1분 이상이어야 합니다.");
    }

    const durationSec = Math.round(durationMinutes * 60);
    const triggerAtMs = nowMs + durationSec * 1000;

    return {
      request: { mode, durationSec, preAlerts },
      summary: `카운트다운 ${durationMinutes}분`,
      timingText: formatAbsoluteAndRelative(triggerAtMs, nowMs),
    };
  }

  if (mode === "specificTime") {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(targetLocalTime)) {
      throw new Error("종료 시각은 HH:MM 형식으로 입력해 주세요.");
    }

    const triggerAtMs = computeSpecificTimePreviewMs(targetLocalTime, nowMs);
    if (!triggerAtMs) {
      throw new Error("종료 시각 계산에 실패했습니다. 입력값을 확인해 주세요.");
    }

    return {
      request: { mode, targetLocalTime, preAlerts },
      summary: `특정 시각 ${targetLocalTime}`,
      timingText: formatAbsoluteAndRelative(triggerAtMs, nowMs),
    };
  }

  if (!selectedProcess) {
    throw new Error("감시할 프로세스를 선택해 주세요.");
  }

  if (!Number.isFinite(stableSeconds) || stableSeconds < 5) {
    throw new Error("안정 구간은 5초 이상이어야 합니다.");
  }

  const executable = processExecutable.trim();
  const cmdlineContains = processCmdlineContains.trim();

  if (
    isShellLikeProcessName(selectedProcess.name) &&
    executable.length === 0 &&
    cmdlineContains.length === 0
  ) {
    throw new Error("Shell 계열 감시는 실행 파일 경로나 명령어 토큰을 함께 입력해야 합니다.");
  }

  return {
    request: {
      mode,
      processSelector: {
        pid: selectedProcess.pid,
        name: selectedProcess.name,
        executable: executable || undefined,
        cmdlineContains: cmdlineContains || undefined,
      },
      processStableSec: Math.round(stableSeconds),
      preAlerts,
    },
    summary: `${selectedProcess.name} (PID ${selectedProcess.pid}) 감시`,
    timingText: UI_COPY.preAlertProcessExitHint,
  };
}

async function openExternal(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.appendChild(fallback);
  fallback.focus();
  fallback.select();
  document.execCommand("copy");
  document.body.removeChild(fallback);
}

type SpaceScale = "xs" | "sm" | "md" | "lg" | "xl";

function Page({
  children,
  className,
  narrow = false,
}: {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
}) {
  return <div className={classNames("page", narrow && "page-narrow", className)}>{children}</div>;
}

function PageHeader({
  id,
  title,
  description,
  actions,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <SectionHeader
      id={id}
      className={classNames("page-header", className)}
      title={<span className="page-title">{title}</span>}
      description={description ? <span className="page-description">{description}</span> : undefined}
      actions={actions ? <Inline className="page-header-actions">{actions}</Inline> : undefined}
    />
  );
}

function PageSection({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section className={classNames("page-section", className)} {...props}>
      {children}
    </section>
  );
}

function Stack({
  className,
  children,
  gap = "md",
}: {
  className?: string;
  children: ReactNode;
  gap?: SpaceScale;
}) {
  return <div className={classNames("stack", `space-${gap}`, className)}>{children}</div>;
}

function Inline({
  className,
  children,
  justify = "start",
  align = "center",
  wrap = true,
  ...props
}: {
  className?: string;
  children: ReactNode;
  justify?: "start" | "between" | "end" | "center";
  align?: "start" | "center" | "end";
  wrap?: boolean;
} & ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={classNames(
        "inline",
        `inline-justify-${justify}`,
        `inline-align-${align}`,
        wrap ? "inline-wrap" : "inline-nowrap",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

const AppButton = Button;
const AppInput = Input;
const AppSelect = Select;

function FormRow({
  className,
  label,
  hint,
  compact = false,
  inline = false,
  children,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  compact?: boolean;
  inline?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <FormField
      htmlFor={htmlFor}
      label={label}
      hint={hint}
      className={classNames(
        "ui-form-field",
        "form-row",
        compact ? "form-row-compact" : undefined,
        inline ? "form-row-inline" : undefined,
        className,
      )}
    >
      {children}
    </FormField>
  );
}
function App() {
  const [route, navigate] = useHashRoute();
  const routeSearchKey = route.search.toString();
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(() => {
    return window.localStorage.getItem(ONBOARDING_KEY) === "true";
  });



  const [snapshot, setSnapshot] = useState<SchedulerSnapshot | null>(null);
  const [statusError, setStatusError] = useState<string>("");
  const [actionError, setActionError] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  const [mode, setMode] = useState<ScheduleMode>("countdown");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [targetLocalTime, setTargetLocalTime] = useState<string>("23:40");
  const [preAlertMinutes, setPreAlertMinutes] = useState<number[]>([...PRE_ALERT_OPTION_MINUTES]);

  const [stableSeconds, setStableSeconds] = useState<number>(10);
  const [processExecutable, setProcessExecutable] = useState<string>("");
  const [processCmdlineContains, setProcessCmdlineContains] = useState<string>("");

  const [postponeMinutes, setPostponeMinutes] = useState<number>(10);
  const [showCustomSnooze, setShowCustomSnooze] = useState<boolean>(false);
  const [defaultAlertMinutes, setDefaultAlertMinutes] = useState<number[]>([...PRE_ALERT_OPTION_MINUTES]);
  const [simulateOnlyDraft, setSimulateOnlyDraft] = useState<boolean>(true);
  const [finalWarningSecInput, setFinalWarningSecInput] = useState<number>(FINAL_WARNING_SEC_DEFAULT);

  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [processSearchQuery, setProcessSearchQuery] = useState<string>("");
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);
  const [processLoading, setProcessLoading] = useState<boolean>(false);
  const [processError, setProcessError] = useState<string>("");

  const [confirmDraft, setConfirmDraft] = useState<ConfirmDraft | null>(null);
  const [quitGuard, setQuitGuard] = useState<QuitGuardPayload | null>(null);
  const [quitBusy, setQuitBusy] = useState<boolean>(false);

  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [historySort, setHistorySort] = useState<HistorySort>("latest");
  const [historySearchQuery, setHistorySearchQuery] = useState<string>("");
  const [historyVisibleCount, setHistoryVisibleCount] = useState<number>(HISTORY_PAGE_SIZE);
  const [selectedHistoryEventId, setSelectedHistoryEventId] = useState<string | null>(null);

  const [showSettingsSavedToast, setShowSettingsSavedToast] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [politeLiveMessage, setPoliteLiveMessage] = useState<string>("");
  const [assertiveLiveMessage, setAssertiveLiveMessage] = useState<string>("");

  const hasLoadedSettingsRef = useRef<boolean>(false);
  const snapshotRefreshInFlightRef = useRef<boolean>(false);
  const processLoadInFlightRef = useRef<Promise<void> | null>(null);
  const processAutoLoadEntryRef = useRef<string | null>(null);
  const liveRegionInitializedRef = useRef<boolean>(false);
  const previousActiveStatusRef = useRef<ScheduleStatus | "idle">("idle");
  const lastHistoryAnnouncementKeyRef = useRef<string>("");
  const finalWarningOverlayRef = useRef<HTMLElement | null>(null);
  const finalWarningCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const finalWarningRestoreFocusRef = useRef<HTMLElement | null>(null);
  const historyDetailRestoreFocusRef = useRef<HTMLElement | null>(null);
  const alwaysOnTopPinnedRef = useRef<boolean>(false);
  const focusInput = (id: string) => {
    const node = document.getElementById(id) as HTMLInputElement | null;
    node?.focus();
  };

  const refreshSnapshot = useCallback(async () => {
    if (snapshotRefreshInFlightRef.current) {
      return;
    }

    snapshotRefreshInFlightRef.current = true;
    try {
      const next = await getSchedulerSnapshot();
      setSnapshot(next);
      setStatusError("");

      if (!hasLoadedSettingsRef.current) {
        setDefaultAlertMinutes(decodeAlertMinutes(next.settings.defaultPreAlerts));
        setPreAlertMinutes(decodeAlertMinutes(next.settings.defaultPreAlerts));
        setFinalWarningSecInput(next.settings.finalWarningSec);
        setSimulateOnlyDraft(next.settings.simulateOnly);
        hasLoadedSettingsRef.current = true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "상태를 불러오지 못했습니다.";
      setStatusError(message);
    } finally {
      snapshotRefreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void refreshSnapshot();
    const timer = window.setInterval(() => {
      void refreshSnapshot();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [refreshSnapshot]);

  useEffect(() => {
    if (!onboardingCompleted && !route.path.startsWith("/onboarding")) {
      navigate("/onboarding/welcome");
      return;
    }

    if (onboardingCompleted && route.path.startsWith("/onboarding")) {
      navigate("/dashboard");
    }
  }, [navigate, onboardingCompleted, route.path]);

  useEffect(() => {
    if (route.path !== "/schedule/new") {
      return;
    }
    const parsed = parseModeQueryToken(route.search.get("mode"));
    if (parsed) {
      setMode(parsed);
    }
  }, [route.path, route.search]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    try {
      getCurrentWindow()
        .onCloseRequested(async (event) => {
          event.preventDefault();
          await getCurrentWindow().hide();
        })
        .then((fn) => {
          unlisten = fn;
        })
        .catch(() => {
          // no-op
        });
    } catch {
      // no-op (non-tauri runtime)
    }

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const setScheduleMode = useCallback(
    (nextMode: ScheduleMode) => {
      setMode(nextMode);
      const query = new URLSearchParams();
      query.set("mode", serializeModeQueryToken(nextMode));
      navigate("/schedule/new", query);
    },
    [navigate],
  );

  const loadProcesses = useCallback(async () => {
    if (processLoadInFlightRef.current) {
      await processLoadInFlightRef.current;
      return;
    }

    const pending = (async () => {
      setProcessLoading(true);
      setProcessError("");

      try {
        const items = await listProcesses();
        setProcesses(items);
        setSelectedProcess((previous) => {
          if (!previous) {
            return null;
          }
          const matched = items.find((item) => item.pid === previous.pid);
          return matched ?? null;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "프로세스 목록을 불러오지 못했습니다.";
        setProcessError(message);
      } finally {
        setProcessLoading(false);
      }
    })();

    processLoadInFlightRef.current = pending;
    try {
      await pending;
    } finally {
      processLoadInFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (selectedProcess?.executable) {
      setProcessExecutable(selectedProcess.executable);
    }
  }, [selectedProcess]);

  useEffect(() => {
    const shouldAutoLoad = route.path === "/schedule/new" && mode === "processExit";
    if (!shouldAutoLoad) {
      processAutoLoadEntryRef.current = null;
      return;
    }

    const entryKey = `${route.path}:${mode}:${routeSearchKey}`;
    if (processAutoLoadEntryRef.current === entryKey) {
      return;
    }

    processAutoLoadEntryRef.current = entryKey;
    void loadProcesses();
  }, [loadProcesses, mode, route.path, routeSearchKey]);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);



  useEffect(() => {
    if (!showSettingsSavedToast) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setShowSettingsSavedToast(false);
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, [showSettingsSavedToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.ctrlKey || event.metaKey;

      if (isMeta && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setScheduleMode("countdown");
      }

      if (event.key === "Escape") {
        if (confirmDraft) {
          setConfirmDraft(null);
          return;
        }

        if (selectedHistoryEventId) {
          setSelectedHistoryEventId(null);
          return;
        }

        if (quitGuard) {
          setQuitGuard(null);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmDraft, quitGuard, selectedHistoryEventId, setScheduleMode]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const register = async () => {
      try {
        const detach = await listen<ScheduleRequest>("tray_quick_start_requested", ({ payload }) => {
          const request = payload;

          if (request.preAlerts && request.preAlerts.length > 0) {
            setPreAlertMinutes(decodeAlertMinutes(request.preAlerts));
          }

          if (request.mode === "countdown") {
            setScheduleMode("countdown");
            setDurationMinutes(Math.max(1, Math.round((request.durationSec ?? 3600) / 60)));
            setSelectedProcess(null);
            setProcessExecutable("");
            setProcessCmdlineContains("");
          } else if (request.mode === "specificTime") {
            setScheduleMode("specificTime");
            setTargetLocalTime(request.targetLocalTime ?? "23:40");
            setSelectedProcess(null);
            setProcessExecutable("");
            setProcessCmdlineContains("");
          } else {
            setScheduleMode("processExit");
            const selector = request.processSelector;
            if (selector?.pid !== undefined) {
              setSelectedProcess({
                pid: selector.pid,
                name: selector.name?.trim() || `PID ${selector.pid}`,
                executable: selector.executable,
              });
            } else {
              setSelectedProcess(null);
            }
            setProcessExecutable(selector?.executable ?? "");
            setProcessCmdlineContains(selector?.cmdlineContains ?? "");
            setStableSeconds(Math.max(5, Math.round(request.processStableSec ?? 10)));
          }

          setActionError("");
          setConfirmDraft({
            request,
            summary: summarizeScheduleRequest(request),
            timingText: summarizeScheduleTiming(request, Date.now()),
          });
        });

        if (cancelled) {
          detach();
          return;
        }

        unlisten = detach;
      } catch {
        // no-op (non-tauri runtime)
      }
    };

    void register();

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [setScheduleMode]);
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const register = async () => {
      try {
        const detach = await listen<QuitGuardPayload>("quit_guard_requested", ({ payload }) => {
          setQuitGuard(payload);
          setActionError("");
        });

        if (cancelled) {
          detach();
          return;
        }

        unlisten = detach;
      } catch {
        // no-op (non-tauri runtime)
      }
    };

    void register();

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const withBusy = useCallback(async (job: () => Promise<void>) => {
    setBusy(true);
    setActionError("");
    try {
      await job();
    } catch (error) {
      const message = error instanceof Error ? error.message : "요청 처리 중 오류가 발생했습니다.";
      setActionError(message);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await copyToClipboard(text);
      setActionError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "클립보드 복사에 실패했습니다.";
      setActionError(message);
    }
  }, []);

  const active = snapshot?.active;
  const nowMs = snapshot?.nowMs ?? Date.now();
  const shutdownAtMs = active?.shutdownAtMs;
  const triggerReferenceMs = shutdownAtMs ?? active?.triggerAtMs;

  const remainingSeconds = useMemo(() => {
    if (shutdownAtMs !== undefined) {
      return Math.max(0, Math.floor((shutdownAtMs - nowMs) / 1000));
    }
    if (!active?.triggerAtMs) {
      return null;
    }
    return Math.max(0, Math.floor((active.triggerAtMs - nowMs) / 1000));
  }, [active?.triggerAtMs, nowMs, shutdownAtMs]);

  const finalWarningRemainingSeconds = useMemo(() => {
    if (active?.status !== "finalWarning") {
      return null;
    }

    if (shutdownAtMs !== undefined) {
      return Math.max(0, Math.floor((shutdownAtMs - nowMs) / 1000));
    }

    if (active.finalWarningStartedAtMs === undefined) {
      return null;
    }

    const elapsed = Math.floor((nowMs - active.finalWarningStartedAtMs) / 1000);
    return Math.max(0, active.finalWarningDurationSec - elapsed);
  }, [active, nowMs, shutdownAtMs]);
  const isFinalWarningDialogOpen =
    !quitGuard &&
    active?.status === "finalWarning" &&
    finalWarningRemainingSeconds !== null;

  const softCountdownRemainingSeconds = useMemo(() => {
    if (!active || remainingSeconds === null) {
      return null;
    }
    if (remainingSeconds <= 0 || remainingSeconds > SOFT_COUNTDOWN_WINDOW_SEC) {
      return null;
    }
    return remainingSeconds;
  }, [active, remainingSeconds]);

  const isSoftCountdownBannerVisible =
    !quitGuard &&
    !isFinalWarningDialogOpen &&
    softCountdownRemainingSeconds !== null;

  const shouldPinWindowAlwaysOnTop =
    isFinalWarningDialogOpen || softCountdownRemainingSeconds !== null;

  const isWatchingProcess = active?.mode === "processExit" && active.status === "armed";

  const processExitSnoozeLabel = useMemo(() => {
    if (
      active?.mode !== "processExit" ||
      active.snoozeUntilMs === undefined ||
      active.snoozeUntilMs <= nowMs
    ) {
      return null;
    }

    return new Date(active.snoozeUntilMs).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [active, nowMs]);

  const triggerAtLabel = useMemo(() => {
    if (triggerReferenceMs === undefined) {
      return null;
    }
    return formatAbsoluteAndRelative(triggerReferenceMs, nowMs);
  }, [nowMs, triggerReferenceMs]);

  const schedulePreviewMs = useMemo(() => {
    if (mode === "countdown") {
      if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
        return null;
      }
      return nowMs + Math.round(durationMinutes * 60 * 1000);
    }

    if (mode === "specificTime") {
      return computeSpecificTimePreviewMs(targetLocalTime, nowMs);
    }

    return null;
  }, [durationMinutes, mode, nowMs, targetLocalTime]);

  const schedulePreviewLabel = useMemo(() => {
    if (mode === "processExit") {
      return "프로세스 종료를 감지하면 즉시 최종 경고를 시작합니다.";
    }

    if (schedulePreviewMs === null) {
      return "입력값을 확인해 주세요.";
    }

    return formatAbsoluteAndRelative(schedulePreviewMs, nowMs);
  }, [mode, nowMs, schedulePreviewMs]);

  const shellFallbackWarning = useMemo(() => {
    if (mode !== "processExit" || !selectedProcess) {
      return false;
    }

    if (processExecutable.trim().length > 0 || processCmdlineContains.trim().length > 0) {
      return false;
    }

    return isShellLikeProcessName(selectedProcess.name);
  }, [mode, processCmdlineContains, processExecutable, selectedProcess]);

  const builderInlineError = useMemo(() => {
    if (mode === "countdown" && (!Number.isFinite(durationMinutes) || durationMinutes < 1)) {
      return "카운트다운은 최소 1분 이상이어야 합니다.";
    }

    if (mode === "specificTime" && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(targetLocalTime)) {
      return "종료 시각은 HH:MM 형식으로 입력해 주세요.";
    }

    if (mode === "processExit" && !selectedProcess) {
      return "감시할 프로세스를 선택해 주세요.";
    }

    if (shellFallbackWarning) {
      return "Shell 계열 감시는 실행 파일 경로나 명령어 토큰을 입력해야 합니다.";
    }

    return "";
  }, [durationMinutes, mode, selectedProcess, shellFallbackWarning, targetLocalTime]);

  const historyViewModels = useMemo(() => {
    const mapped = (snapshot?.history ?? []).map((item) => buildHistoryEventViewModel(item, nowMs));

    const filtered = mapped.filter((event) => {
      if (historyFilter !== "all" && historyFilter !== event.resultCategory) {
        return false;
      }

      if (!historySearchQuery.trim()) {
        return true;
      }

      const needle = historySearchQuery.trim().toLowerCase();
      const haystack =
        `${event.title} ${event.description} ${event.modeLabel} ${event.channelLabel} ${event.metaChips.join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    });

    const sorted = filtered.sort((left, right) =>
      historySort === "latest"
        ? right.item.timestampMs - left.item.timestampMs
        : left.item.timestampMs - right.item.timestampMs,
    );

    return sorted;
  }, [historyFilter, historySearchQuery, historySort, nowMs, snapshot?.history]);

  const dashboardRecentEvents = useMemo(() => historyViewModels.slice(0, 10), [historyViewModels]);
  const visibleHistoryViewModels = useMemo(
    () => historyViewModels.slice(0, historyVisibleCount),
    [historyViewModels, historyVisibleCount],
  );
  const canLoadMoreHistory = visibleHistoryViewModels.length < historyViewModels.length;

  useEffect(() => {
    setHistoryVisibleCount(HISTORY_PAGE_SIZE);
  }, [historyFilter, historySearchQuery, historySort]);

  const selectedHistoryEvent = useMemo(() => {
    if (!selectedHistoryEventId) {
      return null;
    }
    return historyViewModels.find((event) => event.id === selectedHistoryEventId) ?? null;
  }, [historyViewModels, selectedHistoryEventId]);

  useEffect(() => {
    if (!selectedHistoryEventId) {
      return;
    }

    const matched = historyViewModels.some((event) => event.id === selectedHistoryEventId);
    if (!matched) {
      setSelectedHistoryEventId(null);
    }
  }, [historyViewModels, selectedHistoryEventId]);

  useEffect(() => {
    if (
      selectedHistoryEventId &&
      route.path !== "/dashboard" &&
      route.path !== "/history"
    ) {
      setSelectedHistoryEventId(null);
    }
  }, [route.path, selectedHistoryEventId]);

  useEffect(() => {
    if (selectedHistoryEventId) {
      return;
    }

    const restoreTarget = historyDetailRestoreFocusRef.current;
    if (restoreTarget && document.contains(restoreTarget)) {
      window.requestAnimationFrame(() => restoreTarget.focus());
    }
    historyDetailRestoreFocusRef.current = null;
  }, [selectedHistoryEventId]);

  useEffect(() => {
    if (!isFinalWarningDialogOpen) {
      if (quitGuard) {
        finalWarningRestoreFocusRef.current = null;
        return;
      }
      const restoreTarget = finalWarningRestoreFocusRef.current;
      if (restoreTarget && document.contains(restoreTarget)) {
        window.requestAnimationFrame(() => restoreTarget.focus());
      }
      finalWarningRestoreFocusRef.current = null;
      return;
    }

    const dialog = finalWarningOverlayRef.current;
    if (!dialog) {
      return;
    }

    const currentFocus = document.activeElement;
    finalWarningRestoreFocusRef.current =
      currentFocus instanceof HTMLElement ? currentFocus : null;

    const focusableElements = getFocusableElements(dialog);
    const primaryAction =
      finalWarningCancelButtonRef.current && !finalWarningCancelButtonRef.current.disabled
        ? finalWarningCancelButtonRef.current
        : focusableElements[0];
    primaryAction?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }

      const nodes = getFocusableElements(dialog);
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!activeElement || activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
    };
  }, [isFinalWarningDialogOpen, quitGuard]);

  useEffect(() => {
    if (alwaysOnTopPinnedRef.current === shouldPinWindowAlwaysOnTop) {
      return;
    }

    alwaysOnTopPinnedRef.current = shouldPinWindowAlwaysOnTop;
    try {
      void getCurrentWindow()
        .setAlwaysOnTop(shouldPinWindowAlwaysOnTop)
        .catch(() => {
          // no-op (runtime may not support always-on-top)
        });
    } catch {
      // no-op (non-tauri runtime)
    }
  }, [shouldPinWindowAlwaysOnTop]);

  useEffect(() => {
    return () => {
      if (!alwaysOnTopPinnedRef.current) {
        return;
      }
      alwaysOnTopPinnedRef.current = false;
      try {
        void getCurrentWindow()
          .setAlwaysOnTop(false)
          .catch(() => {
            // no-op (runtime may not support always-on-top)
          });
      } catch {
        // no-op (non-tauri runtime)
      }
    };
  }, []);

  const filteredProcesses = useMemo(() => {
    const needle = processSearchQuery.trim().toLowerCase();
    if (!needle) {
      return processes;
    }

    return processes.filter((process) => {
      const searchable = `${process.name} ${process.pid} ${process.executable ?? ""}`.toLowerCase();
      return searchable.includes(needle);
    });
  }, [processSearchQuery, processes]);

  const activeTimelineItems = useMemo(() => {
    if (!active) {
      return [];
    }

    const items: Array<{
      id: string;
      title: string;
      timestamp: string;
      description: string;
      tone: "default" | "ok" | "warn";
    }> = [];

    if (active.mode === "processExit") {
      items.push({
        id: "watch-process",
        title: "프로세스 종료 감시",
        timestamp: "진행 중",
        description: "대상 종료를 감지하면 최종 경고 단계로 즉시 전환합니다.",
        tone: "default",
      });
    } else if (active.triggerAtMs) {
      const alerts = decodeAlertMinutes(active.preAlerts);
      for (const minute of alerts) {
        const alertTime = active.triggerAtMs - minute * 60 * 1000;
        items.push({
          id: `alert-${minute}`,
          title: `${minute}분 전 알림`,
          timestamp: formatAbsoluteDateTime(alertTime),
          description: alertTime <= nowMs ? "알림 전송 완료" : "예정된 사전 알림",
          tone: alertTime <= nowMs ? "ok" : "default",
        });
      }
    }

    items.push({
      id: "final-warning",
      title: "최종 경고",
      timestamp:
        active.status === "finalWarning"
          ? `${formatSeconds(finalWarningRemainingSeconds ?? active.finalWarningDurationSec)} 남음`
          : `${active.finalWarningDurationSec}초`,
      description: "최종 경고 단계에서도 취소/미루기가 가능합니다.",
      tone: active.status === "finalWarning" ? "warn" : "default",
    });

    return items;
  }, [active, finalWarningRemainingSeconds, nowMs]);

  const notificationPreviewText = useMemo(() => {
    const preAlertLabel =
      defaultAlertMinutes.length > 0
        ? defaultAlertMinutes.map((minute) => `${minute}분`).join(" / ")
        : "선택 안 함";
    return `사전 알림: ${preAlertLabel} · 최종 경고: ${finalWarningSecInput}초 · 최종 경고에서도 취소/미루기 가능`;
  }, [defaultAlertMinutes, finalWarningSecInput]);



  const resumePolicyBanner = useMemo(() => {
    if (!snapshot) {
      return "";
    }

    const now = snapshot.nowMs ?? Date.now();
    for (let index = snapshot.history.length - 1; index >= 0; index -= 1) {
      const item = snapshot.history[index];
      if (item.eventType !== "resume_not_supported") {
        continue;
      }

      const ageMs = now - item.timestampMs;
      if (ageMs < -1000 || ageMs > 5 * 60 * 1000) {
        return "";
      }

      return item.reason ?? "MVP 정책에 따라 이전 세션의 활성 예약은 자동 복구되지 않고 해제되었습니다.";
    }

    return "";
  }, [snapshot]);

  const processExitGuardBanner = useMemo(() => {
    if (!snapshot) {
      return "";
    }

    const now = snapshot.nowMs ?? Date.now();
    for (let index = snapshot.history.length - 1; index >= 0; index -= 1) {
      const item = snapshot.history[index];
      const reason = item.reason ?? "";
      if (item.eventType !== "failed" || !reason.includes("NO_FAIL_OPEN_PROCESS_EXIT")) {
        continue;
      }

      const ageMs = now - item.timestampMs;
      if (ageMs < -1000 || ageMs > 5 * 60 * 1000) {
        return "";
      }

      return "프로세스 감시 설정이 유효하지 않아 예약이 안전 중단되었습니다. 감시 대상을 다시 선택해 주세요.";
    }

    return "";
  }, [snapshot]);

  const stateParseGuardBanner = useMemo(() => {
    if (!snapshot) {
      return "";
    }

    const now = snapshot.nowMs ?? Date.now();
    for (let index = snapshot.history.length - 1; index >= 0; index -= 1) {
      const item = snapshot.history[index];
      if (item.eventType !== "state_parse_failed") {
        continue;
      }

      const ageMs = now - item.timestampMs;
      if (ageMs < -1000 || ageMs > 10 * 60 * 1000) {
        return "";
      }

      return "상태 파일 손상이 감지되어 복구 절차가 실행되었습니다. 현재 예약과 설정을 확인해 주세요.";
    }

    return "";
  }, [snapshot]);

  const statusBadgeLabel = active ? STATUS_LABEL_MAP[active.status] : STATUS_TAG_COPY.idle;
  const remainingTimeLabel = active
    ? remainingSeconds !== null
      ? formatSeconds(remainingSeconds)
      : isWatchingProcess
        ? STATUS_TAG_COPY.watchingProcess
        : "-"
    : "-";

  const triggerAtDisplayLabel = active
    ? triggerAtLabel ?? (isWatchingProcess ? STATUS_TAG_COPY.watchingProcess : "-")
    : "-";
  const shutdownAtDisplayLabel =
    active && triggerReferenceMs !== undefined ? formatAbsoluteDateTime(triggerReferenceMs) : "-";

  const liveStatusText = active
    ? remainingSeconds !== null
      ? `다음 종료 ${triggerAtDisplayLabel} · 남은 시간 ${formatSeconds(remainingSeconds)} · 취소/미루기는 하단에서 즉시 실행할 수 있습니다.`
      : processExitSnoozeLabel
        ? `프로세스 감시 중 · ${processExitSnoozeLabel}까지 유예됨 · 취소/미루기 가능`
        : isWatchingProcess
          ? "프로세스 감시 중 · 완료 감지 시 최종 경고가 시작됩니다."
          : "남은 시간을 계산 중입니다."
    : UI_COPY.activeScheduleMissing;

  useEffect(() => {
    const status = active?.status ?? "idle";
    const latestHistory = snapshot?.history[snapshot.history.length - 1];
    const latestHistoryKey = latestHistory
      ? `${latestHistory.timestampMs}-${latestHistory.eventType}-${latestHistory.result}`
      : "";

    if (!liveRegionInitializedRef.current) {
      previousActiveStatusRef.current = status;
      lastHistoryAnnouncementKeyRef.current = latestHistoryKey;
      liveRegionInitializedRef.current = true;
      return;
    }

    const previousStatus = previousActiveStatusRef.current;
    if (status !== previousStatus) {
      if (status === "armed") {
        setPoliteLiveMessage(
          triggerAtDisplayLabel !== "-"
            ? `예약이 활성화되었습니다. 종료 시각은 ${triggerAtDisplayLabel}입니다.`
            : "예약이 활성화되었습니다.",
        );
      } else if (status === "finalWarning") {
        const remainingLabel = formatSeconds(
          finalWarningRemainingSeconds ?? active?.finalWarningDurationSec ?? FINAL_WARNING_SEC_DEFAULT,
        );
        setAssertiveLiveMessage(
          `최종 경고 단계입니다. 종료 시각은 ${shutdownAtDisplayLabel}이며 ${remainingLabel} 남았습니다. 지금 취소하거나 미룰 수 있습니다.`,
        );
      }

      previousActiveStatusRef.current = status;
    }

    if (!latestHistory) {
      return;
    }

    if (lastHistoryAnnouncementKeyRef.current === latestHistoryKey) {
      return;
    }

    lastHistoryAnnouncementKeyRef.current = latestHistoryKey;
    if (latestHistory.eventType === "cancelled") {
      setPoliteLiveMessage("예약이 취소되었습니다.");
    } else if (latestHistory.eventType === "executed") {
      setPoliteLiveMessage("예약된 종료가 완료되었습니다.");
    } else if (latestHistory.eventType === "failed") {
      setAssertiveLiveMessage("자동 종료 실행에 실패했습니다. 이력을 확인해 주세요.");
    } else if (latestHistory.eventType === "final_warning_reverted") {
      setPoliteLiveMessage("최종 경고가 해제되고 감시 상태로 복귀했습니다.");
    }
  }, [
    active?.finalWarningDurationSec,
    active?.status,
    finalWarningRemainingSeconds,
    snapshot,
    shutdownAtDisplayLabel,
    triggerAtDisplayLabel,
  ]);

  useEffect(() => {
    if (!actionError) {
      return;
    }
    setAssertiveLiveMessage(actionError);
  }, [actionError]);

  useEffect(() => {
    if (!statusError) {
      return;
    }
    setAssertiveLiveMessage(statusError);
  }, [statusError]);

  const routeTitle = ROUTE_LABEL_MAP[route.path] ?? BRAND_COPY.title;
  const isOnboarding = route.path.startsWith("/onboarding");

  const completeOnboarding = () => {
    window.localStorage.setItem(ONBOARDING_KEY, "true");
    setOnboardingCompleted(true);
    navigate("/dashboard");
  };

  const prepareConfirm = () => {
    setActionError("");

    if (mode === "countdown" && (!Number.isFinite(durationMinutes) || durationMinutes < 1)) {
      focusInput("duration-minutes");
      setActionError("카운트다운 시간은 1분 이상이어야 합니다.");
      return;
    }

    if (mode === "specificTime" && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(targetLocalTime)) {
      focusInput("target-time");
      setActionError("종료 시각은 HH:MM 형식으로 입력해 주세요.");
      return;
    }

    if (mode === "processExit" && !selectedProcess) {
      focusInput("process-search");
      setActionError("감시할 프로세스를 선택해 주세요.");
      return;
    }

    if (shellFallbackWarning) {
      focusInput("process-executable");
      setActionError("Shell 계열 감시는 실행 파일 경로나 명령어 토큰을 입력해야 합니다.");
      return;
    }

    try {
      const next = buildConfirmDraft(
        mode,
        durationMinutes,
        targetLocalTime,
        selectedProcess,
        stableSeconds,
        processExecutable,
        processCmdlineContains,
        preAlertMinutes,
        nowMs,
      );

      if (active) {
        next.summary = `${next.summary} (기존 활성 예약은 교체됨)`;
      }

      setConfirmDraft(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : "입력값을 확인해 주세요.";
      setActionError(message);
    }
  };
  const handleArm = async () => {
    if (!confirmDraft) {
      return;
    }

    await withBusy(async () => {
      const next = await armSchedule(confirmDraft.request);
      setSnapshot(next);
      setConfirmDraft(null);
      navigate("/schedule/active");
    });
  };

  const handleCancel = async () => {
    await withBusy(async () => {
      const next = await cancelSchedule("사용자가 앱에서 취소함");
      setSnapshot(next);
    });
  };

  const handlePostpone = async (minutes = postponeMinutes) => {
    await withBusy(async () => {
      const next = await postponeSchedule(Math.round(minutes), "사용자가 앱에서 미루기 실행");
      setSnapshot(next);
    });
  };

  const handleSaveGeneralSettings = async () => {
    await withBusy(async () => {
      const next = await updateSettings({ simulateOnly: simulateOnlyDraft });
      setSnapshot(next);
      setSimulateOnlyDraft(next.settings.simulateOnly);
      setShowSettingsSavedToast(true);
    });
  };

  const handleSaveNotificationSettings = async () => {
    await withBusy(async () => {
      const finalWarningSec = validateFinalWarningSeconds(finalWarningSecInput);
      const next = await updateSettings({
        defaultPreAlerts: encodeAlertMinutes(defaultAlertMinutes),
        finalWarningSec,
      });
      setSnapshot(next);
      setDefaultAlertMinutes(decodeAlertMinutes(next.settings.defaultPreAlerts));
      setFinalWarningSecInput(next.settings.finalWarningSec);
      setShowSettingsSavedToast(true);
    });
  };

  const handleToggleBuilderPreAlertMinute = useCallback((minute: number) => {
    setPreAlertMinutes((current) => {
      try {
        return toggleAlertMinute(current, minute);
      } catch (error) {
        const message = error instanceof Error ? error.message : "사전 알림을 확인해 주세요.";
        setActionError(message);
        return current;
      }
    });
  }, []);

  const handleToggleDefaultAlertMinute = useCallback((minute: number) => {
    setDefaultAlertMinutes((current) => {
      try {
        return toggleAlertMinute(current, minute);
      } catch (error) {
        const message = error instanceof Error ? error.message : "사전 알림을 확인해 주세요.";
        setActionError(message);
        return current;
      }
    });
  }, []);

  const handleHelpExternalLink = useCallback(
    async (url: string) => {
      if (isOffline) {
        setActionError(UI_COPY.helpOffline);
        return;
      }

      try {
        await openExternal(url);
        setActionError("");
      } catch (error) {
        const message = error instanceof Error ? error.message : "외부 링크를 열지 못했습니다.";
        setActionError(message);
      }
    },
    [isOffline],
  );

  const handleOpenNotificationSettings = useCallback(async () => {
    const platform = window.navigator.platform.toLowerCase();
    let target = "https://support.microsoft.com/windows/change-notification-settings-in-windows";

    if (platform.includes("win")) {
      target = "ms-settings:notifications";
    } else if (platform.includes("mac")) {
      target = "x-apple.systempreferences:com.apple.preference.notifications";
    }

    try {
      await openExternal(target);
      setActionError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "알림 설정 화면을 열지 못했습니다.";
      setActionError(message);
    }
  }, []);

  const handleResolveQuitGuard = useCallback(
    async (action: QuitGuardAction) => {
      if (quitBusy) {
        return;
      }

      setQuitBusy(true);
      try {
        const next = await resolveQuitGuard(action);
        setSnapshot(next);
        setQuitGuard(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "종료 요청 처리에 실패했습니다.";
        setActionError(message);
      } finally {
        setQuitBusy(false);
      }
    },
    [quitBusy],
  );

  const openHistoryEventDetail = useCallback((eventId: string) => {
    const currentFocus = document.activeElement;
    historyDetailRestoreFocusRef.current =
      currentFocus instanceof HTMLElement ? currentFocus : null;
    setSelectedHistoryEventId(eventId);
  }, []);

  const renderOnboarding = () => {
    if (route.path === "/onboarding/welcome") {
      return (
        <Page narrow>
          <PageSection aria-labelledby="onboarding-welcome-title">
            <PageHeader id="onboarding-welcome-title" title="자동 종료 예약 도우미" />
            <p>다운로드/렌더링/배치 작업이 끝나는 시점에 맞춰 PC 종료를 안전하게 예약할 수 있습니다.</p>
            <ul className="plain-list">
              <li>카운트다운, 특정 시각, 프로세스 감시 모드를 지원합니다.</li>
              <li>사전 알림(10/5/1분)과 최종 경고(기본 60초)를 제공합니다.</li>
              <li>최종 경고 단계에서도 취소/미루기를 실행할 수 있습니다.</li>
            </ul>
            <Inline justify="end">
              <AppButton onClick={() => navigate("/onboarding/permissions")}>다음</AppButton>
            </Inline>
          </PageSection>
        </Page>
      );
    }

    if (route.path === "/onboarding/permissions") {
      return (
        <Page narrow>
          <PageSection aria-labelledby="onboarding-permission-title">
            <PageHeader id="onboarding-permission-title" title="권한 및 동작 안내" />
            <ul className="plain-list">
              <li>프로세스 감시 모드에서는 실행 중인 프로세스 조회 권한이 필요합니다.</li>
              <li>알림 권한이 차단되면 앱 내부 경고와 트레이 경로로 보완됩니다.</li>
              <li>창을 닫으면 앱은 종료되지 않고 트레이로 최소화됩니다.</li>
            </ul>
            <Inline justify="between">
              <AppButton variant="secondary" onClick={() => navigate("/onboarding/welcome")}>이전</AppButton>
              <AppButton variant="secondary" onClick={() => void loadProcesses()}>프로세스 조회 테스트</AppButton>
              <AppButton onClick={() => navigate("/onboarding/safety")}>다음</AppButton>
            </Inline>
            {processError ? <AlertBanner tone="danger">{processError}</AlertBanner> : null}
          </PageSection>
        </Page>
      );
    }

    return (
      <Page narrow>
        <PageSection aria-labelledby="onboarding-safety-title">
          <PageHeader id="onboarding-safety-title" title="안전 고지" />
          <ul className="plain-list">
            <li>종료 시각 전에 작업 저장 상태를 반드시 확인하세요.</li>
            <li>취소/미루기는 앱 하단, 트레이, 최종 경고 오버레이에서 모두 가능합니다.</li>
            <li>Google 연동은 옵션 기능이며 MVP 필수 기능이 아닙니다.</li>
          </ul>
          <Inline justify="between">
            <AppButton variant="secondary" onClick={() => navigate("/onboarding/permissions")}>이전</AppButton>
            <AppButton onClick={completeOnboarding}>동의하고 시작</AppButton>
          </Inline>
        </PageSection>
      </Page>
    );
  };

  const renderStatusActionCard = (withDetailButton: boolean) => (
    <Card className="screen-status-card">
      <CardHeader>
        <div>
          <CardTitle>현재 상태</CardTitle>
          <CardDescription>{active ? active.summary : UI_COPY.activeScheduleMissing}</CardDescription>
        </div>
        <Badge kind="status" tone={statusToneFromActive(active)}>
          {statusBadgeLabel}
        </Badge>
      </CardHeader>
      <div className="screen-status-grid">
        <div>
          <p className="eyebrow">남은 시간</p>
          <p className="metric-value tabular">{remainingTimeLabel}</p>
        </div>
        <div>
          <p className="eyebrow">종료 시각</p>
          <p className="metric-value tabular">{triggerAtDisplayLabel}</p>
        </div>
      </div>
      <CardActions className="screen-status-actions">
        {!active ? (
          <AppButton onClick={() => setScheduleMode("countdown")}>새 예약 만들기</AppButton>
        ) : (
          <>
            <AppButton variant="destructive" immediate className="safety-action" onClick={() => void handleCancel()} disabled={busy}>지금 취소</AppButton>
            <AppButton variant="secondary" immediate className="safety-action" onClick={() => void handlePostpone(10)} disabled={busy}>10분 미루기</AppButton>
            {withDetailButton ? <AppButton variant="ghost" onClick={() => navigate("/schedule/active")}>세부 보기</AppButton> : null}
          </>
        )}
      </CardActions>
    </Card>
  );
  const renderScheduleBuilder = () => {
    const processRows = filteredProcesses.slice(0, 120).map((process) => ({
      id: String(process.pid),
      selected: selectedProcess?.pid === process.pid,
      onSelect: () => setSelectedProcess(process),
      cells: {
        process: (
          <span className="table-main-cell">
            <strong>{process.name}</strong>
            <span className="muted">{process.executable ?? "경로 정보 없음"}</span>
          </span>
        ),
        pid: <span className="tabular">{process.pid}</span>,
        path: <span className="muted">{process.executable ?? "-"}</span>,
      },
    }));

    return (
      <Page>
        <PageSection aria-labelledby="builder-title">
          <PageHeader id="builder-title" title="새 예약 만들기" description="모드 선택 → 값 입력 → 확인 모달 순서로 진행합니다." />

          <div className="builder-mode-sticky">
            <SegmentedControl<ScheduleMode>
              className="mode-switch"
              name="schedule-mode"
              ariaLabel="예약 모드"
              value={mode}
              onChange={(nextMode) => setScheduleMode(nextMode)}
              options={[
                { value: "countdown", label: MODE_LABEL_MAP.countdown },
                { value: "specificTime", label: MODE_LABEL_MAP.specificTime },
                { value: "processExit", label: MODE_LABEL_MAP.processExit },
              ]}
            />
            <p className="muted inline-help">카운트다운/특정 시각/프로세스 감시 중 하나를 선택하세요.</p>
          </div>

          <div className="builder-layout-v2">
            <Card className="builder-form-card">
              <Stack gap="md">
                {mode === "countdown" ? (
                  <>
                    <ChipGroup className="preset-row" ariaLabel="카운트다운 프리셋">
                      {COUNTDOWN_PRESET_MINUTES.map((minutes) => (
                        <Chip
                          key={minutes}
                          selected={durationMinutes === minutes}
                          onClick={() => setDurationMinutes(minutes)}
                        >
                          {formatCountdownPresetLabel(minutes)}
                        </Chip>
                      ))}
                    </ChipGroup>
                    <FormRow label="카운트다운(분)" htmlFor="duration-minutes">
                      <AppInput
                        id="duration-minutes"
                        type="number"
                        min={1}
                        max={10080}
                        value={durationMinutes}
                        onChange={(event) => setDurationMinutes(Number(event.currentTarget.value))}
                      />
                    </FormRow>
                  </>
                ) : null}

                {mode === "specificTime" ? (
                  <FormRow label="종료 시각(HH:MM)" htmlFor="target-time">
                    <AppInput
                      id="target-time"
                      type="time"
                      value={targetLocalTime}
                      onChange={(event) => setTargetLocalTime(event.currentTarget.value)}
                    />
                  </FormRow>
                ) : null}

                {mode === "processExit" ? (
                  <>
                    <AlertBanner tone="warn">프로세스 감시는 종료 감지 후 최종 경고로 바로 진입합니다.</AlertBanner>
                    <Inline justify="between" align="end">
                      <FormRow compact label="검색" htmlFor="process-search">
                        <AppInput
                          id="process-search"
                          type="text"
                          value={processSearchQuery}
                          onChange={(event) => setProcessSearchQuery(event.currentTarget.value)}
                          placeholder="프로세스명, PID, 경로 검색"
                        />
                      </FormRow>
                      <AppButton variant="secondary" size="sm" onClick={() => void loadProcesses()}>
                        {processLoading ? "새로고침 중..." : "새로고침"}
                      </AppButton>
                    </Inline>
                    {processError ? <AlertBanner tone="danger">{processError}</AlertBanner> : null}
                    {processRows.length === 0 ? (
                      <EmptyState
                        heading="검색 결과가 없습니다"
                        description="프로세스를 찾지 못한 경우 시간 기반 예약으로 전환할 수 있습니다."
                        action={<AppButton onClick={() => setScheduleMode("countdown")}>시간 기반으로 전환</AppButton>}
                      />
                    ) : (
                      <DataTable
                        ariaLabel="프로세스 목록"
                        columns={[
                          { key: "process", header: "프로세스", align: "start" },
                          { key: "pid", header: "PID", align: "end" },
                          { key: "path", header: "실행 파일", align: "start" },
                        ]}
                        rows={processRows}
                      />
                    )}
                    <Card className="process-selected-card">
                      <CardTitle>선택 요약</CardTitle>
                      {selectedProcess ? (
                        <Stack gap="sm">
                          <p className="strong">{selectedProcess.name} <span className="tabular">(PID {selectedProcess.pid})</span></p>
                          <p className="muted">경로: {selectedProcess.executable ?? "경로 정보 없음"}</p>
                        </Stack>
                      ) : (
                        <CardDescription>프로세스를 선택하면 감시 대상 요약이 표시됩니다.</CardDescription>
                      )}
                    </Card>
                    <FormRow label="안정 구간(초)" htmlFor="stable-seconds" hint="5~600초 권장">
                      <AppInput
                        id="stable-seconds"
                        type="number"
                        min={5}
                        max={600}
                        value={stableSeconds}
                        onChange={(event) => setStableSeconds(Number(event.currentTarget.value))}
                      />
                    </FormRow>
                    <FormRow label="실행 파일 경로(권장)" htmlFor="process-executable">
                      <AppInput
                        id="process-executable"
                        type="text"
                        value={processExecutable}
                        onChange={(event) => setProcessExecutable(event.currentTarget.value)}
                      />
                    </FormRow>
                    <FormRow label="명령어 포함 토큰(선택)" htmlFor="process-cmdline-token">
                      <AppInput
                        id="process-cmdline-token"
                        type="text"
                        value={processCmdlineContains}
                        onChange={(event) => setProcessCmdlineContains(event.currentTarget.value)}
                      />
                    </FormRow>
                  </>
                ) : (
                  <FormRow label="사전 알림 시점" hint="시간 기반 모드에서만 적용됩니다.">
                    <ChipGroup ariaLabel="사전 알림 시점">
                      {PRE_ALERT_OPTION_MINUTES.map((minute) => (
                        <Chip
                          key={`builder-alert-${minute}`}
                          selected={preAlertMinutes.includes(minute)}
                          onClick={() => handleToggleBuilderPreAlertMinute(minute)}
                        >
                          {minute}분
                        </Chip>
                      ))}
                    </ChipGroup>
                  </FormRow>
                )}
              </Stack>
            </Card>

            <Card className="builder-preview-card" aria-live="polite">
              <Stack gap="md">
                <CardTitle>예약 미리보기</CardTitle>
                <CardDescription>예상 종료: <span className="tabular">{schedulePreviewLabel}</span></CardDescription>
                <CardDescription>취소/미루기 경로: 앱 하단 바 · 트레이 메뉴 · 최종 경고 오버레이</CardDescription>
                {builderInlineError ? <AlertBanner tone="danger">{builderInlineError}</AlertBanner> : null}
                <Inline justify="between" className="builder-actions">
                  <AppButton onClick={prepareConfirm} disabled={busy || Boolean(builderInlineError)}>예약 준비</AppButton>
                  <AppButton
                    variant="secondary"
                    onClick={() => navigate("/schedule/active")}
                    disabled={!active}
                    title={!active ? UI_COPY.builderSecondaryDisabledHint : undefined}
                  >
                    활성 예약 보기
                  </AppButton>
                </Inline>
              </Stack>
            </Card>
          </div>
        </PageSection>
      </Page>
    );
  };

  const renderMainContent = () => {
    if (isOnboarding) {
      return renderOnboarding();
    }

    if (!snapshot) {
      return (
        <Page>
          <PageSection aria-label="초기 상태 로딩">
            <Stack gap="sm">
              <Skeleton width="34%" height={24} />
              <Skeleton width="100%" height={44} />
              <Skeleton width="100%" height={44} />
              <Skeleton width="72%" height={16} />
            </Stack>
          </PageSection>
        </Page>
      );
    }

    if (route.path === "/dashboard") {
      return (
        <Page>
          <Stack gap="lg">
            {renderStatusActionCard(true)}
            <PageSection aria-labelledby="dashboard-current-title">
              <PageHeader id="dashboard-current-title" title="지금 할 일" description="상태와 다음 동작을 먼저 확인하세요." />
              {!active ? (
                <EmptyState
                  icon="clock"
                  title="예약이 없어요"
                  description="새 예약을 만들면 종료 시각(절대/상대)과 취소/미루기 경로가 즉시 표시됩니다."
                  primaryAction={<AppButton onClick={() => setScheduleMode("countdown")}>새 예약 만들기</AppButton>}
                />
              ) : (
                <Card className="current-schedule-card">
                  <CardTitle>다음 종료와 즉시 행동</CardTitle>
                  <div className="current-schedule-grid">
                    <div>
                      <p className="eyebrow">상태</p>
                      <p className="strong">{active.summary}</p>
                    </div>
                    <div>
                      <p className="eyebrow">종료 시각</p>
                      <p className="tabular">{triggerAtDisplayLabel}</p>
                    </div>
                    <div>
                      <p className="eyebrow">지금 할 수 있는 것</p>
                      <p className="muted">지금 취소 또는 5/10/15분 미루기를 바로 실행하세요.</p>
                    </div>
                  </div>
                </Card>
              )}
            </PageSection>

            <PageSection aria-labelledby="dashboard-events-title">
              <PageHeader
                id="dashboard-events-title"
                title="최근 이벤트"
                actions={<AppButton variant="secondary" onClick={() => navigate("/history")}>전체 보기</AppButton>}
              />
              <EventList
                ariaLabel="최근 이벤트 목록"
                items={dashboardRecentEvents.map((event) => ({
                  id: event.id,
                  icon: event.eventIcon,
                  title: event.description,
                  subtitle: undefined,
                  resultTone: event.resultTone,
                  resultLabel: event.title,
                  metaChips: event.metaChips,
                  selected: selectedHistoryEventId === event.id,
                  onSelect: () => openHistoryEventDetail(event.id),
                }))}
                emptyState={UI_COPY.historyEmpty}
              />
            </PageSection>
          </Stack>
        </Page>
      );
    }

    if (route.path === "/schedule/new") {
      return renderScheduleBuilder();
    }
    if (route.path === "/schedule/active") {
      return (
        <Page>
          <Stack gap="lg">
            {renderStatusActionCard(false)}
            {!active ? (
              <PageSection aria-labelledby="active-empty-title">
                <EmptyState
                  icon="clock"
                  title="현재 활성 예약이 없습니다."
                  description="다음 행동: 새 예약을 만들어 종료 시점을 지정하세요."
                  action={<AppButton onClick={() => setScheduleMode("countdown")}>새 예약 만들기</AppButton>}
                />
              </PageSection>
            ) : (
              <>
                <PageSection aria-labelledby="active-actions-title">
                  <PageHeader id="active-actions-title" title="지금 할 수 있는 것" />
                  <Card className="active-action-card">
                    <Stack gap="sm" className="active-actions">
                      <Inline>
                        <AppButton
                          id="active-cancel-action"
                          variant="destructive"
                          immediate
                          className="safety-action"
                          onClick={() => void handleCancel()}
                          disabled={busy}
                        >
                          지금 취소
                        </AppButton>
                        {QUICK_SNOOZE_OPTION_MINUTES.map((minute) => (
                          <AppButton
                            key={`active-snooze-${minute}`}
                            variant="secondary"
                            immediate
                            className="safety-action"
                            onClick={() => void handlePostpone(minute)}
                            disabled={busy}
                          >
                            {minute}분 미루기
                          </AppButton>
                        ))}
                        <AppButton
                          variant="ghost"
                          onClick={() => setShowCustomSnooze((prev) => !prev)}
                          aria-expanded={showCustomSnooze}
                          aria-controls="active-custom-snooze"
                        >
                          {showCustomSnooze ? "사용자 지정 닫기" : "사용자 지정"}
                        </AppButton>
                      </Inline>
                      {showCustomSnooze ? (
                        <Inline id="active-custom-snooze" align="end">
                          <FormRow inline className="postpone-field" label="미루기(분)" htmlFor="postpone-minutes">
                            <AppInput
                              id="postpone-minutes"
                              type="number"
                              min={1}
                              max={1440}
                              value={postponeMinutes}
                              onChange={(event) => setPostponeMinutes(Number(event.currentTarget.value))}
                            />
                          </FormRow>
                          <AppButton variant="secondary" onClick={() => void handlePostpone()} disabled={busy}>
                            적용
                          </AppButton>
                        </Inline>
                      ) : null}
                    </Stack>
                  </Card>
                </PageSection>

                <PageSection aria-labelledby="active-timeline-title">
                  <PageHeader id="active-timeline-title" title="진행 타임라인" />
                  <TimelineList
                    ariaLabel="알림 및 최종 경고 진행 단계"
                    items={activeTimelineItems.map((item) => ({
                      id: item.id,
                      title: item.title,
                      timestamp: item.timestamp,
                      description: item.description,
                      tone: item.tone,
                    }))}
                  />
                </PageSection>
              </>
            )}
          </Stack>
        </Page>
      );
    }

    if (route.path === "/history") {
      return (
        <Page>
          <PageSection aria-labelledby="history-title">
            <PageHeader id="history-title" title="이력" description="정렬/필터/검색과 행 클릭 상세로 빠르게 스캔할 수 있습니다." />
            <Inline className="history-controls" justify="between" align="end">
              <ChipGroup ariaLabel="이력 필터">
                {[
                  { key: "all", label: "전체" },
                  { key: "success", label: "성공" },
                  { key: "failed", label: "실패" },
                  { key: "info", label: "정보" },
                ].map((filter) => (
                  <Chip key={`history-filter-${filter.key}`} selected={historyFilter === filter.key} onClick={() => setHistoryFilter(filter.key as HistoryFilter)}>{filter.label}</Chip>
                ))}
              </ChipGroup>
              <Inline>
                <FormRow compact label="검색" htmlFor="history-search">
                  <AppInput
                    id="history-search"
                    type="text"
                    value={historySearchQuery}
                    onChange={(event) => setHistorySearchQuery(event.currentTarget.value)}
                    placeholder="이벤트/사유 텍스트 검색"
                  />
                </FormRow>
                <FormRow compact label="정렬" htmlFor="history-sort">
                  <AppSelect id="history-sort" value={historySort} onChange={(event) => setHistorySort(event.currentTarget.value as HistorySort)}>
                    <option value="latest">최신순</option>
                    <option value="oldest">오래된순</option>
                  </AppSelect>
                </FormRow>
              </Inline>
            </Inline>
            {historyViewModels.length === 0 ? (
              <EmptyState heading={UI_COPY.historyEmpty} />
            ) : (
              <Stack gap="sm">
                <HistoryTable
                  ariaLabel="이력 데이터 테이블"
                  rows={visibleHistoryViewModels.map((event) => ({
                    id: event.id,
                    event: (
                      <>
                        <strong>{event.description}</strong>
                        <span className="muted">{event.title}</span>
                      </>
                    ),
                    reason: `${event.channelLabel} · ${event.modeLabel}`,
                    resultTone: event.resultTone,
                    resultLabel: event.resultLabel,
                    absoluteTime: event.absoluteTime,
                    relativeTime: event.relativeTime,
                    selected: selectedHistoryEventId === event.id,
                    onOpenDetail: () => openHistoryEventDetail(event.id),
                  }))}
                />
                {canLoadMoreHistory ? (
                  <Inline justify="center">
                    <AppButton
                      variant="secondary"
                      onClick={() => setHistoryVisibleCount((count) => count + HISTORY_PAGE_SIZE)}
                    >
                      더 보기 ({HISTORY_PAGE_SIZE}개)
                    </AppButton>
                  </Inline>
                ) : null}
              </Stack>
            )}
          </PageSection>
        </Page>
      );
    }

    if (route.path === "/settings/general") {
      return (
        <Page>
          <Stack gap="lg">
            {renderStatusActionCard(false)}
            <PageSection aria-labelledby="settings-general-title">
              <PageHeader id="settings-general-title" title="일반 설정" />
              {showSettingsSavedToast ? <AlertBanner variant="info">설정을 저장했습니다.</AlertBanner> : null}
              <Card>
                <CardTitle>안전 / 동작</CardTitle>
                <CardDescription>실제 종료 실행 여부를 먼저 확인하세요.</CardDescription>
                <Inline>
                  <Badge kind="result" tone={simulateOnlyDraft ? "info" : "success"}>
                    {simulateOnlyDraft ? "시뮬레이션 활성" : "실제 종료 활성"}
                  </Badge>
                </Inline>
                <Toggle
                  id="simulate-only"
                  label="시뮬레이션 모드(실제 종료 안 함)"
                  description="테스트 중에는 반드시 켜 두세요."
                  checked={simulateOnlyDraft}
                  onChange={(event) => setSimulateOnlyDraft(event.currentTarget.checked)}
                />
              </Card>
              <Card>
                <CardTitle>저장 / 기록</CardTitle>
                <CardDescription>로컬 저장 정책과 보관 한도를 제공합니다.</CardDescription>
                <p className="muted">저장 위치: 로컬 앱 데이터</p>
                <p className="muted">이력 최대 보관: 250개 (초과 시 오래된 항목부터 정리)</p>
              </Card>
              <Card>
                <CardTitle>단축키 안내</CardTitle>
                <CardDescription>고급 사용자용 빠른 동작 레이어입니다.</CardDescription>
                <ul className="plain-list">
                  <li>Ctrl/Cmd + N: 새 예약 화면 열기</li>
                  <li>Esc: 확인 모달/상세 패널 닫기</li>
                </ul>
              </Card>
              <Inline justify="end"><AppButton onClick={() => void handleSaveGeneralSettings()} disabled={busy}>설정 저장</AppButton></Inline>
            </PageSection>
          </Stack>
        </Page>
      );
    }
    if (route.path === "/settings/notifications") {
      const notificationPermission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
      const notificationBlocked = notificationPermission === "denied" || notificationPermission === "unsupported";

      return (
        <Page>
          <Stack gap="lg">
            {renderStatusActionCard(false)}
            <PageSection aria-labelledby="settings-notification-title">
              <PageHeader id="settings-notification-title" title="알림 설정" />
              {showSettingsSavedToast ? <AlertBanner variant="info">설정을 저장했습니다.</AlertBanner> : null}
              {notificationBlocked ? (
                <AlertBanner
                  variant="danger"
                  actions={
                    <AppButton variant="secondary" size="sm" onClick={() => void handleOpenNotificationSettings()}>
                      알림 설정 열기
                    </AppButton>
                  }
                >
                  종료 전 경고를 놓칠 수 있어요. 시스템 알림 설정을 확인해 주세요.
                </AlertBanner>
              ) : null}

              <FormRow label="기본 사전 알림" hint="종료 전에 받을 알림 시점을 선택하세요.">
                <ChipGroup ariaLabel="기본 사전 알림 시점">
                  {PRE_ALERT_OPTION_MINUTES.map((minute) => (
                    <Chip key={`default-alert-${minute}`} selected={defaultAlertMinutes.includes(minute)} onClick={() => handleToggleDefaultAlertMinute(minute)}>
                      {minute}분
                    </Chip>
                  ))}
                </ChipGroup>
              </FormRow>

              <FormRow label="최종 경고(초)" hint={`${FINAL_WARNING_SEC_MIN}~${FINAL_WARNING_SEC_MAX}초 범위`} htmlFor="final-warning-seconds">
                <div className="final-warning-inputs">
                  <input
                    id="final-warning-range"
                    className="final-warning-range"
                    type="range"
                    min={FINAL_WARNING_SEC_MIN}
                    max={FINAL_WARNING_SEC_MAX}
                    value={finalWarningSecInput}
                    onChange={(event) => setFinalWarningSecInput(Number(event.currentTarget.value))}
                  />
                  <AppInput
                    id="final-warning-seconds"
                    type="number"
                    min={FINAL_WARNING_SEC_MIN}
                    max={FINAL_WARNING_SEC_MAX}
                    value={finalWarningSecInput}
                    onChange={(event) => setFinalWarningSecInput(Number(event.currentTarget.value))}
                  />
                </div>
              </FormRow>

              <Card className="notification-preview-card">
                <CardTitle>미리보기</CardTitle>
                <CardDescription>{notificationPreviewText}</CardDescription>
                <CardDescription>현재 최종 경고 시간은 {finalWarningSecInput}초입니다.</CardDescription>
              </Card>
              <Inline justify="end"><AppButton onClick={() => void handleSaveNotificationSettings()} disabled={busy}>설정 저장</AppButton></Inline>
            </PageSection>
          </Stack>
        </Page>
      );
    }



    if (route.path === "/help") {
      return (
        <Page>
          <Stack gap="lg">
            {renderStatusActionCard(false)}
            <PageSection aria-labelledby="help-title">
              <PageHeader id="help-title" title="도움말" description="안전 고지, FAQ, 문제 해결 경로를 확인하세요." />
              <Card>
                <CardTitle>안전 고지</CardTitle>
                <CardDescription>자동 종료는 파괴적 동작입니다. 취소 경로를 먼저 확인하세요.</CardDescription>
                <ul className="plain-list">
                  <li>취소 경로: 앱 하단 바 · 트레이 메뉴 · 최종 경고 오버레이</li>
                  <li>미루기 경로: 앱 하단 바 · 활성 예약 화면 · 최종 경고 오버레이</li>
                  <li>최종 경고 단계에서도 취소/미루기가 가능합니다.</li>
                </ul>
              </Card>
              <Card>
                <CardTitle>FAQ / 문제 해결</CardTitle>
                <ul className="plain-list">
                  <li>Q. 취소는 어디서 하나요? A. 앱/트레이/최종 경고 화면에서 가능합니다.</li>
                  <li>Q. 미루기는 어떻게 하나요? A. 5/10/15분 또는 입력한 값으로 미룰 수 있습니다.</li>
                  <li>Q. 알림이 오지 않아요. A. 시스템 알림 권한과 앱 알림 설정을 확인하세요.</li>
                  <li>Q. 프로세스 감시는 언제 동작하나요? A. 대상 종료 감지 후 최종 경고로 이동합니다.</li>
                  <li>Q. 권한이 필요한가요? A. 프로세스 감시 모드에서 조회 권한이 필요합니다.</li>
                </ul>
              </Card>
              <Card>
                <CardTitle>버전 / 외부 링크</CardTitle>
                <CardDescription>앱 버전: v0.1.0 · 오프라인일 때는 링크가 열리지 않을 수 있습니다.</CardDescription>
                <div className="help-link-grid">
                  <button type="button" className="help-link-card" disabled={isOffline} onClick={() => void handleHelpExternalLink("https://github.com")}>
                    <span className="help-link-title">{UI_COPY.helpGithub}</span>
                    <span className="help-link-desc">프로젝트 소스와 이슈를 확인합니다.</span>
                  </button>
                  <button type="button" className="help-link-card" disabled={isOffline} onClick={() => void handleHelpExternalLink("https://github.com/releases")}>
                    <span className="help-link-title">{UI_COPY.helpReleaseNotes}</span>
                    <span className="help-link-desc">버전별 변경사항을 확인합니다.</span>
                  </button>
                  <button type="button" className="help-link-card" disabled={isOffline} onClick={() => void handleHelpExternalLink("https://example.com/privacy")}>
                    <span className="help-link-title">{UI_COPY.helpPrivacy}</span>
                    <span className="help-link-desc">개인정보 처리 정책을 확인합니다.</span>
                  </button>
                  <button type="button" className="help-link-card" disabled={isOffline} onClick={() => void handleHelpExternalLink("https://example.com/help")}>
                    <span className="help-link-title">{UI_COPY.helpCenter}</span>
                    <span className="help-link-desc">문제 해결 가이드를 확인합니다.</span>
                  </button>
                </div>
                {isOffline ? <AlertBanner tone="warn">{UI_COPY.helpOffline}</AlertBanner> : null}
              </Card>
            </PageSection>
          </Stack>
        </Page>
      );
    }

    return (
      <Page>
        <PageSection>
          <p>{UI_COPY.unknownRoute}</p>
        </PageSection>
      </Page>
    );
  };
  const handleExportHistoryEvent = useCallback((event: HistoryEventViewModel) => {
    const payload = {
      title: event.title,
      description: event.description,
      mode: event.modeLabel,
      channel: event.channelLabel,
      result: event.resultLabel,
      absoluteTime: event.absoluteTime,
      relativeTime: event.relativeTime,
      metaChips: event.metaChips,
      stateMachineStep: event.stateMachineStep,
      raw: event.item,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `history-event-${event.item.timestampMs}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const renderEventDetail = (event: HistoryEventViewModel) => {
    const summaryText = [
      `상태: ${event.title}`,
      `요약: ${event.description}`,
      `시각: ${event.absoluteTime} (${event.relativeTime})`,
      `모드: ${event.modeLabel}`,
      `채널: ${event.channelLabel}`,
      `결과: ${event.resultLabel}`,
    ].join("\n");

    return (
      <Stack gap="md">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{event.description}</CardTitle>
              <CardDescription>{event.title}</CardDescription>
            </div>
            <Badge kind="result" tone={event.resultTone}>{event.resultLabel}</Badge>
          </CardHeader>
          <div className="right-panel-event-meta">
            <p><strong>시각</strong><span className="tabular">{event.absoluteTime}</span><span className="muted">{event.relativeTime}</span></p>
            <p><strong>모드</strong><span>{event.modeLabel}</span></p>
            <p><strong>채널</strong><span>{event.channelLabel}</span></p>
            <p><strong>상태 머신</strong><span>{event.stateMachineStep}</span></p>
          </div>
          <CardActions>
            <AppButton variant="secondary" size="sm" onClick={() => void handleCopy(summaryText)}>요약 복사</AppButton>
            <AppButton variant="ghost" size="sm" onClick={() => handleExportHistoryEvent(event)}>JSON 내보내기</AppButton>
          </CardActions>
        </Card>

        <Card>
          <CardTitle>관련 설정값</CardTitle>
          <ul className="plain-list">
            <li>기본 사전 알림: {decodeAlertMinutes(snapshot?.settings.defaultPreAlerts).join(" / ")}분</li>
            <li>최종 경고: {snapshot?.settings.finalWarningSec ?? FINAL_WARNING_SEC_DEFAULT}초</li>
            <li>시뮬레이션 모드: {snapshot?.settings.simulateOnly ? "켜짐" : "꺼짐"}</li>
            <li>스누즈 입력값: {postponeMinutes}분</li>
          </ul>
        </Card>
      </Stack>
    );
  };

  const sidebarItems: AppShellNavItem[] = (
    Object.entries(NAV_LABEL_MAP) as Array<[RoutePath, string]>
  ).map(([path, label]) => ({
    path,
    label,
    icon: NAV_ICON_MAP[path] ?? "chevron",
    group: NAV_GROUP_MAP[path],
    isActive: route.path === path,
    onSelect: () => {
      if (path === "/schedule/new") {
        setScheduleMode(mode);
        return;
      }
      navigate(path);
    },
  }));

  const rightPanel = selectedHistoryEvent ? (
    <Stack gap="md">
      <Card>
        <CardTitle>이벤트 상세</CardTitle>
        <CardDescription>행/아이템 선택으로 상세를 확인하고 복사/내보내기를 실행할 수 있습니다.</CardDescription>
      </Card>
      {renderEventDetail(selectedHistoryEvent)}
    </Stack>
  ) : (
    <Stack gap="md">
      <Card className="status-help-card">
        <CardTitle>현재 화면 가이드</CardTitle>
        <CardDescription>{ROUTE_GUIDE_MAP[route.path]}</CardDescription>
      </Card>
      <Card className="status-help-card">
        <CardTitle>안전 액션 경로</CardTitle>
        <ul className="plain-list">
          <li>취소/미루기: 하단 빠른 액션</li>
          <li>최종 경고 시: 오버레이에서 즉시 실행</li>
          <li>앱 창 닫기: 트레이 유지(예약 지속)</li>
        </ul>
      </Card>
      <Card className="status-help-card">
        <CardTitle>상태 요약</CardTitle>
        <p className="muted tabular">상태: {statusBadgeLabel}</p>
        <p className="muted tabular">남은 시간: {remainingTimeLabel}</p>
        <p className="muted tabular">종료 시각: {triggerAtDisplayLabel}</p>
      </Card>
    </Stack>
  );

  const mainContent = (
    <section className={classNames("content-scroll", isOnboarding && "onboarding-content")}>
      <Stack gap="md">
        {resumePolicyBanner ? <AlertBanner tone="danger">{resumePolicyBanner}</AlertBanner> : null}
        {processExitGuardBanner ? <AlertBanner tone="danger">{processExitGuardBanner}</AlertBanner> : null}
        {stateParseGuardBanner ? <AlertBanner tone="danger">{stateParseGuardBanner}</AlertBanner> : null}
        {statusError ? <AlertBanner tone="danger">{statusError}</AlertBanner> : null}
        {actionError ? <AlertBanner tone="danger">{actionError}</AlertBanner> : null}
        {renderMainContent()}
      </Stack>
    </section>
  );

  const quickActions = !isOnboarding ? (
    <div className="quick-action-inner" tabIndex={-1} aria-label="빠른 안전 액션 영역">
      <p className="quick-action-copy muted">
        {active
          ? `다음 동작: ${triggerAtDisplayLabel} 종료 예정 · 지금 취소/미루기 가능`
          : "다음 동작: 새 예약을 만들어 종료 시각을 설정하세요."}
      </p>
      {active ? (
        <Inline className="quick-action-buttons" justify="end" align="end">
          <AppButton
            id="quick-cancel-action"
            variant="destructive"
            immediate
            className="safety-action"
            onClick={() => void handleCancel()}
            disabled={busy}
          >
            취소
          </AppButton>
          {QUICK_SNOOZE_OPTION_MINUTES.map((minute) => (
            <AppButton
              key={`quick-snooze-${minute}`}
              id={`quick-snooze-${minute}-action`}
              variant="secondary"
              immediate
              className="safety-action"
              onClick={() => void handlePostpone(minute)}
              disabled={busy}
            >
              {minute}분 미루기
            </AppButton>
          ))}
          <AppButton
            variant="ghost"
            onClick={() => setShowCustomSnooze((prev) => !prev)}
            aria-expanded={showCustomSnooze}
            aria-controls="quick-custom-snooze"
          >
            {showCustomSnooze ? "사용자 지정 닫기" : "사용자 지정"}
          </AppButton>
          {showCustomSnooze ? (
            <Inline id="quick-custom-snooze" className="quick-postpone-field" align="end">
              <FormRow inline compact label="미루기(분)" htmlFor="quick-postpone-minutes">
                <AppInput
                  id="quick-postpone-minutes"
                  type="number"
                  min={1}
                  max={1440}
                  value={postponeMinutes}
                  onChange={(event) => setPostponeMinutes(Number(event.currentTarget.value))}
                />
              </FormRow>
              <AppButton variant="secondary" onClick={() => void handlePostpone()} disabled={busy}>
                적용
              </AppButton>
            </Inline>
          ) : null}
        </Inline>
      ) : (
        <Stack gap="xs" className="quick-action-buttons">
          <Inline justify="end" align="end">
            <AppButton onClick={() => setScheduleMode("countdown")}>새 예약 만들기</AppButton>
            <AppButton variant="destructive" disabled title={UI_COPY.idleQuickActionHint}>지금 취소</AppButton>
            <AppButton variant="secondary" disabled title={UI_COPY.idleQuickActionHint}>10분 미루기</AppButton>
          </Inline>
          <p className="inline-help muted">취소/미루기는 활성 예약에서만 사용할 수 있습니다.</p>
        </Stack>
      )}
    </div>
  ) : null;

  const confirmPreAlertLabel = confirmDraft
    ? confirmDraft.request.mode === "processExit"
      ? "프로세스 감시 모드는 사전 알림 없이 최종 경고로 바로 진입"
      : decodeAlertMinutes(confirmDraft.request.preAlerts).map((minute) => `${minute}분`).join(" / ")
    : "";

  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {politeLiveMessage}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertiveLiveMessage}
      </div>

      {isSoftCountdownBannerVisible ? (
        <section className="soft-countdown-banner" role="status" aria-live="assertive" aria-atomic="true">
          <div className="soft-countdown-copy">
            <p className="soft-countdown-title">종료 대기 모드</p>
            <p className="soft-countdown-message tabular">
              종료 시각 {shutdownAtDisplayLabel} · 종료까지 {formatSeconds(softCountdownRemainingSeconds ?? 0)} 남았습니다.
            </p>
          </div>
          <Inline className="soft-countdown-actions" justify="end" align="center">
            <AppButton
              variant="destructive"
              immediate
              className="safety-action"
              onClick={() => void handleCancel()}
              disabled={busy}
            >
              취소
            </AppButton>
            <AppButton
              variant="secondary"
              immediate
              className="safety-action"
              onClick={() => void handlePostpone(10)}
              disabled={busy}
            >
              10분 미루기
            </AppButton>
          </Inline>
        </section>
      ) : null}

      <AppShellV2
        isOnboarding={isOnboarding}
        brandTitle={BRAND_COPY.title}
        brandSubtitle={BRAND_COPY.subtitle}
        navItems={sidebarItems}
        routeTitle={routeTitle}
        statusLabel={statusBadgeLabel}
        statusTone={statusToneFromActive(active)}
        remainingLabel={remainingTimeLabel}
        triggerLabel={triggerAtDisplayLabel}
        liveStatusText={liveStatusText}
        simulationBadgeLabel={snapshot?.settings.simulateOnly ? "시뮬레이션 모드 · 실제 종료 없음" : undefined}
        processBadgeLabel={isWatchingProcess ? STATUS_TAG_COPY.watchingProcess : undefined}
        mainContent={mainContent}
        rightPanel={rightPanel}
        quickActions={quickActions}
      />

      <DetailDrawer
        open={Boolean(selectedHistoryEvent)}
        title={selectedHistoryEvent?.title ?? "이벤트 상세"}
        subtitle={selectedHistoryEvent ? `${selectedHistoryEvent.absoluteTime} · ${selectedHistoryEvent.relativeTime}` : undefined}
        onClose={() => setSelectedHistoryEventId(null)}
      >
        {selectedHistoryEvent ? renderEventDetail(selectedHistoryEvent) : null}
      </DetailDrawer>
      {confirmDraft ? (
        <section className="overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <article className="confirm-modal">
            <Stack gap="md">
              <h2 id="confirm-title">예약을 활성화할까요?</h2>
              {snapshot?.settings.simulateOnly ? <span className="mode-badge">시뮬레이션 모드</span> : null}
              <p className="muted">
                {confirmDraft.timingText} · 사전 알림 {confirmPreAlertLabel || "없음"} · 최종 유예 {snapshot?.settings.finalWarningSec ?? FINAL_WARNING_SEC_DEFAULT}초
              </p>

              <Card>
                <CardTitle>무엇이 일어나나요?</CardTitle>
                <CardDescription>
                  예약 시점이 되면 종료 대기 모드로 진입한 뒤 카운트다운이 0이 되는 순간에만 종료 명령을 전송합니다.
                  {snapshot?.settings.simulateOnly ? " (현재는 시뮬레이션 모드로 실제 종료는 실행되지 않음)" : ""}
                </CardDescription>
              </Card>

              <Card>
                <CardTitle>언제 일어나나요?</CardTitle>
                <CardDescription className="tabular">{confirmDraft.timingText}</CardDescription>
                <CardDescription>{confirmDraft.summary}</CardDescription>
              </Card>

              <Card>
                <CardTitle>취소/미루기 경로</CardTitle>
                <ul className="plain-list">
                  <li>앱 하단 빠른 액션</li>
                  <li>트레이 메뉴</li>
                  <li>최종 경고 오버레이</li>
                </ul>
              </Card>

              <Card>
                <CardTitle>알림 임계값</CardTitle>
                <ul className="plain-list">
                  <li>사전 알림: {confirmPreAlertLabel || "없음"}</li>
                  <li>최종 경고: {snapshot?.settings.finalWarningSec ?? FINAL_WARNING_SEC_DEFAULT}초</li>
                </ul>
              </Card>

              <Inline justify="end">
                <AppButton variant="secondary" onClick={() => setConfirmDraft(null)}>돌아가기</AppButton>
                <AppButton onClick={() => void handleArm()} disabled={busy}>예약 활성화</AppButton>
              </Inline>
            </Stack>
          </article>
        </section>
      ) : null}

      {quitGuard ? (
        <section className="overlay" role="dialog" aria-modal="true" aria-labelledby="quit-guard-title">
          <article className="confirm-modal">
            <Stack gap="md">
              <h2 id="quit-guard-title">종료 동작을 선택하세요</h2>
              <p>
                {quitGuard.status === "finalWarning"
                  ? "최종 경고 단계에서 앱 종료를 요청했습니다."
                  : `활성 예약(${STATUS_LABEL_MAP.armed}) 상태에서 앱 종료를 요청했습니다.`}
              </p>
              <p className="muted">요청 경로: {quitGuard.source === "trayMenu" ? "트레이 메뉴" : "앱 창 종료"}</p>
              <ul className="plain-list">
                <li>예약 취소 후 앱 종료</li>
                <li>앱 창만 닫고 트레이에서 계속 실행</li>
                <li>아무 동작 없이 돌아가기</li>
              </ul>

              <Inline justify="end">
                <AppButton variant="secondary" onClick={() => void handleResolveQuitGuard("return")} disabled={quitBusy}>돌아가기</AppButton>
                <AppButton variant="secondary" onClick={() => void handleResolveQuitGuard("keepBackground")} disabled={quitBusy}>트레이 유지</AppButton>
                <AppButton onClick={() => void handleResolveQuitGuard("cancelAndQuit")} disabled={quitBusy}>예약 취소 후 종료</AppButton>
              </Inline>
            </Stack>
          </article>
        </section>
      ) : null}

      {isFinalWarningDialogOpen ? (
        <section
          className="overlay warning-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="final-warning-title"
          aria-describedby="final-warning-description"
          ref={finalWarningOverlayRef}
        >
          <article className="confirm-modal final-warning-modal" id="final-warning-dialog">
            <Stack gap="md">
              <h2 id="final-warning-title">{UI_COPY.finalWarningTitle}</h2>
              <p className="warning-count tabular" role="status" aria-live="assertive">
                종료 시각 {shutdownAtDisplayLabel} · 종료까지{" "}
                {formatSeconds(finalWarningRemainingSeconds ?? active?.finalWarningDurationSec ?? FINAL_WARNING_SEC_DEFAULT)} 남았습니다.
              </p>
              <p id="final-warning-description" className="muted">지금 취소하거나 미루지 않으면 예약된 PC 종료가 진행됩니다.</p>
              <Inline justify="center">
                <AppButton
                  ref={finalWarningCancelButtonRef}
                  variant="destructive"
                  immediate
                  className="safety-action"
                  onClick={() => void handleCancel()}
                  disabled={busy}
                >
                  {UI_COPY.cancelSchedule}
                </AppButton>
                <AppButton variant="secondary" immediate className="safety-action" onClick={() => void handlePostpone()} disabled={busy}>{postponeMinutes}분 미루기</AppButton>
              </Inline>
            </Stack>
          </article>
        </section>
      ) : null}

      {showSettingsSavedToast ? <div className="save-toast">설정을 저장했습니다.</div> : null}
    </>
  );
}

export default App;
