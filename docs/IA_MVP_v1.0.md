# 자동 종료 예약 스케줄러 IA (MVP v1.0)

> STATUS: CANONICAL
> Role: 라우트/화면 구조/내비게이션의 진실 원천
> Canonical Set: [PRD](./PRD_MVP_v1.0.md), [DESIGN_GUIDE](./DESIGN_GUIDE_MVP_v1.0.md), [USE_CASE](./USE_CASE_MVP_v1.0.md), [IA](./IA_MVP_v1.0.md)
> Ops Guide: [RUNBOOK.md](./RUNBOOK.md)
> Archive: [archive/](./archive/)
> Artifacts: [../artifacts/verification/](../artifacts/verification/)
> Update Rule: Follow RUNBOOK `Doc Sync`
> Last synced with implementation: 2026-02-17 (commit db40591)

## TL;DR
- 이 문서는 라우트, 화면 구조, 내비게이션의 정본이다.
- MVP 정본 라우트는 `/dashboard`, `/schedule/new`, `/schedule/active`, `/history`, `/settings/*`, `/help`이다.
- TopStatusBar/QuickActionFooter는 안전 액션 가시성(취소/미루기) 관점에서 상시 유지한다.
- 트레이/종료 경로에서도 단일 활성 예약 정책과 Quit Guard를 동일하게 적용한다.
- 과거 버전은 archive에 보관하고, 운영 증빙은 RUNBOOK + artifacts 경로로 분리한다.

## Document Meta
- Version: MVP v1.0 (as-built canonical)
- Date: 2026-02-17
- Change Summary: 문서 정본 체계 정리(archive 링크/상호참조 정비)

## Archived Versions
- [2026-02-17 pre-refactor snapshot](./archive/2026-02-17_pre-refactor/IA_MVP_v1.0.md)

## 1) IA 원칙
- 30초 룰: 사용자는 어떤 화면에서도 30초 안에 `상태`, `다음 행동`, `안전 경로`를 이해해야 한다.
- 3초 스캔: 헤더에서 `상태 배지`, `남은 시간`, `종료 시각`을 3초 내 인지해야 한다.
- 사용자 라벨은 `예약`을 사용하고, 내부 경로는 `/schedule/*`을 유지한다.
- 단일 활성 예약 정책은 UI/트레이/quit guard 모두 동일하게 적용한다.

## 2) 라우트 맵 (정본)
| 내부 라우트 | 사용자 라벨 | URL 예시 |
| --- | --- | --- |
| `/dashboard` | 대시보드 | `/#/dashboard` |
| `/schedule/new` | 새 예약 | `/#/schedule/new?mode=countdown|specific-time|process-exit` |
| `/schedule/active` | 활성 예약 | `/#/schedule/active` |
| `/history` | 이력 | `/#/history` |
| `/settings/general` | 일반 설정 | `/#/settings/general` |
| `/settings/notifications` | 알림 설정 | `/#/settings/notifications` |
| `/settings/integrations/google` | Google 연동 | `/#/settings/integrations/google` |
| `/help` | 도움말 | `/#/help` |

참고:
- 온보딩 라우트(`/onboarding/*`)는 진입 전 단계로 유지하지만 MVP 핵심 IA에는 위 8개 라우트를 기준으로 문서화한다.

## 3) 글로벌 IA 구조
```text
AppShellV2
├─ Sidebar (그룹: 예약/기록/설정/도움말)
├─ TopStatusBar (상태/남은 시간/종료 시각)
├─ MainCanvas (라우트 콘텐츠)
├─ RightPanel (화면 가이드 또는 이벤트 상세, wide)
└─ QuickActionFooter (취소/미루기/새 예약)
```

고정 규칙:
- TopStatusBar와 QuickActionFooter는 온보딩을 제외한 모든 화면에서 유지된다.
- Armed/FinalWarning 상태에서는 라우트 이동과 무관하게 취소/미루기 경로가 보인다.

## 4) 화면별 IA 스펙 (코드 기준)
### 4.1 대시보드 (`/dashboard`)
- 핵심 목적: 현재 상태와 즉시 행동을 한 화면에서 결정
- 1차 정보: 상태 배지, 남은 시간, 종료 시각, 최근 이벤트
- 레이아웃: 상태 액션 카드 + 현재 할 일 카드 + 최근 이벤트 리스트
- Empty/Error/Loading:
  - Empty: `예약이 없어요`
  - Error: 상단 danger 배너
  - Loading: Skeleton
- 인터랙션: 이벤트 행 선택 시 상세 열기, `전체 보기`로 이력 이동
- 마이크로카피: `지금 할 일`, `최근 이벤트`, `새 예약 만들기`

### 4.2 새 예약 (`/schedule/new`)
- 핵심 목적: 모드 선택과 입력 검증 후 Arm 준비
- 1차 정보: 현재 모드, 예상 종료(절대+상대), 검증 에러
- 레이아웃: 모드 세그먼트 + 입력 폼 + 미리보기 카드
- Empty/Error/Loading:
  - process list empty: `검색 결과가 없습니다`
  - process error: `프로세스 목록을 불러오지 못했습니다.`
  - validation error: 인라인 배너
- 인터랙션: `예약 준비` 클릭 시 Arm 확인 모달 진입
- 마이크로카피: `모드 선택 → 값 입력 → 확인 모달`

### 4.3 활성 예약 (`/schedule/active`)
- 핵심 목적: 취소/미루기 즉시 실행 + 진행 타임라인 확인
- 1차 정보: 상태, 남은 시간, 종료 시각, 취소/미루기 버튼
- 레이아웃: 상태 카드 + 즉시 액션 카드 + 타임라인 카드
- Empty/Error/Loading:
  - Empty: `현재 활성 예약이 없습니다.`
  - Error: action error 배너
  - Loading: Skeleton
- 인터랙션: `사용자 지정` 토글로 분 입력 필드 확장
- 마이크로카피: `지금 할 수 있는 것`, `진행 타임라인`

### 4.4 이력 (`/history`)
- 핵심 목적: 이벤트를 빠르게 필터링하고 상세 원인을 확인
- 1차 정보: 필터 상태, 검색어, 최신 이력 요약
- 레이아웃: 필터/검색/정렬 툴바 + 이력 테이블 + 상세 드로어
- Empty/Error/Loading:
  - Empty: `조건에 맞는 이력이 없습니다.`
  - Error: 상단 danger 배너
  - Loading: Skeleton
- 인터랙션: 테이블 행 Enter/클릭으로 상세, `더 보기 (120개)` 페이징
- 마이크로카피: `정렬/필터/검색과 행 클릭 상세로 빠르게 스캔`

### 4.5 일반 설정 (`/settings/general`)
- 핵심 목적: 시뮬레이션/실종료 상태와 저장 정책 확인
- 1차 정보: 시뮬레이션 상태 배지, 저장 위치, 이력 보관
- 레이아웃: 안전/동작 카드 + 저장/기록 카드 + 단축키 카드
- Empty/Error/Loading:
  - Save success: `설정을 저장했습니다.`
  - Save error: danger 배너
  - Loading: Skeleton
- 인터랙션: 토글 변경 후 `설정 저장`으로 확정
- 마이크로카피: `시뮬레이션 모드(실제 종료 안 함)`

### 4.6 알림 설정 (`/settings/notifications`)
- 핵심 목적: 경고 임계값과 OS 알림 차단 상태 점검
- 1차 정보: 사전 알림 칩, 최종 경고 초, 차단 배너
- 레이아웃: 권한 배너 + 칩 그룹 + range/number 입력 + 미리보기
- Empty/Error/Loading:
  - Blocked: `종료 전 경고를 놓칠 수 있어요...`
  - Save success: `설정을 저장했습니다.`
  - Loading: Skeleton
- 인터랙션: `알림 설정 열기` CTA, 값 범위 15~300
- 마이크로카피: `최종 경고에서도 취소/미루기 가능`

### 4.7 Google 연동 (`/settings/integrations/google`)
- 핵심 목적: 옵션 연동 상태와 복구 액션 제공
- 1차 정보: 연결 상태 배지, 연결/해제/재시도 가능 여부
- 레이아웃: 단일 상태 카드 + 상태별 버튼
- Empty/Error/Loading:
  - 오프라인/토큰 만료: 복구 버튼 노출
  - action error: 배너 노출
  - Loading: Skeleton
- 인터랙션: 상태 가드에 따라 `테스트 발송` 제한
- 마이크로카피: `옵션 기능`, `토큰 만료 시뮬레이션`

### 4.8 도움말 (`/help`)
- 핵심 목적: 위험 동작 고지와 복구 경로 제공
- 1차 정보: 취소/미루기 경로, FAQ, 링크 상태
- 레이아웃: 안전 고지 + FAQ + 외부 링크 카드
- Empty/Error/Loading:
  - Offline: `오프라인에서는 열 수 없습니다.`
  - 링크 실패: danger 배너
  - Loading: Skeleton
- 인터랙션: 오프라인 시 링크 카드 disabled
- 마이크로카피: `안전 고지`, `FAQ / 문제 해결`

## 5) 이벤트 카드/이력 스캔 표준
규칙:
1. 제목행: `[상태 배지] + 한 문장 요약`
2. 메타행 칩: `[절대시각] [상대시간] [출처] [모드/조건]`
3. 우측 정보는 `행동` 또는 `결과` 하나만 둔다.
4. 시간 표시는 한 위치에만 두고 숫자는 tabular를 사용한다.

예시:
- `[사용자 취소] 예약이 취소됐어요`
- `[2026-02-15 23:39:24] [2분 전] [출처: UI] [모드: 카운트다운]`
- `[정상 처리] 예약이 정상 처리됐어요`

## 6) 트레이/알림/종료 IA
트레이 메뉴 고정 항목:
- `Quick Start Last Mode`
- `Show Countdown`
- `Open Window`
- `Cancel Schedule`
- `Snooze 10m`
- `Quit App`

Quit Guard:
- 상태가 `Armed` 또는 `FinalWarning`이면 즉시 종료 대신 선택 모달:
  - `예약 취소 후 종료`
  - `트레이 유지`
  - `돌아가기`

알림:
- 데스크톱 알림은 정보형(info-only)으로 제공
- 실행 액션은 앱 UI/최종 경고 오버레이/트레이에서 수행

## 7) 반응형 IA
- `compact(480)`, `standard(960)`, `desktop(1200)`, `wide(1440)` 토큰 유지
- 앱 최소 창 크기 `980x700`이므로 compact는 QA 시뮬레이션 범주로 취급
- 어떤 구간에서도 안전 액션은 우선순위 1이며 hidden 금지

## 8) 연계 문서
- PRD: [PRD_MVP_v1.0.md](./PRD_MVP_v1.0.md)
- Use Case: [USE_CASE_MVP_v1.0.md](./USE_CASE_MVP_v1.0.md)
- Design: [DESIGN_GUIDE_MVP_v1.0.md](./DESIGN_GUIDE_MVP_v1.0.md)
- Operations: [RUNBOOK.md](./RUNBOOK.md)
- Artifacts: [../artifacts/verification/](../artifacts/verification/), [../artifacts/handoff/](../artifacts/handoff/)
