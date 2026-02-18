# Auto Shutdown Scheduler PRD (MVP v1.0)

> STATUS: CANONICAL
> Role: 제품 범위/정책/수용 기준의 진실 원천
> Canonical Set: [PRD](./PRD_MVP_v1.0.md), [DESIGN_GUIDE](./DESIGN_GUIDE_MVP_v1.0.md), [USE_CASE](./USE_CASE_MVP_v1.0.md), [IA](./IA_MVP_v1.0.md)
> Ops Guide: [RUNBOOK.md](./RUNBOOK.md)
> Archive: [archive/](./archive/)
> Artifacts: [../artifacts/verification/](../artifacts/verification/)
> Update Rule: Follow RUNBOOK `Doc Sync`
> Last synced with implementation: 2026-02-17 (commit db40591)

## TL;DR
- 이 문서는 제품 범위, 안전 정책, 수용 기준의 정본이다.
- 문서는 구현과 일치하는 `as-built`만 정본으로 유지한다.
- ARMED 가시화, Arm 확인 모달, Cancel/Snooze 접근성, 절대+상대 시각 병기, Final Grace 60초(설정 15~300초)는 유지한다.
- 라우트/화면 구조는 IA, 상태 전이/예외는 Use Case, UI 안전 UX는 Design Guide를 따른다.
- 과거 스펙은 archive에 보관하고, 구문서는 DEPRECATED 헤더로만 유지한다.

## Document Meta
- Version: MVP v1.0 (as-built canonical)
- Date: 2026-02-17
- Change Summary: 문서 정본 체계 정리(archive/governance/deprecated/link 정합성)

## Archived Versions
- [2026-02-17 pre-refactor snapshot](./archive/2026-02-17_pre-refactor/PRD_MVP_v1.0.md)

## Documentation Governance
### 1) 정본 체계 (관리 대상 5개)
- CANONICAL: [PRD](./PRD_MVP_v1.0.md), [DESIGN_GUIDE](./DESIGN_GUIDE_MVP_v1.0.md), [USE_CASE](./USE_CASE_MVP_v1.0.md), [IA](./IA_MVP_v1.0.md)
- RUNBOOK: [RUNBOOK.md](./RUNBOOK.md)
- INDEX: [README.md](./README.md)

### 2) As-built 기준
- 구현 세부 사실은 코드/커밋이 진실 원천이다.
- 정본 문서는 P0 정책/안전 UX/핵심 흐름을 유지하는 최소 기술서로 관리한다.
- Planned 항목은 `FUTURE` 또는 `v1.1+` 표식으로 분리하며 AC로 취급하지 않는다.

### 3) 변경 규칙 (Doc Sync)
- 문서 변경은 [RUNBOOK.md](./RUNBOOK.md)의 `Doc Sync` 규칙을 따른다.
- UI/UX 변경: DESIGN_GUIDE + RUNBOOK의 UI QA 기준 반영.
- 라우트/화면 추가: IA 동시 업데이트.
- 기능/정책 변경: PRD + USE_CASE 동시 업데이트.

### 4) 버전/이력 규칙
- 정본 문서는 `Version/Date/Change Summary/Last synced` 메타를 유지한다.
- 파괴적 축약/리팩터링 전 버전은 `docs/archive/*`에 먼저 보관한다.

## 1) 제품 모토와 절대 규칙
제품 모토:
- 사용자가 화면을 보고 `지금 상태`와 `다음 행동`을 이해하는 데 30초를 넘기면 실패다.
- 이상적 목표는 3초 스캔(상태/다음 행동)이다.
- 사용은 단순하게, 구현 복잡도는 앱이 떠안는다.

절대 규칙:
1. Arm 전 확인 모달 필수(명시 동의 없이는 활성화 금지)
2. ARMED 상태 상시 가시화(남은 시간 + 정확한 종료 시각)
3. Cancel/Snooze 상시 경로(메인/최종 경고/트레이)
4. Final Grace 기본 60초(설정 15~300초), 개입 가능 상태 유지
5. 단일 활성 예약 정책(UI/트레이/알림 메시지 포함)

## 2) 범위
In scope:
- 시간 기반 예약: `countdown`, `specificTime`
- 조건 기반 예약: `processExit`
- 이력/검색/필터/정렬/상세
- 일반 설정, 알림 설정, Google 연동(옵션/모의), 도움말
- Tray 메뉴, Quit Guard

Out of scope:
- 다중 활성 예약
- 실제 Google OAuth 및 메일 송신 파이프라인
- 클라우드 의존 저장

## 3) 용어/라우트 정합성
| 내부 경로 | 사용자 라벨 |
| --- | --- |
| `/schedule/new` | 새 예약 |
| `/schedule/active` | 활성 예약 |

정책:
- 사용자 노출 텍스트는 `예약` 우선
- 내부 구현/라우트는 `/schedule` 유지
- 모드 토큰은 URL kebab-case(`specific-time`, `process-exit`), 내부 타입 camelCase(`specificTime`, `processExit`)

## 4) 화면별 요구사항 (코드 기준)
### 4.1 대시보드 (`/dashboard`)
- 핵심 목적: 상태 인지 + 즉시 행동
- 1차 정보: 상태 배지, 남은 시간, 종료 시각, 다음 행동
- 레이아웃: 상태 카드, `지금 할 일`, 최근 이벤트
- Empty/Error/Loading:
  - Empty: `예약이 없어요`
  - Error: 상단 danger 배너
  - Loading: Skeleton
- 인터랙션: 이벤트 선택 시 상세, `전체 보기` 이동
- 마이크로카피: `상태와 다음 동작을 먼저 확인하세요.`

### 4.2 새 예약 (`/schedule/new?mode=...`)
- 핵심 목적: 모드 선택/검증/Arm 준비
- 1차 정보: 모드, 예상 종료(절대+상대), 검증 에러
- 레이아웃: 모드 세그먼트 + 입력 폼 + 미리보기
- Empty/Error/Loading:
  - process empty: `검색 결과가 없습니다`
  - process error: `프로세스 목록을 불러오지 못했습니다.`
  - validation: 인라인 경고
- 인터랙션:
  - `예약 준비` -> 확인 모달
  - shell 계열 selector는 고급 식별 없으면 Arm 차단
- 마이크로카피: `모드 선택 → 값 입력 → 확인 모달 순서`

### 4.3 활성 예약 (`/schedule/active`)
- 핵심 목적: 취소/미루기 + 진행 타임라인
- 1차 정보: 상태, 남은 시간, 종료 시각, 액션 버튼
- 레이아웃: 상태 카드 + 즉시 액션 + 타임라인
- Empty/Error/Loading:
  - Empty: `현재 활성 예약이 없습니다.`
  - Error: action error 배너
  - Loading: Skeleton
- 인터랙션: 5/10/15 + 사용자 지정 미루기(1..1440)
- 마이크로카피: `지금 할 수 있는 것`

### 4.4 이력 (`/history`)
- 핵심 목적: 무슨 이벤트였는지/언제/어떤 조건인지 스캔
- 1차 정보: 필터, 검색, 최신 이벤트
- 레이아웃: 필터/검색/정렬 + 테이블 + 상세 드로어
- Empty/Error/Loading:
  - Empty: `조건에 맞는 이력이 없습니다.`
  - Error: 상단 danger 배너
  - Loading: Skeleton
- 인터랙션: 행 클릭/Enter 상세, `더 보기 (120개)`
- 마이크로카피: `정렬/필터/검색과 행 클릭 상세로 빠르게 스캔`

### 4.5 일반 설정 (`/settings/general`)
- 핵심 목적: 시뮬레이션/실종료 상태 확인과 저장
- 1차 정보: 시뮬레이션 상태, 저장 정책
- 레이아웃: 안전/동작, 저장/기록, 단축키, 저장 버튼
- Empty/Error/Loading:
  - Save success: `설정을 저장했습니다.`
  - Save error: danger 배너
  - Loading: Skeleton
- 인터랙션: 토글 변경 후 명시 저장
- 마이크로카피: `시뮬레이션 모드(실제 종료 안 함)`

### 4.6 알림 설정 (`/settings/notifications`)
- 핵심 목적: 알림 임계값 + 차단 상태 확인
- 1차 정보: 기본 사전 알림, 최종 경고 초, 권한 차단 배너
- 레이아웃: 권한 배너 + 칩 + range/number + 미리보기
- Empty/Error/Loading:
  - 권한 차단: `종료 전 경고를 놓칠 수 있어요...`
  - Save success: `설정을 저장했습니다.`
  - Loading: Skeleton
- 인터랙션: `알림 설정 열기`, 15~300 범위 강제
- 마이크로카피: `최종 경고에서도 취소/미루기 가능`

### 4.7 Google 연동 (`/settings/integrations/google`)
- 핵심 목적: 옵션 연동 상태 및 복구 액션
- 1차 정보: 연결 상태 배지, 현재 가능한 버튼
- 레이아웃: 상태 카드 + 액션 영역
- Empty/Error/Loading:
  - 오프라인/토큰 만료 상태 가이드
  - action error 배너
  - Loading: Skeleton
- 인터랙션: 연결/해제, 테스트 발송, 토큰 만료 시뮬레이션
- 마이크로카피: `옵션 기능`, `재시도`

### 4.8 도움말 (`/help`)
- 핵심 목적: 안전 고지/FAQ/외부 복구 경로 제공
- 1차 정보: 취소/미루기 경로, FAQ, 링크 접근 상태
- 레이아웃: 안전 고지 카드 + FAQ + 링크 카드
- Empty/Error/Loading:
  - 오프라인: `오프라인에서는 열 수 없습니다.`
  - 링크 실패: action error 배너
  - Loading: Skeleton
- 인터랙션: 오프라인 시 링크 disabled
- 마이크로카피: `안전 고지`, `FAQ / 문제 해결`

## 5) Dashboard/History 이벤트 카드 표준
문제:
- 이벤트 요약 문자열 중복(상태/시간/사유 반복)으로 스캔 속도 저하

표준:
1. 제목행: `[상태 배지] + 한 문장 요약` (중복 금지)
2. 메타행 칩: `[발생시각(절대)] [상대시간] [출처] [모드/조건]`
3. 우측 영역: `행동` 또는 `결과` 하나만 표시
4. 시간은 한 위치만 사용
5. 시간/숫자 tabular 적용, 포맷 통일(`YYYY-MM-DD HH:mm:ss`)

예시:
- `[사용자 취소] 예약이 취소됐어요`
- `[2026-02-15 23:39:24] [2분 전] [출처: UI] [모드: 카운트다운]`
- `[정상 처리] 예약이 정상 처리됐어요`

## 6) 기능 정책 (핵심)
- 상태 모델:
  - 외부: `idle(active=null)`, `armed`, `finalWarning`
  - 내부 실행 단계: `shuttingDown`
- Quit 정책:
  - `armed/finalWarning`에서 즉시 종료 금지
  - 선택지: `예약 취소 후 종료`, `트레이 유지`, `돌아가기`
- 알림 정책:
  - 데스크톱 알림은 info-only
  - 실행 액션은 앱 UI/최종 경고/트레이에서 수행
- 저장:
  - 상태 파일: `scheduler-state.json` + `.bak/.tmp`
  - 이력 보관 250(FIFO), UI 페이지 120

## 7) 수용 기준 (Acceptance)
### 7.1 30초 룰
- AC-30-1: 신규 사용자도 30초 안에 `현재 상태`, `다음 행동`, `취소/미루기 경로`를 말할 수 있다.
- AC-30-2: Arm 확인 모달에서 실행 시점과 취소 경로를 재확인 가능하다.

### 7.2 3초 스캔
- AC-3-1: TopStatusBar만 보고 3초 안에 상태/남은 시간/종료 시각을 읽을 수 있다.
- AC-3-2: 활성 상태에서 3초 안에 `취소` 또는 `10분 미루기` 버튼 위치를 찾을 수 있다.

### 7.3 안전 정책
- AC-S-1: 명시 동의 없는 Arm 금지
- AC-S-2: Final Grace 동안 취소/미루기 가능
- AC-S-3: 단일 활성 예약 불변식 유지
- AC-S-4: 상태 라벨과 시간 표기의 절대/상대 병기 유지

## 8) 테스트 체크리스트 (현재 UI 문구/복구 경로 반영)
| 케이스 | 확인 항목 | 기대 결과 |
| --- | --- | --- |
| 권한 거부(알림) | `/settings/notifications`에서 권한 차단 상태 | `종료 전 경고를 놓칠 수 있어요...` 배너 + `알림 설정 열기` CTA |
| 절전 복귀 | 복귀 후 상태/시간 재동기화 | 잘못된 즉시 종료 없이 최신 상태 반영 |
| 타임존 변경 | specific-time 재정렬 | 이력 이벤트(`timezone_realigned`)와 안내 반영 |
| 상태 파일 손상 | 손상 감지/복구 | 상단 배너 + 이력 이벤트로 복구 사실 전달 |
| process-exit selector 손상 | fail-open 방지 | 안전 중단 + 재선택 유도 배너 |
| Final Grace | 60초(또는 설정값) 카운트다운 | 오버레이에서 즉시 `취소/미루기` 가능 |
| Quit Guard | active 상태에서 종료 요청 | 선택 모달 노출 후 선택 결과 반영 |

## 9) 리스크/명시
- 현재 구현은 `processSelector.executable/cmdlineContains` 원문이 상태 파일에 남을 수 있다.
- 이는 보안 고도화 항목으로 별도 트랙에서 관리한다.
