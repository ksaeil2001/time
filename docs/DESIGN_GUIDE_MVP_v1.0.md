# Auto Shutdown Scheduler 디자인 가이드 (MVP v1.0)

> Last synced with implementation: 2026-02-16 (commit N/A - git metadata unavailable)

## As-built Alignment
- last_synced: 2026-02-16 (commit N/A - git metadata unavailable)
- key changes (변경 이유/영향):
  - App Shell은 사이드바 + 상단 상태바 + 콘텐츠 + 하단 QuickActionFooter + 확인/최종경고 오버레이 구조로 동작한다.
    영향: 온보딩 외 전 경로에서 하단 제어가 유지되어 취소/미루기 접근성이 보장된다.
  - 사용자 노출 상태 라벨은 `대기 중(예약 없음)` / `예약됨` / `최종 경고`로 렌더된다.
    영향: 상태 배지/예시 문구는 `예약 활성화됨` 대신 `예약됨`으로 동기화해야 한다.
  - QuickActionFooter는 Idle에서 `새 예약 만들기` + 비활성 `취소/10분 미루기`를 노출하고, 활성 예약에서 `취소 → 10분 미루기 → 5/15분 미루기 → 미루기(분)` 순서로 동작한다.
    영향: Idle 입력 필드는 숨김이 아니라 비활성 표시가 기준이다.
  - 접근성 동작은 전역 `aria-live(polite/assertive)` 분리, Final Warning `alertdialog`(label/description), 포커스 트랩/원위치 복귀까지 구현되었다.
    영향: 상태 변화 전달과 최종 경고 개입 가능성이 스크린리더/키보드 사용자에게 동일하게 보장된다.
  - 인터랙티브 컴포넌트 전반의 포커스 링과 배지 아이콘+텍스트 동시 표기를 기본값으로 적용했다.
    영향: WCAG 2.2 포커스 가시성과 색상 단독 의존 금지 기준을 충족한다.
  - 트레이 메뉴는 `Quick Start Last Mode`, `Show Countdown`, `Open Window`, `Cancel Schedule`, `Snooze 10m`, `Quit App` 순서의 고정 항목을 제공한다.
    영향: Idle에서도 `Cancel Schedule`/`Snooze 10m`은 비활성 표기 없이 동작(no-op/요청 무시)한다.
  - process-exit 화면은 프로세스 목록 최대 120개, 정렬(name→pid), 새로고침 중심 UX를 제공하며 검색 입력은 제공하지 않는다.
    영향: Watch Process 화면 문구는 "검색"이 아닌 "새로고침/정렬/상한" 기준으로 기술한다.
  - shell 계열 프로세스는 `실행 파일 경로` 또는 `명령줄 토큰` 없이 Arm이 차단된다(경고 + CTA 비활성).
    영향: 오탐 방지 제약이 프런트/백엔드 모두에서 일치한다.
  - process-exit 감시 selector가 손상되면 `NO_FAIL_OPEN_PROCESS_EXIT` 정책으로 예약을 안전 중단한다.
    영향: fail-open 없이 즉시 취소되고 상단 경고 배너/이력으로 복구를 유도한다.
- P0 Policy(목표):
  - `Armed` 상태 Quit은 `BLOCK_AND_CHOOSE`를 적용한다. (`예약 취소 후 종료` / `백그라운드 유지` / `돌아가기`)
  - Final Grace는 기본 60초, 설정 범위 `15~300초`를 사용한다. UI 문구는 항상 현재 설정값으로 표시한다.
  - 사전 알림 10m/5m/1m은 시간 기반 모드 전용이며 `process-exit`는 완료 감지 후 즉시 Final Warning으로 진입한다.
  - 프로세스 식별 정보는 최소 수집 원칙을 적용한다(`cmdlineContains` 원문 저장/로그 금지).
- As-built note(현재 구현):
  - Tray/App Quit은 `armed`/`finalWarning`에서 `quit_guard_requested` 모달을 통해 선택지를 요구한다(정책과 일치).
  - 데스크톱 알림은 정보형으로만 제공되며 알림 버튼 기반 Cancel/Snooze 액션은 미구현이다(정책과 일치).
  - `process-exit` 모드는 안정 구간 충족 후 10m/5m/1m 사전 알림 없이 `finalWarning`으로 직접 진입한다(정책과 일치).
  - 상태 파일의 `active.processSelector`, `lastScheduleRequest.processSelector`에는 `executable`, `cmdlineContains`가 원문으로 저장될 수 있다(정책과 불일치).

문서 목적: Windows/macOS 크로스플랫폼 자동 종료 앱의 브랜드 일관성, 사용성, 접근성, 유지보수성을 위한 UI/UX 기준을 정의합니다.

문서 범위: 디자인 시스템, 화면별 설계, 상호작용, 반응형 규칙, 접근성, QA 체크리스트

정렬 기준 문서: `docs/IA_MVP_v1.0.md`, `docs/USE_CASE_MVP_v1.0.md`
문서 정본: `docs/PRD_MVP_v1.0.md`, `docs/DESIGN_GUIDE_MVP_v1.0.md`, `docs/USE_CASE_MVP_v1.0.md`, `docs/IA_MVP_v1.0.md`

## Table of Contents
- Design System Overview
- Color Palette for tailwindcss (primary, secondary, accent, neutral, etc.)
- Page Implementations
- Layout Components
- Interaction Patterns
- Breakpoints
- Accessibility (WCAG 2.2 checklist + contrast ratio checklist)
- Design QA Checklist

---

## Design System Overview

### 1) 제품 방향성과 톤
- 핵심 가치: "한 번 설정하면 끝. 자동 종료 예약"
- UX 성격: 미니멀, 신뢰 중심, 빠른 스캔, 예측 가능(no-surprises)
- 금지 패턴: 사용자 동의 없는 자동 동작, 감춘 종료 동작, 취소 경로가 불분명한 플로우
- 데이터 원칙: 기본은 로컬 저장소(설정/히스토리/로그). 현재 MVP 구현은 외부 연동 없이 동작

### 2) 공용 인터페이스/타입 계약

| 구분 | 인터페이스/타입 | 값/필드 |
| --- | --- | --- |
| 상태 | `ScheduleStatus` | `armed` \| `finalWarning` (내부 실행 단계로 `shuttingDown`) |
| 모드 | `ScheduleMode` | `countdown` \| `specificTime` \| `processExit` |
| 미루기 | `PostponeMinutes` | `1..1440` (기본 입력값 `10`) |
| 알림 | `NotificationThreshold` | 시간 기반: `10m`, `5m`, `1m`; 공통: `final_grace_entered` |
| 최종 경고 | `FinalWarningSetting` | `default=60`, `range=15..300` (초) |
| Google 연동(모의) | `GoogleMockIntegrationState` | `disconnected` \| `connected` |
| 플랫폼 변형 | `PlatformVariant` | `windows_tray` \| `macos_menu_bar` |
| 프로세스 식별 | `ProcessSelector` | `pid?`, `name?`, `executable?`, `cmdlineContains?` |
| 활성 감시 상태 | `ActiveSchedule` | `processStableSec(5~600, 기본 10)`, `snoozeUntilMs?`, `processTreePids?` |
| 안전정책 | `SafetyPolicy` | `single_active_only=true`, `confirm_before_arm=true`, `always_show_exact_time=true`, `quit_when_armed=block_and_choose` |

참고: `watching_process`는 핵심 상태 머신의 독립 상태가 아니라, `armed` 상태에서 `processExit` 모드일 때 표시되는 UI 파생 태그로 취급한다.
참고: 라우트 쿼리 값은 kebab-case(`specific-time`, `process-exit`)를 사용하고, 내부 타입은 camelCase(`specificTime`, `processExit`)를 사용한다.

### 2-1) 상태 모델 정규화 (IMP-05)
#### 상태 3계층 분리
| 계층 | 값 | 사용 목적 |
| --- | --- | --- |
| UI 표기 상태 | `대기 중(예약 없음)`, `예약됨(Armed)`, `최종 경고(Final warning)`, `종료 명령 실행 중(Shutting down)` | 헤더/배지/트레이 요약 행에 노출되는 사용자 상태 |
| 저장 상태 | `active = null`, `active.status = armed|finalWarning`, `history.status = completed|failed|cancelled` | 재시작 시 복원/추적 가능한 영속 상태 |
| 내부 실행 상태 | `idle -> armed -> finalWarning -> shuttingDown` | 스케줄러 실행, 종료 명령 호출, 롤백 처리 |

#### 상태 전이 다이어그램(텍스트)
```text
IDLE
  -> (confirm_before_arm)
ARMED
  -> (trigger reached)
FINAL_WARNING
  -> (cancel) IDLE
  -> (snooze 1..1440) ARMED
  -> (grace expired) SHUTTING_DOWN
SHUTTING_DOWN
  -> (success|failure) IDLE + HISTORY(completed|failed)
```

#### Glossary
| 용어 | 정의 |
| --- | --- |
| `armed` | 예약이 활성화되어 종료 조건을 감시하는 상태 |
| `finalWarning` | 종료 직전 사용자 개입(취소/미루기)이 가능한 경고 상태 |
| `shuttingDown` | 종료 실행 중인 내부 단계(비영속) |
| `watching_process` | process-exit 모드에서만 보이는 UI 파생 태그 |

### 2-2) 네이밍 정본화 (IMP-06)
| URL 쿼리(kebab-case) | 내부 타입(camelCase) | 적용 위치 |
| --- | --- | --- |
| `countdown` | `countdown` | `/schedule/new?mode=countdown` |
| `specific-time` | `specificTime` | `/schedule/new?mode=specific-time` |
| `process-exit` | `processExit` | `/schedule/new?mode=process-exit` |

신규 모드/라우트 추가 체크리스트:
- [ ] URL/라우트에 kebab-case 토큰을 정의했는가?
- [ ] 타입/enum에 camelCase 값을 정의했는가?
- [ ] PRD/IA/Design/Use-Case의 매핑 표를 동시에 갱신했는가?
- [ ] 상태 전이표, QA 테스트 케이스를 함께 갱신했는가?

### 3) Safety-first UX 규칙 (필수)
1. **Armed 상태 상시 가시화**: 상단 상태바와 헤더에 `예약됨` 배지 + 남은 시간 동시 표시
2. **Arm 전 확인 필수**: 예약 생성 후 즉시 실행 금지, 확인 모달에서 사용자가 명시 동의해야 활성화
3. **Cancel/Snooze 상시 접근**: 메인 화면, 최종 경고 오버레이, 트레이/메뉴바에서 1~2 클릭 이내 접근
4. **정확한 실행 시점 명시**: "무엇이 언제 일어나는지"를 절대시각(예: `오늘 23:40`) + 상대시간(예: `15분 후`)로 병기
5. **최종 유예 시간(Final Grace) 제공**: 종료 기본 60초 전 경고 상태 진입, 설정에서 `15~300초` 범위 변경 허용
6. **Armed 상태 Quit 보호**: Quit 요청 시 즉시 종료 금지, 예약 처리 방식을 먼저 선택하도록 강제
7. **창 닫기(X)와 Quit 분리**: 창 닫기(X)는 창 숨김(예약 유지), Quit은 정책 모달을 거쳐 종료

수락 기준(AC):
- AC-01: `Armed` 상태에서 Tray/Menu/App Quit 요청 시 선택 모달 없이 즉시 종료되지 않는다.
- AC-02: 최종 경고 문구는 고정 60초 문구가 아니라 현재 설정값(15~300초)을 반영한다.
- AC-03: `process-exit`는 10m/5m/1m 사전 알림을 발행하지 않고 완료 감지 후 즉시 Final Warning 안내를 노출한다.
- AC-04: 데스크톱 알림은 정보 표시만 수행하고, 취소/미루기 실행은 앱/오버레이/트레이에서만 가능하다.

### 4) 아이콘/모션/타이포 정책
- 아이콘 허용군: `clock`, `power`, `bell`, `chevron` + 필수 시스템 기본 아이콘만 사용
- 모션 기준:
  - 핵심 안전 액션: 지연 없이 즉시 반응 (`0ms`)
  - 일반 상태 전환: `80-120ms` 이내
  - 종료 관련 애니메이션: 사용 금지
- 타이포그래피(한글 우선):
  - 기본: `Pretendard`, 대체: `Noto Sans KR`, 최종: `system-ui`
  - 숫자/카운트다운: tabular 숫자 활성화 권장

### 5) 참고 패턴(가정)
- 가정 A: Windows 트레이 유틸리티 패턴(우클릭 메뉴 중심 빠른 제어)
- 가정 B: macOS 메뉴바 유틸리티 패턴(메뉴바 드롭다운 + 단축키 중심)
- 가정 C: OS HIG 공통 원칙(권한 목적 고지, 취소 가능성, 상태 투명성)

```yaml
principles:
  transparency: true
  explicit_consent_required: true
  cancelability: always_visible
  exact_time_disclosure: required
  final_grace_period_seconds: 60
  single_active_schedule: true
```

---

## Color Palette for tailwindcss (primary, secondary, accent, neutral, etc.)

### 1) 토큰 팔레트

| Token | Hex | 사용 목적 |
| --- | --- | --- |
| `primary-50` | `#EFF6FF` | Primary 배경 tint |
| `primary-100` | `#DBEAFE` | 선택/하이라이트 약강조 |
| `primary-300` | `#93C5FD` | 보조 라인/배지 |
| `primary-500` | `#1E40AF` | 핵심 액션, 링크, Armed 강조 |
| `primary-600` | `#1E3A8A` | hover/pressed 상태 |
| `primary-700` | `#1D3480` | pressed 진입 |
| `secondary-100` | `#E2E8F0` | 서브 배경/보조 보더 |
| `secondary-500` | `#475569` | 보조 텍스트/보조 버튼 |
| `text-muted (semantic)` | `#475569` | 보조 텍스트(AA 대비 기준값) |
| `secondary-700` | `#334155` | 보조 버튼 pressed |
| `accent-500` | `#1E40AF` | 단일 액센트(Primary와 동일 유지) |
| `neutral-0` | `#FFFFFF` | 기본 캔버스 |
| `neutral-50` | `#F8FAFC` | 페이지 배경 |
| `neutral-100` | `#F1F5F9` | 카드 배경 |
| `neutral-200` | `#E2E8F0` | 경계선 |
| `neutral-500` | `#64748B` | 보조 텍스트 |
| `neutral-700` | `#334155` | 본문 텍스트 |
| `neutral-900` | `#0F172A` | 제목/강조 텍스트 |
| `success-500` | `#166534` | 성공/완료 |
| `warning-500` | `#B45309` | 주의 |
| `danger-500` | `#B91C1C` | 위험/취소/종료 |
| `info-500` | `#1D4ED8` | 정보 |

### 2) 대비 안전 페어링

| 배경 | 전경 텍스트 | 목표 대비 | 권장 용도 |
| --- | --- | --- | --- |
| `neutral-0` | `neutral-900` | AA/AAA 통과 목표 | 기본 본문 |
| `neutral-50` | `neutral-900` | AA/AAA 통과 목표 | 페이지 타이틀 |
| `primary-500` | `neutral-0` | AA 통과 목표 | Primary 버튼 |
| `danger-500` | `neutral-0` | AA 통과 목표 | 파괴적 액션 |
| `neutral-100` | `neutral-700` | AA 통과 목표 | 보조 카드 |

### 3) 플레이스홀더 이미지(문서/프로토타입)
- `https://picsum.photos/1200/675?grayscale`

```ts
// tailwind token naming (디자인 토큰 스키마)
export const colors = {
  primary: { 50: '#EFF6FF', 100: '#DBEAFE', 300: '#93C5FD', 500: '#1E40AF', 600: '#1E3A8A', 700: '#1D3480' },
  secondary: { 100: '#E2E8F0', 500: '#475569', 700: '#334155' },
  accent: { 500: '#1E40AF' },
  neutral: { 0: '#FFFFFF', 50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0', 500: '#64748B', 700: '#334155', 900: '#0F172A' },
  semantic: { success: '#166534', warning: '#B45309', danger: '#B91C1C', info: '#1D4ED8' }
};
```

---

## Page Implementations

```yaml
routes:
  - /onboarding/welcome
  - /onboarding/permissions
  - /onboarding/safety
  - /dashboard
  - /schedule/new?mode=countdown|specific-time|process-exit
  - /schedule/active
  - /history
  - /settings/general
  - /settings/notifications
  - /settings/integrations/google
  - /help
```

### 1) Home/Dashboard
**핵심 목적**
- 현재 상태(Idle/Armed/Final warning)를 즉시 이해하고 빠른 제어를 수행

**핵심 컴포넌트**
- 상태 Pill, 남은 시간 카드, 목표 시각 카드, 빠른 액션(생성/취소/미루기), 최근 로그

**레이아웃 구조**
- 상단: 상태 + 남은 시간 + 정확한 종료 시각
- 중단: 빠른 액션 버튼군
- 하단: 최근 이벤트 타임라인

**Empty/Error/Loading 상태**

| 상태 | 조건 | UI 처리 | 안내 문구 |
| --- | --- | --- | --- |
| Empty | 활성 예약 없음 | CTA 버튼 강조 | `예약이 아직 없어요. 새 예약을 만들어 볼까요?` |
| Loading | 앱 시작 직후 상태 동기화 | 스켈레톤 카드 3개 | `상태를 불러오는 중...` |
| Error | 상태 조회 실패 | 상단 에러 배너 + 재시도 | `상태를 가져오지 못했습니다. 다시 시도해 주세요.` |

**마이크로카피 가이드**
- `상태: 예약됨 · 남은 시간 00:42:18`
- `종료 예정: 오늘 23:40:00 · 42분 후`
- `지금 취소`, `5분 미루기`, `10분 미루기`, `15분 미루기`, `새 예약 만들기`

### 2) New Schedule (Time-based)
**핵심 목적**
- 카운트다운/특정 시각 기반 예약을 안전하게 생성

**핵심 컴포넌트**
- 모드 탭, 프리셋 버튼(+30분/+1시간/+2시간/+4시간), 커스텀 입력, 시간 피커, 사전 알림 칩(10/5/1), 확인 모달

**레이아웃 구조**
- 좌측: 모드 선택
- 우측: 입력 폼 + 즉시 미리보기(절대시각/상대시간)
- 하단: `예약 준비` 버튼

**Empty/Error/Loading 상태**

| 상태 | 조건 | UI 처리 | 안내 문구 |
| --- | --- | --- | --- |
| Empty | 초기 진입 | 기본 프리셋 표시 | `프리셋을 고르거나 직접 입력해 주세요.` |
| Error | 잘못된 시간/과거 시각 | 인라인 에러 | `현재 시각보다 이후 시간을 입력해 주세요.` |
| Loading | 설정 로드 | 폼 비활성 + 스켈레톤 | `기본 설정을 불러오는 중...` |

**마이크로카피 가이드 (Arm 확인 모달 포함)**
- 모달 제목: `예약 시작(Arm) 확인`
- 모달 섹션: `무엇이 일어나나요?`, `언제 일어나나요?`, `취소/미루기 경로`, `알림 임계값`
- 모달 시간 문구: 절대시각 + 상대시간 병기(예: `오늘 23:40:00 · 4시간 후`)
- 취소 경로 문구: `앱 하단 빠른 액션 · 트레이 메뉴 · 최종 경고 오버레이`
- 버튼: `돌아가기`, `예약 시작(Arm)`

### 3) Watch Process (Condition-based)
**핵심 목적**
- 특정 프로세스 종료를 트리거로 안전한 자동 종료 예약

**핵심 컴포넌트**
- 프로세스 새로고침 버튼, 프로세스 리스트(최대 120개 표시), 선택 상세 카드(PID/경로)
- 고급 식별 입력(`실행 파일 경로`, `명령줄 토큰`)
- shell 계열 선택 시 고급 식별값 미입력이면 Arm 차단 + 경고 배너
- 센티널 템플릿 패널(Windows PowerShell/macOS shell, 스크립트/실행 커맨드 Copy)

**레이아웃 구조**
- 좌측: 새로고침 + 안정 구간 입력 + 리스트
- 우측: 선택 프로세스 상세 + 고급 식별 필드 + 센티널 템플릿 + `예약 준비` 버튼

**Empty/Error/Loading 상태**

| 상태 | 조건 | UI 처리 | 안내 문구 |
| --- | --- | --- | --- |
| Empty | 표시 가능한 프로세스 없음 | 빈 상태 + 새로고침 + 시간 기반 전환 CTA | `실행 중 프로세스를 찾지 못했습니다.` |
| Loading | 프로세스 스캔 중 | 리스트 스켈레톤 | `프로세스 목록을 스캔하는 중...` |
| Error | 권한 부족/조회 실패 | 경고 배너 + 권한 안내 | `일부 프로세스는 권한 제한으로 표시되지 않을 수 있습니다.` |

**마이크로카피 가이드 (프로세스 선택 도움말 포함)**
- 도움말: `센티널을 먼저 실행한 뒤 PID를 선택하면, 센티널 종료를 작업 완료 신호로 사용할 수 있습니다.`
- 보조: `processStableSec은 5~10초 권장, 안정 판정은 센티널 StableSec에서 조정하세요.`
- 주의: `shell 계열 프로세스는 동명이인이 흔합니다. 실행 파일 경로 또는 명령줄 토큰을 입력하지 않으면 Arm할 수 없습니다.`

### 4) Active Schedule
**핵심 목적**
- 활성 예약 상태를 추적하고 취소/미루기를 즉시 수행

**핵심 컴포넌트**
- 상태 배지(`예약됨`/`최종 경고`), 카운트다운, 알림 이력, 최종 유예 상태 카드, 취소/미루기 고정 액션, 테스트 모드 배지(`simulateOnly=true`)

**레이아웃 구조**
- 상단 고정 바: 상태 + 남은 시간 + 정확한 실행 시각
- 본문: 이벤트 로그(시간 기반 10m/5m/1m, process-exit 완료 감지 알림), 액션 패널

**Empty/Error/Loading 상태**

| 상태 | 조건 | UI 처리 | 안내 문구 |
| --- | --- | --- | --- |
| Empty | 활성 예약이 해제됨 | 대시보드 복귀 CTA | `현재 활성 예약이 없습니다.` |
| Loading | 상태 동기화 지연 | 상단 스켈레톤 | `최신 상태를 동기화하는 중...` |
| Error | 제어 명령 실패 | 인라인 에러 + 재시도 | `요청을 처리하지 못했습니다. 다시 시도해 주세요.` |

**마이크로카피 가이드 (사전 경고/취소/미루기 포함)**
- 사전 경고 알림: `자동 종료까지 5분 남았습니다. 지금 취소하거나 미룰 수 있습니다.`
- 최종 유예 진입: `종료 {finalWarningSec}초 전입니다. 지금 취소하지 않으면 종료가 진행됩니다.`
- 액션 버튼: `지금 취소`, `5분 미루기`, `10분 미루기`, `15분 미루기`
- 테스트 배지: `테스트 모드`

### 5) History / Logs
**핵심 목적**
- 예약 실행 결과(실행/취소/실패)와 원인을 추적

**핵심 컴포넌트**
- 상태 필터, 이벤트/사유/시각/결과 리스트

**레이아웃 구조**
- 상단: 결과 필터(전체/성공/실패)
- 본문: 로그 리스트(페이지당 120개 렌더, `더 보기`로 120개 단위 추가)
- 저장 정책: 로컬 보관 최대 250건(FIFO), UI 렌더 한도와 분리

**Empty/Error/Loading 상태**

| 상태 | 조건 | UI 처리 | 안내 문구 |
| --- | --- | --- | --- |
| Empty | 로그 없음 | 가이드 카드 | `아직 기록된 예약 이력이 없습니다.` |
| Loading | 로그 조회 중 | 테이블 스켈레톤 | `이력을 불러오는 중...` |
| Error | 파일 접근 실패 | 에러 패널 | `이력을 읽을 수 없습니다. 저장소 권한을 확인해 주세요.` |

**마이크로카피 가이드**
- 이벤트 라벨: `예약 활성화`, `사용자 취소`, `예약 미루기`, `최종 경고 진입`, `정상 처리`, `실패`
- 결과 배지: `성공`, `실패`, `정보`

### 6) Settings
**핵심 목적**
- 테스트 모드, 사전 알림 임계값, 최종 경고 시간, Google 연동(모의) 상태를 제어

**핵심 컴포넌트**
- 일반 설정: `simulateOnly` 토글
- 알림 설정: 기본 사전 알림 칩(10/5/1), 최종 경고 시간(초, 기본 60 / 15~300), 알림 차단 배너 + `알림 설정 열기`
- Google 연동: `연결하기`/`연결 해제` 버튼(모의)

**레이아웃 구조**
- 라우트 분할: `/settings/general`, `/settings/notifications`, `/settings/integrations/google`

**Empty/Error/Loading 상태**

| 상태 | 조건 | UI 처리 | 안내 문구 |
| --- | --- | --- | --- |
| Empty | 사용자 설정 없음 | 기본값 자동 채움 | `기본 권장 설정이 적용되어 있습니다.` |
| Loading | 설정 파일 로딩 | 폼 비활성 | `설정을 불러오는 중...` |
| Error | 저장 실패 | 상단 오류 + 롤백 | `설정을 저장하지 못했습니다. 다시 시도해 주세요.` |

**마이크로카피 가이드 (권한 요청 설명 포함)**
- 권한 카드 제목: `권한이 필요한 이유`
- 권한 설명: `앱은 종료 전 알림 표시와 예약 상태 유지에 필요한 최소 권한만 요청합니다.`
- 보조 문구: `권한을 허용하지 않아도 앱은 동작하지만 일부 알림 기능이 제한될 수 있습니다.`
- 테스트 모드 설명: `테스트 모드(실제 종료 안 함)` / `UI만 테스트할 때 켜세요.`

### 7) Optional: Google Integration (Mock)
**핵심 목적**
- Google 연동 화면에서 연결 상태를 명시적으로 관리한다(모의 동작)

**핵심 컴포넌트**
- Google 연결/해제 버튼, 연결 상태 배지

**레이아웃 구조**
- 상단: 기능 설명 카드
- 중단: 연결 상태 + 연결/해제 액션

**Empty/Error/Loading 상태**

| 상태 | 조건 | UI 처리 | 안내 문구 |
| --- | --- | --- | --- |
| Empty | 미연결 | Connect CTA | `Google 연동은 현재 모의 기능입니다.` |
| Loading | 상태 변경 중 | 버튼 비활성(권장) | `연결 상태를 변경하는 중...` |
| Error | 저장 실패 | 오류 배너 + 재시도 | `연결 상태를 저장하지 못했습니다.` |

**마이크로카피 가이드 (모의 연결 상태)**
- 핵심 설명: `이 기능은 MVP 필수가 아니며, 현재는 모의 연결 상태만 제공합니다.`
- 연결 버튼: `연결하기`
- 해제 버튼: `연결 해제`
- 정책 문구: `실제 OAuth/이메일 발송은 구현되지 않았습니다.`

### 8) About / Help
**핵심 목적**
- 안전 고지, 문제 해결, 버전/지원 채널 안내

**핵심 컴포넌트**
- 안전 안내 카드, FAQ, 문제 해결 링크, 버전 정보

**레이아웃 구조**
- 상단: 안전 고지
- 중단: FAQ/문제 해결
- 하단: 버전 및 문의처

**Empty/Error/Loading 상태**

| 상태 | 조건 | UI 처리 | 안내 문구 |
| --- | --- | --- | --- |
| Empty | FAQ 데이터 없음 | 기본 가이드 노출 | `도움말 준비 중입니다. 기본 안전 안내를 확인해 주세요.` |
| Loading | 원격 리소스 없음(로컬 로드) | 간단 스켈레톤 | `도움말을 불러오는 중...` |
| Error | 읽기 실패 | 정적 fallback | `도움말을 표시할 수 없습니다. 앱을 재시작해 주세요.` |

**마이크로카피 가이드**
- `자동 종료는 시스템 작업을 중단할 수 있습니다. 저장되지 않은 작업이 없는지 확인해 주세요.`
- 외부 링크 라벨: `GitHub(소스 코드) ↗`, `릴리즈 노트 ↗`, `개인정보 처리방침 ↗`, `도움말 센터 ↗`

---

## Layout Components

### 1) 적용 라우트/스크린 매핑

| 레이아웃 컴포넌트 | 적용 라우트/스크린 |
| --- | --- |
| `AppShell` | 전체 화면 공통 |
| `SidebarNav` | 대시보드, 새 예약, 활성 예약, 이력, 일반 설정, 알림 설정, Google 연동, 도움말 |
| `TopStatusBar` | 온보딩을 제외한 전 라우트 |
| `QuickActionFooter` | 온보딩을 제외한 전 라우트(Idle은 새 예약 중심, 활성 예약에서 취소/미루기 노출) |
| `TrayMenuAdapter` | Windows 트레이 / macOS 메뉴바 |
| `NotificationLayer` | 전 화면 공통 |

### 2) App Shell 역할 우선순위

| 영역 | 우선순위 | 역할 |
| --- | --- | --- |
| 상태바 | P0 | 예약 진행 여부/카운트다운/정확 시각 표시 |
| 액션바 | P0 | Cancel/Snooze/생성 핵심 제어 |
| 콘텐츠 영역 | P1 | 화면별 업무 흐름 처리 |
| 사이드바 | P2 | 내비게이션 |
| 보조 패널 | P3 | 로그/설명/힌트 |

```txt
+------------------------------------------------------+
| TopStatusBar: [예약됨] [00:12:41] [오늘 23:40:00 · 12분 후] |
+-------------------+----------------------------------+
| SidebarNav        | ContentRouter                    |
| - Dashboard       |                                  |
| - New Schedule    |                                  |
| - Watch Process   |                                  |
| - History         |                                  |
| - Settings        |                                  |
+-------------------+----------------------------------+
| QuickActionFooter(활성): [취소] [10분 미루기] [5/15분 미루기] [미루기(분)] |
+------------------------------------------------------+
```

### 3) QuickActionFooter 상태 행렬 (IMP-08)
| 요소 | Idle | Armed | FinalWarning | 기본값/입력 규칙 | 포커스 규칙 |
| --- | --- | --- | --- | --- | --- |
| `새 예약 만들기` 버튼 | Enabled | Hidden | Hidden | Idle 전용 primary CTA | Idle에서 Footer 진입 1순위 |
| `지금 취소` 버튼 | Disabled(사유 안내) | Enabled | Enabled | 활성 상태에서 즉시 실행 | 활성 상태 Footer 진입 시 1순위 포커스 |
| `미루기 빠른 버튼` | `10분 미루기` 단일 버튼 Disabled(사유 안내) | `10·5·15분 미루기` Enabled | `10·5·15분 미루기` Enabled | 활성 상태 원클릭 미루기, Idle에서는 단일 비활성 버튼으로 경로만 고지 | 취소 뒤 `10분`이 먼저 포커스됨 |
| `미루기(분)` 입력 | Disabled(기본값 `10` 노출) | Enabled | Enabled | 기본값 `10`, 범위 `1..1440` | 빠른 버튼 뒤 순서로 포커스 |

### 4) 반응형 동작(리사이즈)
- 폭이 줄어들수록 우선순위: 상태 정보 > 안전 액션 > 상세 로그 > 장식 요소
- 최소 폭(`980`) 구간에서는 사이드바를 아이콘+툴팁 또는 접힘 패널로 전환
- `standard` 이상에서 상태바 1행 유지
- 모든 구간에서 `취소/미루기` 버튼은 고정 노출

### 5) Tray/Menu bar 미니 UI 동작

| 항목 | Windows (System Tray) | macOS (Menu Bar) |
| --- | --- | --- |
| 명칭 | 트레이 아이콘 메뉴 | 메뉴바 아이콘 메뉴 |
| 기본 호출 | 우클릭 메뉴 중심 | 클릭 드롭다운 중심 |
| 1차 액션 | `Quick Start Last Mode`, `Show Countdown`, `Open Window`, `Cancel Schedule`, `Snooze 10m` | `Quick Start Last Mode`, `Show Countdown`, `Open Window`, `Cancel Schedule`, `Snooze 10m` |
| 상태 표기 | 툴팁/알림센터 중심 | 메뉴 항목 상단 상태 라벨 중심 |
| 종료 동작(정책) | `Armed`에서 `Quit App` 선택 시 선택 모달 표시(`예약 취소 후 종료` / `백그라운드 유지`) | `Armed`에서 `Quit App` 선택 시 선택 모달 표시(`예약 취소 후 종료` / `백그라운드 유지`) |

As-built note: 현재 구현은 `Armed`/`FinalWarning` 상태 `Quit App`에서 `quit_guard_requested` 모달을 표시한 뒤 선택 결과를 적용한다.
추가 정책: 윈도우 닫기(X)는 앱 종료가 아니라 창 숨김으로 처리해 예약을 유지한다.

상태별 메뉴 규칙(IMP-09):
| 상태 | 요약행 라벨 | `Cancel Schedule` | `Snooze 10m` | `Quit App` |
| --- | --- | --- | --- | --- |
| Idle | `활성 스케줄 없음` | Enabled(no-op) | Enabled(요청 무시) | 즉시 종료(확인 모달 없음) |
| Armed | `자동 종료 대기 중` + 남은 시간 | Enabled | Enabled | `BLOCK_AND_CHOOSE` 모달 후 처리 |
| FinalWarning | `최종 경고 진행 중` + `{finalWarningSec}` 카운트 | Enabled | Enabled | `BLOCK_AND_CHOOSE` 모달 후 처리 |

### 6) 알림센터 차이
- Windows: 현재 구현은 정보형 토스트만 사용하며 액션 버튼은 제공하지 않는다. 취소/미루기는 앱/트레이 경로로 안내한다.
- macOS: 현재 구현은 정보형 알림만 사용하며 시스템 설정 영향이 큼. 취소/미루기 실행 경로는 메뉴바/앱 UI를 사용한다.

### 7) 키보드 단축키(Cmd/Ctrl 병기)

| 기능 | Windows | macOS |
| --- | --- | --- |
| 새 예약 | `Ctrl+N` | `Cmd+N` |
| 확인 모달 닫기 | `Esc` | `Esc` |

---

## Interaction Patterns

### 1) 스케줄링 패턴

| 단계 | 사용자 행동 | 시스템 반응 | 안전 장치 |
| --- | --- | --- | --- |
| 1 | 모드 선택(카운트다운/시각/프로세스) | 입력 폼 표시 | 입력 유효성 실시간 검증 |
| 2 | 값 입력/선택 | 종료 시각 미리보기 | 절대시각+상대시간 동시 표시 |
| 3 | `예약 준비` 클릭 | 확인 모달 오픈 | 자동 Arm 금지 |
| 4 | `예약 시작(Arm)` 확정 | `armed` 상태 전환 | 상단 상태바 고정 표시 |

### 2) 확인 모달 패턴(필수)
- 제목: `예약 시작(Arm) 확인`
- 본문 섹션: `무엇이 일어나나요?`, `언제 일어나나요?`, `취소/미루기 경로`, `알림 임계값`
- 시간 표기: 절대시각 + 상대시간 병기(예: `오늘 23:40:00 · 4시간 후`)
- 경로 문구: `앱 하단 빠른 액션`, `트레이 메뉴`, `최종 경고 오버레이`
- 버튼 순서: `돌아가기`(Secondary) / `예약 시작(Arm)`(Primary)

### 3) Cancel/Snooze 패턴
- 접근 경로: 본문 액션바 + 최종 경고 오버레이 + 트레이/메뉴바
- `Cancel`: 즉시 `idle` 복귀, 로그에 사유 기록
- `Snooze`(countdown/specific-time): 입력값(1~1440분) 기준으로 재계산, 기본 입력값은 10분
- `Snooze`(process-exit): 감시는 유지하고 final warning 진입만 지연(`snoozeUntilMs`)
- `Quit`(armed): 즉시 종료 대신 선택 모달을 통해 `예약 취소 후 종료` / `백그라운드 유지` / `돌아가기`를 선택

### 3-1) Replace 트랜잭션 패턴 (IMP-10)
1. 새 스케줄 입력값 유효성 검증
2. 교체 확인 모달에서 사용자 승인
3. 기존 스케줄 `cancelled(reason=replace)` 기록
4. 새 스케줄 Arm
5. 실패 시 롤백: 기존 스케줄 복원 + `replace_rolled_back` 이력 기록

### 4) 사전 알림 패턴
- 알림 시점(시간 기반 모드): `10m`, `5m`, `1m`, `final_grace_entered`
- 알림 내용: 현재 상태, 남은 시간, 정확한 종료 시각, 액션 경로 안내
- 정책: 데스크톱 알림은 정보 표시 전용이며 알림 버튼으로 취소/미루기 액션을 실행하지 않는다.
- 미지원 환경 fallback: 인앱 상단 배너 + 상태바 강조
- 정책: `process-exit` 모드는 완료 시점이 비결정적이므로 10m/5m/1m 사전 알림을 사용하지 않고 완료 감지 직후 Final Warning으로 진입한다.
- 대체 알림: `프로세스 종료가 감지되어 최종 경고가 시작되었습니다.`
- As-built note: 위 정책이 현재 구현과 일치한다.

### 5) 프로세스 선택 패턴
- 새로고침으로 최신 프로세스 목록을 조회하고 최대 120개를 표시
- 목록은 백엔드에서 `name -> pid` 순으로 정렬되며 검색 입력은 제공하지 않는다.
- 선택 시 `감시 대상: {name} (PID {pid})`와 고급 식별 입력(`실행 파일 경로(권장)`, `명령줄 토큰(선택)`)을 노출
- 감시 중 프로세스 소실 시 안정 구간 경과 후 final warning 진입
- final warning 중 프로세스 재등장 시 즉시 `armed`로 롤백하고 "종료 보류" 알림 표시
- 고급 식별 불가 환경에서는 name fallback 허용 + 이력 이벤트에 degraded 사유 기록
- 감시 중 selector가 유효하지 않게 되면 `NO_FAIL_OPEN_PROCESS_EXIT`로 `failed` 이벤트를 기록하고 스케줄을 안전 중단
- 프라이버시 규칙(Do): `cmdlineContains`는 마스킹/해시 처리 값만 저장, 기본 UI는 `executable` 파일명만 표시
- 프라이버시 규칙(Don't): 토큰/개인정보가 포함된 cmdline 원문 또는 전체 경로를 로그/이력에 평문 저장하지 않음
- 마스킹 예시: `--token=****` / `cmdlineTokenHash=sha256:2f4c7a...`
- As-built note: 현재 구현은 상태 파일의 `active.processSelector`, `lastScheduleRequest.processSelector`에 `executable`, `cmdlineContains` 원문이 저장될 수 있다.

### 6) 권한 요청 패턴
- 언제: 알림/프로세스 정보 접근이 필요한 첫 시점
- 어떻게: "권한 요청 이유" 먼저 설명 후 OS 프롬프트 노출
- 거부 시: 기능 제한을 명확히 고지하고 대체 경로 안내

### 7) Optional Google 연동(모의) 패턴
- 현재 구현은 `Google 계정 연결(테스트)` 화면에서 `연결됨/연결 안 됨` 상태를 모의 표시한다.
- 실제 OAuth/이메일 전송은 범위 밖이며, 상태 토글만 로컬 저장소에 반영한다.

### 8) Final Grace Period(기본 60초, 설정 15~300초) 상세 규격
1. `T-finalWarningSec`: 전면 최종 경고 오버레이(`role="alertdialog"`) 표시 + 강한 대비 색상 적용
2. `T-finalWarningSec ~ T-0s`: `지금 취소`, `{postponeMinutes}분 미루기`(기본 입력값 10분) 액션 유지
3. `process-exit`에서는 1초마다 프로세스 재검증, 재등장 시 즉시 `armed`로 롤백
4. `T-0s`: 취소/미루기 입력 없으면 종료 절차 진행
5. `T-0s` 직전에도 정확 시각을 재표시하여 예측 가능성 유지

```txt
T-10m -> T-5m -> T-1m -> T-finalWarningSec(final grace) -> T-0(execute)
```

### 9) 상태 파일 손상 복구 UX (IMP-16)
- 복구 성공:
  - TopStatusBar 배너: `상태 파일 손상을 감지해 마지막 정상 백업(.bak)으로 복구했습니다. 현재 스케줄을 확인해 주세요.`
  - CTA: 없음(배너/이력 안내만 제공)
  - History 이벤트: `state_restored_from_backup`
- 복구 실패:
  - TopStatusBar 배너: `상태 파일 손상을 감지해 기본 상태로 복구했습니다. 기존 스케줄은 안전을 위해 복원되지 않았습니다.`
  - CTA: 없음(배너/이력 안내만 제공)
  - History 이벤트: `state_parse_failed`(백업 복구 미적용)

### 10) 재시작 후 자동 복구 미지원 안내 (IMP-17)
- 재시작 시 미완료 스케줄이 감지되면 배너를 노출한다.
- 배너 문구: `앱 재시작 후 이전 스케줄은 자동 복구되지 않습니다.`
- CTA: 없음(배너/이력 안내만 제공)
- History 이벤트: `resume_not_supported`

### 11) 사용자 에러 문구 표준 (IMP-14)
| 상황 | 사용자 문구 | 노출 위치 |
| --- | --- | --- |
| 미루기 범위 오류 | `미루기 시간은 1분에서 1440분 사이로 입력해 주세요.` | Footer 인라인 오류 |
| 최종 경고 범위 오류 | `최종 경고 시간은 15초에서 300초 사이로 설정해 주세요.` | 설정 화면 |
| 권한 부족 | `권한이 없어 요청을 완료할 수 없습니다.` | 배너/모달 |
| 상태 저장 실패 | `상태를 저장하지 못했습니다. 다시 시도해 주세요.` | 설정/활성 스케줄 |
| 상태 파일 손상 | `저장 상태를 읽지 못했습니다. 복구를 시도합니다.` | 시작 배너 |
| 종료 실패 | `자동 종료를 실행하지 못했습니다.` | 최종 경고 이후 결과 배너 |

### 12) 컴포넌트 상태 사양표 (default/hover/pressed/disabled/focus)

| 컴포넌트 | Default | Hover | Pressed | Disabled | Focus |
| --- | --- | --- | --- | --- | --- |
| Primary Button | bg `primary-500`, text `neutral-0` | bg `primary-600` | bg `primary-700` | bg `neutral-200`, text `neutral-500` | 2px ring `primary-300` |
| Secondary Button | bg `neutral-100`, text `neutral-900` | bg `secondary-100` | bg `secondary-500`, text `neutral-0` | bg `neutral-100`, text `neutral-500` | 2px ring `secondary-500` |
| Destructive Button | bg `danger-500`, text `neutral-0` | bg `#991B1B` | bg `#7F1D1D` | bg `#FEE2E2`, text `#991B1B` | 2px ring `#FCA5A5` |
| Input (시간/검색) | border `neutral-200`, text `neutral-900` | border `neutral-500` | border `primary-500` | bg `neutral-100`, text `neutral-500` | ring `primary-300`, outline offset 2px |
| Select/Dropdown | border `neutral-200`, icon `neutral-500` | border `neutral-500` | border `primary-500`, bg `primary-50` | bg `neutral-100`, text `neutral-500` | ring `primary-300` |
| Status Pill (Idle/Armed/Final warning) | Idle: `neutral-200`; Armed: `primary-500`; Final warning: `warning-500` | 색상 변화 없음(비인터랙티브) | 해당 없음 | opacity 70% | 컨테이너 포커스 시 외곽선 `primary-300` |
| Notification Card | bg `neutral-0`, border `neutral-200` | border `neutral-500` | border `primary-500` | bg `neutral-100`, text `neutral-500` | 좌측 바 `primary-500` + ring |
| Tray/Menu Item | text `neutral-900` | bg `neutral-100` | bg `neutral-200` | text `neutral-500` | OS 기본 focus + 체크/라디오 명확화 |
| Toggle (설정/Google 모의 연동) | off: track `neutral-200`; on: track `primary-500` | track 밝기 +5% | thumb scale 98% | opacity 50% | 2px ring `primary-300` |

---

## Breakpoints

### 1) 브레이크포인트 정의

| 이름 | 최소 폭 | 레이아웃 규칙 |
| --- | --- | --- |
| `standard` | `980px` | MVP 최소 창 폭. 사이드바 축약 + 본문 1열, 로그는 접이 패널 |
| `desktop` | `1200px` | 기본 2열(콘텐츠+보조패널), 상태바 1줄 |
| `wide` | `1440px` | 3영역 배치(내비/콘텐츠/로그), 정보 밀도 확장 |

주석:
- MVP 최소 창 크기는 `980x700`으로 고정한다.
- 기존 `compact(480)` 구간은 현 구현에서 도달 불가하므로 MVP 활성 브레이크포인트에서 제외한다(v1.1 후보).

### 2) 구간별 우선순위 규칙
- `standard`: 타임라인 일부 축약, 핵심 상태는 항상 헤더 유지
- `desktop`/`wide`: 로그/상세 정보 확장, 제어 영역 위치 고정

### 3) 최소 폭 안전 규칙
- 최소 폭(`980`)에서도 `Cancel`과 `Snooze`는 스크롤 없이 보이도록 보장
- 위험 액션 버튼은 최소 터치/클릭 영역 `44x28px` 이상

```css
/* Breakpoint token map */
:root {
  --app-min-width: 980px;
  --app-min-height: 700px;
  --bp-standard: 980px;
  --bp-desktop: 1200px;
  --bp-wide: 1440px;
}

@media (min-width: 980px) { /* standard */ }
@media (min-width: 1200px) { /* desktop */ }
@media (min-width: 1440px) { /* wide */ }
```

---

## Accessibility (WCAG 2.2 checklist + contrast ratio checklist)

### 1) WCAG 2.2 체크리스트

| 항목 | 기준 | AA 필수 | AAA 권장 | 체크 |
| --- | --- | --- | --- | --- |
| 키보드 접근 가능 | 2.1.1 Keyboard | 필수 | 필수 | [ ] |
| 포커스 가시성 | 2.4.7 Focus Visible / 2.4.11 Focus Appearance | 필수 | 강화 | [ ] |
| 포커스 순서 논리성 | 2.4.3 Focus Order | 필수 | 필수 | [ ] |
| 링크/버튼 목적 명확 | 2.4.4 Link Purpose | 필수 | 필수 | [ ] |
| 오류 식별/수정 안내 | 3.3.1, 3.3.3 | 필수 | 필수 | [ ] |
| 상태 변화 알림 | 4.1.3 Status Messages | 필수 | 필수 | [ ] |
| 명도 대비 준수 | 1.4.3, 1.4.11 | 필수 | 강화 | [ ] |
| 색상 단독 의존 금지 | 1.4.1 Use of Color | 필수 | 필수 | [ ] |
| 재인증 시 데이터 보존 | 3.3.7 Redundant Entry | 권장 | 권장 | [ ] |
| 드래그 대체 입력 제공 | 2.5.7 Dragging Movements | 필수 | 필수 | [ ] |
| 위험 액션 확인 절차 | 3.3.4 Error Prevention | 필수 | 강화 | [ ] |
| 시간 제한 제어 | 2.2.1 Timing Adjustable | 필수 | 강화 | [ ] |

### 2) 대비 비율 체크리스트 (AA/AAA)

| 분류 | 텍스트 크기/유형 | AA | AAA | 체크 |
| --- | --- | --- | --- | --- |
| 일반 텍스트 | 18pt 미만 또는 14pt Bold 미만 | `4.5:1` 이상 | `7:1` 이상 | [ ] |
| 큰 텍스트 | 18pt 이상 또는 14pt Bold 이상 | `3:1` 이상 | `4.5:1` 이상 | [ ] |
| UI 컴포넌트 경계 | 입력/버튼/카드 보더 | `3:1` 이상 | `4.5:1` 권장 | [ ] |
| 포커스 인디케이터 | 포커스 링/아웃라인 | `3:1` 이상 | `4.5:1` 권장 | [ ] |
| 상태 배지 | Idle/Armed/Final warning 배지 텍스트 | `4.5:1` 이상 | `7:1` 권장 | [ ] |

### 3) 접근성 구현 가이드
- 스크린리더 라벨 예시: `"현재 상태 Armed, 종료까지 12분 남음"`
- 전역 라이브 영역 규칙:
  - `aria-live="polite"`: 시간 기반 10m/5m/1m, 설정 저장 성공, 일반 상태 동기화 안내
  - `aria-live="assertive"`: final warning 진입, 상태 파일 복구 실패, 종료 실패
- 포커스 규칙:
  - 최종 경고 오버레이 진입 시 모달 내부 첫 액션(`지금 취소`)으로 포커스 이동
  - 오버레이 종료 시 호출 지점(직전 포커스 요소)으로 포커스 복귀
  - 모달/오버레이 열림 중 포커스 트랩 유지
- 키보드 동선 규칙:
  - `Tab`/`Shift+Tab`으로 2동작 이내에 `지금 취소` 또는 `10분 미루기`에 도달 가능해야 한다.
- 최종 경고 오버레이 labeling:
  - `role="alertdialog"`, `aria-modal="true"`
  - `aria-labelledby="final-warning-title"`, `aria-describedby="final-warning-description"`
  - 제목/본문은 현재 설정값(`finalWarningSec`)을 포함한 자연어 문구를 사용한다.

현재 구현 상태: 전역 `aria-live`(`polite`/`assertive`) 분리, Final Warning `role="alertdialog"` + `aria-labelledby` + `aria-describedby`, 포커스 트랩/닫힘 후 포커스 복귀가 구현되어 있다.

```html
<!-- 접근성 마이크로카피 예시 (디자인 명세용) -->
<button aria-label="자동 종료를 즉시 취소">지금 취소</button>
<div role="status" aria-live="polite">자동 종료까지 5분 남았습니다.</div>
<section id="final-warning-description">종료 60초 전입니다. 지금 취소하지 않으면 종료가 진행됩니다.</section>
```

### 4) 접근성 수락 기준 (IMP-15)
| ID | 수락 기준 | 검증 방법 |
| --- | --- | --- |
| A11Y-AC-01 | 전역 `aria-live`의 `polite/assertive`가 이벤트 성격에 맞게 분리된다. | 스크린리더 로그 확인 |
| A11Y-AC-02 | Final Warning 오버레이 진입 시 포커스 트랩이 동작하고 닫힘 시 원위치 복귀한다. | 키보드 탐색 테스트 |
| A11Y-AC-03 | `Tab` 기준 2동작 이내에 취소 또는 미루기 버튼에 도달 가능하다. | 수동 키보드 QA |
| A11Y-AC-04 | Final Warning 오버레이는 `role="alertdialog"`와 `aria-labelledby/aria-describedby`를 모두 가진다. | DOM 스냅샷 검사 |
| A11Y-AC-05 | 상태 변경 안내 문구는 한국어 자연어로 제공되고 숫자 값은 현재 설정을 반영한다. | 문자열/시나리오 검수 |

---

## Design QA Checklist

| 축 | 검증 질문 | 완료 |
| --- | --- | --- |
| Clarity | 사용자가 현재 상태(Idle/Armed/Final warning)와 다음 동작 시점을 3초 내 파악 가능한가? | [ ] |
| Safety | Arm 전 확인, 최종 경고(기본 60초/설정 15~300초), 취소/미루기 접근성이 모든 경로에서 보장되는가? | [ ] |
| Accessibility | 키보드 전용 조작, 포커스 가시성, 대비 기준(AA 이상), 라이브 알림이 충족되는가? | [ ] |
| Error States | 오프라인/권한 거부/프로세스 없음/상태 저장 실패/종료 실패 상태 문구와 복구 CTA가 있는가? | [ ] |
| Platform Consistency | Windows 트레이와 macOS 메뉴바의 네이티브 관례 차이를 반영했는가? | [ ] |
| Localization Readiness | 한국어 문자열 길이 증가/시각 표기/단축키 병기(Cmd/Ctrl)가 레이아웃을 깨지 않는가? | [ ] |

### 수락 기준 점검표
1. 필수 상위 섹션과 `---` 구분선 포함
2. Tailwind 토큰명 + HEX 포함
3. 페이지별 목적/컴포넌트/레이아웃/상태/마이크로카피 포함
4. 안전 규칙 5개(Armed 가시화, Arm 확인, Cancel/Snooze, 정확 시각, Final Grace) 반영
5. Windows Tray vs macOS Menu bar + 단축키 병기 반영
6. Google 연동(모의) 연결/해제/저장 실패 상태 반영
7. Armed 상태 Quit 정책(`BLOCK_AND_CHOOSE`)과 창 닫기(X) 정책(창 숨김)이 반영
8. process-exit 사전 알림 정책(사전 알림 없음 + 완료 감지 즉시 Final Warning)이 반영
9. 최소 창 크기(`980x700`)와 활성 브레이크포인트(`980/1200/1440`)가 일치
10. QuickActionFooter/Tray 상태 행렬이 Idle/Armed/FinalWarning 기준으로 정의됨
11. Notification info-only 정책(액션은 앱/오버레이/트레이)이 명시됨
12. 히스토리 저장 250 vs UI 렌더 120(페이징) 분리 규칙이 반영됨
13. WCAG 2.2 체크리스트 + 대비 표 + aria-live/포커스 AC 포함
14. 컴포넌트 상태표 + `picsum.photos` 예시 포함
15. 실제 OS 종료 구현 코드 미포함
16. 한국어 문서 기준 충족


