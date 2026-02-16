# UI Refactor v2 Spec (STEP 1 Foundation)

> Scope: Design System + AppShell v2 foundation only  
> Source of truth alignment: `PRD_MVP_v1.0.md` → `DESIGN_GUIDE_MVP_v1.0.md` → `USE_CASE_MVP_v1.0.md` → `IA_MVP_v1.0.md`

## 1) Design Principles

### 30초 법칙
- 첫 진입 30초 내에 아래 4가지를 동시에 이해하도록 설계한다.
- 현재 상태(Idle/Armed/Final warning)
- 언제 종료되는지(절대 시각 + 상대 시간)
- 어떻게 취소하는지
- 어떻게 미루는지

### 3초 목표
- 각 화면 상단(AppShell TopStatusBar)에서 3초 내 상태/다음 행동을 스캔할 수 있어야 한다.

### 표현 원칙
- 의도적인 단순화(intentional minimalism): 장식보다 정보 계층과 피드백 우선
- 색상 단독 의존 금지: 텍스트 + 아이콘 + 레이아웃으로 의미 전달
- 중요 정보 문장 덩어리 금지: 배지/제목/메타/설명 단위로 분리

## 2) Stack Mapping

- 현재 코드베이스는 `React + TypeScript + Vite + Tauri + Plain CSS` 구조다.
- Tailwind 미사용이므로, v2 토큰은 `CSS 변수(semantic token)` + `컴포넌트 클래스 토큰`으로 구현한다.
- 구현 파일:
  - `src/styles/design-system-v2.css`
  - `src/components/ui/*`
  - `src/components/layout/AppShellV2.tsx`

## 3) Token Architecture

### Primitive Tokens (기존 팔레트 유지)
- neutral: `--neutral-0/50/100/200/300/500/700/900`
- primary: `--primary-50/100/500/600/700`
- semantic color primitive: `--danger-500`, `--warning-500`, `--success-500`

### Semantic Tokens
- `--bg-canvas`, `--bg-surface`, `--bg-subtle`
- `--border-default`, `--border-strong`
- `--text-primary`, `--text-muted`, `--text-inverse`
- `--action-primary`, `--action-primary-hover`, `--action-primary-pressed`
- `--action-secondary`, `--action-secondary-hover`
- `--action-danger`, `--action-danger-hover`, `--action-danger-pressed`
- `--focus-ring`

### Component Tokens
- button: `--btn-radius`
- input: `--input-radius`
- pill/badge: `--pill-radius`
- card/panel: `--card-radius`
- elevation: `--surface-shadow`, `--surface-shadow-soft`
- motion: `--motion-standard=100ms`, `--motion-safe=0ms`

## 4) Typography Scale

- Base font family: `Pretendard Variable`, fallback `Pretendard`, `Noto Sans KR`, `Segoe UI`
- 계층:
  - Page Title: `~1.35rem`
  - Section Title: `~1.1rem`
  - Body: `~0.92rem`
  - Meta/Eyebrow: `~0.74rem~0.82rem`
- 숫자(카운트다운/시각): `tabular-nums` 활성

## 5) Spacing Rules

- 8px 기반 그리드: `4/8/12/16/24/32`
- 레이아웃/컴포넌트 여백은 위 스케일만 사용
- 큰 여백으로 비우지 않고, 카드/섹션/상태 타일로 구획을 분명히 한다

## 6) Background & Surface Rules

- 배경: `neutral-50` 기반 + 약한 radial gradient 2개
- 금지: 과도한 blur/glass, 과도한 backdrop-filter
- 카드/패널: `neutral-0` + `border-default` + `soft shadow`
- 최소 창 크기 고정: `980x700`

## 7) Motion Rules

- Safety action(취소/미루기): `0ms` 즉시 반응 (`.safety-action`)
- 일반 상태 전환: `100ms` (`--motion-standard`)
- 종료 관련 애니메이션: 사용 금지

## 8) Component Set (Foundation)

생성/정리 경로: `src/components/ui/*`

- Button: `primary/secondary/destructive/ghost`, `sm/md/lg`, `loading/disabled/focus`
- Badge/Pill: `status(idle/armed/finalWarning)`, `tag`, `result(ok/fail)`
- Card/Panel/Section: header(title/description/action) 구조
- Form:
  - `Input`, `Select`, `Textarea`
  - `Toggle`
  - `SegmentedControl` (radio 기반)
  - `Chip`
- AlertBanner: `info/warn/danger` + CTA slot + `role/aria-live`
- EmptyState: icon + heading + description + CTA
- Data patterns:
  - `ResourceList`
  - `DataTable`
  - `TimelineList`

## 9) AppShell v2

구현: `src/components/layout/AppShellV2.tsx`

- 구조:
  - `SidebarNav` (좌)
  - `TopStatusBar` (상)
  - `MainCanvas` (중앙)
  - `RightPanel` (wide에서 표시)
  - `QuickActionFooter` (하단 고정)
- 아이콘 허용군 준수: `clock`, `power`, `bell`, `chevron`
- 라우트 구조 유지:
  - `/dashboard`
  - `/schedule/new?mode=*`
  - `/schedule/active`
  - `/history`
  - `/settings/general`
  - `/settings/notifications`
  - `/settings/integrations/google`
  - `/help`

## 10) Interaction State Table

| Component | Hover | Pressed | Disabled | Focus |
| --- | --- | --- | --- | --- |
| Button (primary/secondary/destructive/ghost) | 배경/보더 변경 | `translateY(1px)` + pressed 색상 | 대비 낮춤 + 커서 차단 | 3px 포커스 링 |
| Input/Select/Textarea | 보더 강조 | N/A | 배경/텍스트 저대비 처리 | 3px 포커스 링 |
| SegmentedControl | 옵션 hover tint | 선택 옵션 활성 배경 | disabled opacity | input focus ring |
| Chip | hover tint | `translateY(1px)` | disabled state | 3px 포커스 링 |
| Nav item | hover tint | active gradient | N/A | 3px 포커스 링 |

## 11) Accessibility Summary

- 키보드 포커스 가시성 강화(3px ring)
- 상태/오류 배너는 `AlertBanner`로 `role + aria-live` 분리
  - info/warn: `status + polite`
  - danger: `alert + assertive`
- 최종 경고 오버레이는 기존 `role="alertdialog"` 흐름 유지
- 취소/미루기 safety 버튼은 동작 지연 없이 즉시 반응

## 12) Safety Invariants (No Regression)

- Arm 전 확인 모달 유지
- ARMED 상태 상단 상시 가시화 유지
- Cancel/Snooze 다중 진입점 유지(앱/오버레이/트레이)
- 종료 시점 절대+상대 병기 유지
- Final Grace 설정 범위(15~300초) 유지
- 단일 활성 스케줄 정책 유지
- OS 알림은 정보 표시(info-only) 정책 유지

