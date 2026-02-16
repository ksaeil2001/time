import { describe, expect, it } from "vitest";
import {
  eventTypeLabel,
  historyStatusLabel,
  MODE_LABEL_MAP,
  PRE_ALERT_OPTION_MINUTES,
  resultBadgeLabel,
  STATUS_LABEL_MAP,
  STATUS_TAG_COPY,
} from "./constants/copy";

describe("copy constants", () => {
  it("maps internal event/result keys to user-facing Korean labels", () => {
    expect(eventTypeLabel("armed")).toBe("예약 활성화");
    expect(eventTypeLabel("cancelled")).toBe("사용자 취소");
    expect(eventTypeLabel("unknown_internal_key")).toBe("기타 이벤트");

    expect(resultBadgeLabel("ok")).toBe("정상 처리");
    expect(resultBadgeLabel("error")).toBe("실패");
    expect(resultBadgeLabel("mystery")).toBe("정보");
  });

  it("exposes Korean labels for mode and status chips", () => {
    expect(MODE_LABEL_MAP.countdown).toBe("카운트다운");
    expect(MODE_LABEL_MAP.specificTime).toBe("특정 시각");
    expect(MODE_LABEL_MAP.processExit).toBe("프로세스 감시");

    expect(STATUS_LABEL_MAP.armed).toBe("예약됨");
    expect(STATUS_LABEL_MAP.finalWarning).toBe("최종 경고");
    expect(STATUS_TAG_COPY.idle).toBe("대기 중(예약 없음)");
    expect(STATUS_TAG_COPY.watchingProcess).toBe("감시 중");
  });

  it("maps history status with cancellation priority", () => {
    expect(historyStatusLabel("cancelled", "ok")).toBe("사용자 취소");
    expect(historyStatusLabel("failed", "error")).toBe("실패");
    expect(historyStatusLabel("executed", "ok")).toBe("완료");
  });

  it("keeps default pre-alert chips aligned with UX policy", () => {
    expect(PRE_ALERT_OPTION_MINUTES).toEqual([10, 5, 1]);
  });
});
