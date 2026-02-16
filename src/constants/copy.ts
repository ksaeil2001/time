import type { ScheduleMode, ScheduleStatus } from "../types";

export const PRE_ALERT_OPTION_MINUTES = [10, 5, 1] as const;
export const QUICK_SNOOZE_OPTION_MINUTES = [5, 10, 15] as const;
export const COUNTDOWN_PRESET_MINUTES = [30, 60, 120, 240] as const;

export const BRAND_COPY = {
  title: "Auto Shutdown Scheduler",
  subtitle: "한 번 설정하면 끝. 자동 종료 예약",
} as const;

export const ROUTE_LABEL_MAP: Record<string, string> = {
  "/onboarding/welcome": "처음 안내",
  "/onboarding/permissions": "권한 안내",
  "/onboarding/safety": "안전 고지",
  "/dashboard": "대시보드",
  "/schedule/new": "새 예약",
  "/schedule/active": "활성 예약",
  "/history": "이력",
  "/settings/general": "일반 설정",
  "/settings/notifications": "알림 설정",
  "/settings/integrations/google": "Google 연동",
  "/help": "도움말",
};

export const NAV_LABEL_MAP: Record<string, string> = {
  "/dashboard": "대시보드",
  "/schedule/new": "새 예약",
  "/schedule/active": "활성 예약",
  "/history": "이력",
  "/settings/general": "일반 설정",
  "/settings/notifications": "알림 설정",
  "/settings/integrations/google": "Google 연동",
  "/help": "도움말",
};

export const MODE_LABEL_MAP: Record<ScheduleMode, string> = {
  countdown: "카운트다운",
  specificTime: "특정 시각",
  processExit: "프로세스 감시",
};

export const STATUS_LABEL_MAP: Record<ScheduleStatus, string> = {
  armed: "예약됨",
  finalWarning: "최종 경고",
};

export const STATUS_TAG_COPY = {
  idle: "대기 중(예약 없음)",
  watchingProcess: "감시 중",
} as const;

export const HISTORY_FILTER_LABEL_MAP = {
  all: "전체",
  ok: "완료",
  error: "실패",
} as const;

export const RESULT_BADGE_LABEL_MAP: Record<string, string> = {
  ok: "정상 처리",
  error: "실패",
};

export const EVENT_TYPE_LABEL_MAP: Record<string, string> = {
  armed: "예약 활성화",
  cancelled: "사용자 취소",
  postponed: "예약 미루기",
  alerted: "사전 알림",
  final_warning: "최종 경고 진입",
  final_warning_reverted: "최종 경고 해제",
  timezone_realigned: "시간대 변경 보정",
  process_match_degraded: "감시 정확도 하락",
  shutdown_initiated: "종료 시작",
  executed: "정상 처리",
  failed: "실패",
  settings_updated: "설정 변경",
  resume_not_supported: "자동 복구 미지원",
  state_parse_failed: "상태 파일 손상 감지",
  state_restored_from_backup: "백업 상태 복구",
  replace_rolled_back: "예약 교체 실패 복구",
};

export const UI_COPY = {
  idleStatusTitle: "대기 중(예약 없음)",
  activeStatusTitle: "예약됨",
  idleEmptyTitle: "예약이 아직 없어요. 새 예약을 만들어 볼까요?",
  idlePrimaryCta: "새 예약 만들기",
  idleQuickActionHint: "활성 예약이 없습니다.",
  builderTitle: "새 예약 만들기",
  builderPrimary: "예약 준비",
  builderSecondary: "활성 예약 보기",
  builderSecondaryDisabledHint: "활성 예약이 있을 때 열 수 있어요.",
  confirmTitle: "예약을 활성화할까요?",
  confirmPrimary: "예약 활성화",
  confirmSecondary: "돌아가기",
  finalWarningTitle: "종료 직전 경고",
  cancelNow: "지금 취소",
  cancelSchedule: "예약 취소",
  processModeHelper:
    "선택한 앱이 종료되면 자동 종료를 시작합니다(프로세스를 강제 종료하지 않음).",
  previewTitle: "예상 종료",
  previewUnavailable: "프로세스 감시 시작 후 종료 시각이 계산됩니다.",
  simulationBadge: "시뮬레이션 모드",
  simulationLabel: "시뮬레이션 모드(실제 종료 안 함)",
  simulationDescription: "실제 종료 명령을 실행하지 않습니다.",
  simulationWarning: "[시뮬레이션] 실제 종료는 실행되지 않습니다.",
  helpOffline: "오프라인에서는 열 수 없습니다.",
  activeScheduleMissing: "활성 예약이 없습니다.",
  cancelSnoozeHint:
    "취소·미루기는 앱 하단 바, 트레이, 최종 경고 오버레이에서 할 수 있어요.",
  preAlertSectionTitle: "사전 알림(시간 기반 전용)",
  preAlertProcessExitHint: "프로세스 감시는 완료 감지 후 최종 경고로 바로 진입합니다.",
  preAlertAdvancedOpen: "고급 설정",
  preAlertAdvancedClose: "고급 설정 닫기",
  preAlertAdvancedLabel: "고급 CSV 입력(분)",
  preAlertAdvancedHint: "예: 10,5,1 (숫자만 입력, 중복은 자동 제거)",
  preAlertAdvancedApply: "적용",
  preAlertAdvancedError: "숫자만 입력해 주세요. 예: 10,5,1",
  preAlertDescendingHint: "권장 순서: 큰 값부터 입력 (예: 10,5,1)",
  historyEmpty: "조건에 맞는 이력이 없습니다.",
  historyLoadMore: "더 보기 (120개)",
  historySummaryUnknown: "요약 정보 없음",
  historyStatusCompleted: "완료",
  historyStatusCancelled: "사용자 취소",
  historyStatusFailed: "실패",
  helpReleaseNotes: "릴리즈 노트 ↗",
  helpPrivacy: "개인정보 처리방침 ↗",
  helpCenter: "도움말 센터 ↗",
  helpGithub: "GitHub ↗",
  noReason: "사유 없음",
  unknownRoute: "알 수 없는 경로입니다.",
} as const;

export function eventTypeLabel(eventType: string): string {
  return EVENT_TYPE_LABEL_MAP[eventType] ?? "기타 이벤트";
}

export function resultBadgeLabel(result: string): string {
  return RESULT_BADGE_LABEL_MAP[result] ?? "정보";
}

export function historyStatusLabel(eventType: string, result: string): string {
  if (eventType === "cancelled") {
    return UI_COPY.historyStatusCancelled;
  }
  if (result === "error" || eventType === "failed") {
    return UI_COPY.historyStatusFailed;
  }
  return UI_COPY.historyStatusCompleted;
}
