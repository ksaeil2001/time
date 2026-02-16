// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { Badge, HistoryTable } from "./components/ui";

describe("accessibility smoke (vitest + jest-axe)", () => {
  it("passes basic alertdialog semantics for final warning actions", async () => {
    const { container } = render(
      <section role="alertdialog" aria-modal="true" aria-labelledby="final-warning-title" aria-describedby="final-warning-description">
        <h2 id="final-warning-title">종료 직전 경고</h2>
        <p id="final-warning-description">지금 취소하거나 미루지 않으면 예약된 종료가 진행됩니다.</p>
        <button type="button">예약 취소</button>
        <button type="button">10분 미루기</button>
      </section>,
    );

    const result = await axe(container);
    expect(result.violations).toEqual([]);
  });

  it("supports keyboard row selection in history table", async () => {
    const onOpenDetail = vi.fn();
    const { container } = render(
      <HistoryTable
        ariaLabel="이력 데이터 테이블"
        rows={[
          {
            id: "history-1",
            event: "예약 활성화",
            resultTone: "ok",
            resultLabel: "완료",
            mode: "카운트다운",
            absoluteTime: "오늘 10:00:00",
            relativeTime: "1분 전",
            onOpenDetail,
          },
        ]}
      />,
    );

    const row = container.querySelector('tbody tr[tabindex="0"]');
    expect(row).not.toBeNull();

    (row as HTMLElement).focus();
    fireEvent.keyDown(row as HTMLElement, { key: "Enter" });
    expect(onOpenDetail).toHaveBeenCalledTimes(1);

    const result = await axe(container);
    expect(result.violations).toEqual([]);
  });

  it("renders badges with both icon and text", () => {
    const { container, getByText } = render(
      <Badge kind="status" tone="finalWarning">
        최종 경고
      </Badge>,
    );

    expect(getByText("최종 경고")).toBeTruthy();
    expect(container.querySelector("svg.ui-icon")).not.toBeNull();
  });
});
