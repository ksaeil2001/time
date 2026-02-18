import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function resetMockAndOpen(page: Page, hashPath: string): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("autosd.onboarding.completed.v1", "true");
  });
  await page.goto("/#/dashboard");
  await page.evaluate(() => {
    const runtimeWindow = window as Window & { __AUTO_SD_E2E_RESET__?: () => void };
    runtimeWindow.__AUTO_SD_E2E_RESET__?.();
  });
  await page.goto(hashPath);
}

async function expectNoCriticalA11yViolations(page: Page): Promise<void> {
  const axeResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(axeResults.violations).toEqual([]);
}

async function armCountdownSchedule(page: Page): Promise<void> {
  await page.goto("/#/schedule/new?mode=countdown");
  await expect(page.getByRole("heading", { name: "새 예약 만들기" })).toBeVisible();

  await page.locator("#duration-minutes").fill("3");
  await page.getByRole("button", { name: "예약 준비" }).click();

  await expect(page.getByRole("heading", { name: "예약을 활성화할까요?" })).toBeVisible();
  await page.getByRole("button", { name: "예약 활성화" }).click();

  await expect(page.getByRole("heading", { name: "지금 할 수 있는 것" })).toBeVisible();
}

test("Idle -> 새 예약 생성(카운트다운) -> 확인 모달 -> Arm", async ({ page }) => {
  await resetMockAndOpen(page, "/#/schedule/new?mode=countdown");
  await armCountdownSchedule(page);

  await expect(page.locator("#quick-cancel-action")).toBeVisible();
  await expect(page.locator("#quick-snooze-10-action")).toBeVisible();
  await expectNoCriticalA11yViolations(page);
});

test("Armed 상태에서 Cancel/Snooze가 키보드로 즉시 도달 가능", async ({ page }) => {
  await resetMockAndOpen(page, "/#/schedule/new?mode=countdown");
  await armCountdownSchedule(page);

  await page.locator(".quick-action-inner").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#quick-cancel-action")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#quick-snooze-5-action")).toBeFocused();
  await expectNoCriticalA11yViolations(page);
});

test("History 테이블 키보드 탐색 + 행 선택 + 상세 드로어 열기", async ({ page }) => {
  await resetMockAndOpen(page, "/#/schedule/new?mode=countdown");
  await armCountdownSchedule(page);
  await page.locator("#quick-cancel-action").click();

  await page.goto("/#/history");
  await expect(page.getByRole("heading", { name: "이력" })).toBeVisible();

  const firstRow = page.locator('table[aria-label="이력 데이터 테이블"] tbody tr[tabindex="0"]').first();
  await expect(firstRow).toBeVisible();
  await firstRow.focus();
  await page.keyboard.press("Enter");

  const detailDialog = page.getByRole("dialog", { name: "사용자 취소" });
  await expect(detailDialog).toBeVisible();
  await expect(detailDialog.getByRole("button", { name: "닫기" })).toBeVisible();
  await expectNoCriticalA11yViolations(page);
});
