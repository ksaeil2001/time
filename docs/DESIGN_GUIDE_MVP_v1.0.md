# Auto Shutdown Scheduler 디자인 가이드 (MVP v1.0)

> STATUS: CANONICAL
> Role: UI/UX/접근성/Safety-first 표현 규칙의 진실 원천
> Canonical Set: [PRD](./PRD_MVP_v1.0.md), [DESIGN_GUIDE](./DESIGN_GUIDE_MVP_v1.0.md), [USE_CASE](./USE_CASE_MVP_v1.0.md), [IA](./IA_MVP_v1.0.md)
> Ops Guide: [RUNBOOK.md](./RUNBOOK.md)
> Archive: [archive/](./archive/)
> Artifacts: [../artifacts/verification/](../artifacts/verification/)
> Update Rule: Follow RUNBOOK `Doc Sync`
> Last synced with implementation: 2026-02-17 (commit db40591)

## TL;DR
- 이 문서는 UI/UX, 접근성, Safety-first 표현 규칙의 정본이다.
- ARMED 가시화, Arm 확인 모달, Cancel/Snooze 접근성, 절대+상대 시각 병기, Final Grace 60초(설정 15~300초)는 비가역 규칙이다.
- 라우트/정보구조 자체는 IA 정본을 따른다.
- 상태 전이/예외 처리의 동작 정의는 Use Case 정본을 따른다.
- 과거 버전은 archive를 참고하고, 운영 절차는 RUNBOOK + artifacts에서 관리한다.

## Document Meta
- Version: MVP v1.0 (as-built canonical)
- Date: 2026-02-17
- Change Summary: 문서 정본 체계 정리(archive 링크/상호참조 정비)

## Archived Versions
- [2026-02-17 pre-refactor snapshot](./archive/2026-02-17_pre-refactor/DESIGN_GUIDE_MVP_v1.0.md)

## 1) 디자인 원칙
- 30초 룰: 어떤 화면에서도 30초 안에 `현재 상태`, `다음 행동`, `정확한 종료 시각`을 이해해야 한다.
- 3초 스캔: 헤더/상태바만 봐도 3초 안에 `상태 배지`, `남은 시간`, `종료 시각`이 읽혀야 한다.
- 사용자 단순성: 복잡한 정책(단일 활성, quit guard, final grace)은 UI 뒤에서 처리하고 사용자는 명확한 액션만 본다.
- 안전 우선: `Arm 확인 모달`, `Cancel/Snooze 상시 경로`, `Final Grace 60초(설정 15~300초)`는 항상 유지한다.

## 2) 용어/내비 표준
| 내부 라우트 | 사용자 라벨 | 비고 |
| --- | --- | --- |
| `/dashboard` | 대시보드 | 상태/즉시 행동 |
| `/schedule/new` | 새 예약 | `mode=countdown|specific-time|process-exit` |
| `/schedule/active` | 활성 예약 | 진행 타임라인/즉시 제어 |
| `/history` | 이력 | 검색/필터/정렬 + 상세 |
| `/settings/general` | 일반 설정 | 시뮬레이션/저장정책/단축키 |
| `/settings/notifications` | 알림 설정 | 사전 알림/최종 경고/권한 배너 |
| `/settings/integrations/google` | Google 연동 | 옵션, 모의 연결 상태 |
| `/help` | 도움말 | 안전 고지/FAQ/외부 링크 |

정책:
- 문서/UX 카피는 `예약`을 사용한다.
- 코드 라우트는 `/schedule/*`를 유지한다.

## 3) 글로벌 레이아웃 규칙
- Shell: `Sidebar + TopStatusBar + MainCanvas + RightPanel(>=1440) + QuickActionFooter`
- TopStatusBar: `상태 배지 + 남은 시간(tabular) + 종료 시각(tabular)` 고정
- QuickActionFooter:
  - 활성 예약: `취소`, `5/10/15분 미루기`, `사용자 지정 미루기`
  - 비활성: `새 예약 만들기` 활성 + `지금 취소/10분 미루기` 비활성
- Overlay:
  - Arm 확인: `role="dialog"`
  - Final Grace: `role="alertdialog"` + 포커스 트랩 + 복귀 포커스

## 4) 화면별 상세 동기화 시트 (코드 기준)
공통 로딩:
- `snapshot` 미수신 시 Skeleton 블록 렌더 (`초기 상태 로딩`)

### 4.1 `/dashboard` (대시보드)
- 핵심 목적(30초): 현재 예약 유무와 즉시 행동(취소/미루기/새 예약)을 즉시 판단
- 1차 정보(3초): `현재 상태`, `남은 시간`, `종료 시각`, `다음 행동`
- 주요 컴포넌트/레이아웃: 상태 액션 카드, `지금 할 일` 섹션, `최근 이벤트` 리스트, 우측 가이드 패널
- Empty/Error/Loading:
  - Empty: `예약이 없어요`, `새 예약 만들기`
  - Error: 상단 danger 배너(`statusError`, `actionError`, 복구 배너)
  - Loading: Skeleton
- 인터랙션 규칙:
  - 버튼 최소 44px 타겟
  - `세부 보기`는 활성 예약에서만 의미 있음
  - 키보드로 이벤트 행 선택 가능
- 마이크로카피 표준:
  - 섹션: `지금 할 일`, `최근 이벤트`
  - 상태 행동: `지금 취소`, `10분 미루기`, `새 예약 만들기`

### 4.2 `/schedule/new` (새 예약)
- 핵심 목적(30초): 모드 선택 후 검증된 입력으로 안전하게 Arm 준비
- 1차 정보(3초): 선택 모드, 예상 종료(절대+상대), 검증 실패 이유
- 주요 컴포넌트/레이아웃: 모드 세그먼트, 입력 폼, 프로세스 테이블(최대 120), 미리보기 카드
- Empty/Error/Loading:
  - Process 모드 empty: `검색 결과가 없습니다`
  - Process 조회 오류: `프로세스 목록을 불러오지 못했습니다.`
  - 입력 오류: 인라인 위험 배너(분/시각/selector/shell 가드)
- 인터랙션 규칙:
  - `예약 준비`는 오류 시 disabled
  - `processExit`에서 shell 계열은 `실행 파일 경로` 또는 `명령어 토큰` 없으면 차단
  - `Ctrl/Cmd+N` 진입 지원
- 마이크로카피 표준:
  - 페이지 설명: `모드 선택 → 값 입력 → 확인 모달 순서`
  - 경고: `프로세스 감시는 종료 감지 후 최종 경고로 바로 진입합니다.`

### 4.3 `/schedule/active` (활성 예약)
- 핵심 목적(30초): 즉시 취소/미루기 + 진행 단계 확인
- 1차 정보(3초): 상태 배지, 남은 시간, 종료 시각, 즉시 행동 버튼군
- 주요 컴포넌트/레이아웃: 상태 카드, `지금 할 수 있는 것`, `진행 타임라인`
- Empty/Error/Loading:
  - Empty: `현재 활성 예약이 없습니다.`
  - Error: action error 배너
  - Loading: 글로벌 skeleton
- 인터랙션 규칙:
  - `지금 취소`는 destructive + immediate
  - 빠른 미루기(5/10/15) + 사용자 지정(1..1440)
  - Final warning 중에도 동일 액션 유지
- 마이크로카피 표준:
  - `지금 취소`, `5분 미루기`, `10분 미루기`, `15분 미루기`, `사용자 지정`

### 4.4 `/history` (이력)
- 핵심 목적(30초): 무슨 일이 있었는지/언제/어떤 채널·모드인지 빠르게 스캔
- 1차 정보(3초): 검색어, 필터 상태, 최신 이벤트 요약
- 주요 컴포넌트/레이아웃: 필터 칩, 검색/정렬 폼, 이력 테이블, 상세 드로어
- Empty/Error/Loading:
  - Empty: `조건에 맞는 이력이 없습니다.`
  - Error: 상단 danger 배너(공통)
  - Loading: 글로벌 skeleton
- 인터랙션 규칙:
  - 테이블 행은 클릭/Enter로 상세 열기
  - 상세 닫기 후 이전 포커스로 복귀
  - `더 보기 (120개)`로 페이지 확장
- 마이크로카피 표준:
  - 필터: `전체/성공/실패/정보`
  - 검색 placeholder: `이벤트/사유 텍스트 검색`

### 4.5 `/settings/general` (일반 설정)
- 핵심 목적(30초): 실제 종료/시뮬레이션 상태 확인과 저장
- 1차 정보(3초): `시뮬레이션 활성/실제 종료 활성`, 저장 위치, 이력 보관 한도
- 주요 컴포넌트/레이아웃: 안전/동작 카드, 저장/기록 카드, 단축키 카드, 저장 버튼
- Empty/Error/Loading:
  - Error: 저장 실패 시 danger 배너
  - Success: `설정을 저장했습니다.` 토스트/배너
  - Loading: 글로벌 skeleton
- 인터랙션 규칙:
  - 토글 변경 후 명시적 저장
  - disabled/hover/focus-visible 디자인 시스템 준수
- 마이크로카피 표준:
  - 토글: `시뮬레이션 모드(실제 종료 안 함)`

### 4.6 `/settings/notifications` (알림 설정)
- 핵심 목적(30초): 경고 임계값과 OS 알림 차단 상태 확인
- 1차 정보(3초): 사전 알림 칩, 최종 경고 초(15~300), 차단 배너
- 주요 컴포넌트/레이아웃: 권한 배너, 기본 사전 알림 칩, range+number 입력, 미리보기 카드
- Empty/Error/Loading:
  - 권한 차단: `종료 전 경고를 놓칠 수 있어요...`
  - 저장 성공: `설정을 저장했습니다.`
  - 저장 오류: danger 배너
- 인터랙션 규칙:
  - range와 number 입력 동기화
  - `알림 설정 열기` CTA 제공
- 마이크로카피 표준:
  - 미리보기: `사전 알림 ... · 최종 경고 ... · 최종 경고에서도 취소/미루기 가능`

### 4.7 `/settings/integrations/google` (Google 연동)
- 핵심 목적(30초): 옵션 연동 상태와 복구 경로 확인
- 1차 정보(3초): 상태 배지(`연결됨/토큰 만료/오프라인/연결 안 됨`), 가능한 액션
- 주요 컴포넌트/레이아웃: 상태 카드 + 액션 버튼(연결/해제/테스트/시뮬레이션/재시도)
- Empty/Error/Loading:
  - 오프라인/만료: 재시도 버튼 + 에러 문구
  - Loading: 글로벌 skeleton
  - Error: action error 배너
- 인터랙션 규칙:
  - `테스트 발송`은 상태 조건으로 가드
  - `토큰 만료 시뮬레이션` 제공
- 마이크로카피 표준:
  - 설명: `이메일 알림은 옵션 기능`

### 4.8 `/help` (도움말)
- 핵심 목적(30초): 안전 고지와 복구 경로를 즉시 찾기
- 1차 정보(3초): 취소/미루기 경로, FAQ 핵심 답변, 링크 접근 가능 여부
- 주요 컴포넌트/레이아웃: 안전 고지 카드, FAQ 카드, 버전/링크 카드
- Empty/Error/Loading:
  - 오프라인: `오프라인에서는 열 수 없습니다.`
  - 링크 열기 실패: action error 배너
  - Loading: 글로벌 skeleton
- 인터랙션 규칙:
  - 외부 링크 버튼은 오프라인 시 disabled
  - focus-visible 링 필수
- 마이크로카피 표준:
  - FAQ는 `Q/A` 한 줄 구조 유지

## 5) Dashboard/History 이벤트 카드 표준 (통일 규칙)
목표:
- 30초 룰을 넘기지 않도록 이벤트 중복 정보를 제거한다.
- 3초 안에 `무슨 일`, `언제`, `출처/조건`을 읽게 한다.

규칙:
1. 1행(제목행): `[상태 배지] + 한 문장 요약`만 사용한다.
2. 2행(메타행): 칩으로 분리한다. 기본 순서:
   - `[발생시각(절대)] [상대시간] [출처(UI/알림/트레이)] [모드/조건]`
3. 우측 영역은 `행동` 또는 `결과` 하나만 둔다. 시간은 한 군데에만 둔다.
4. 숫자/시간은 `tabular-nums`를 적용한다.
5. 시간 포맷은 제품 규칙(`YYYY-MM-DD HH:mm:ss`)으로 통일한다.

예시:
- 제목행: `[사용자 취소] 예약이 취소됐어요`
- 메타칩: `[2026-02-15 23:39:24] [2분 전] [출처: UI] [모드: 카운트다운]`
- 완료행: `[정상 처리] 예약이 정상 처리됐어요`

## 6) 인터랙션/접근성 규칙
- Hover/Focus/Disabled:
  - `:focus-visible` 3px ring
  - Disabled는 대비를 유지하되 클릭 불가를 명확히 표현
- 키보드:
  - `Ctrl/Cmd + N`: 새 예약
  - `Esc`: 확인 모달/상세 패널/quit guard 닫기
  - History 행: `Enter`로 상세 열기
- a11y:
  - `aria-live`: polite/assertive 분리
  - Final warning overlay: `alertdialog`, label/description, 포커스 트랩

## 7) 반응형 기준
- 토큰: `compact=480`, `standard=960`, `desktop=1200`, `wide=1440`
- 앱 최소 창 크기: `980x700`
- 정책:
  - `wide`: 우측 패널 노출
  - `<1440`: 우측 패널 숨김
  - `<960`: 사이드바 축약, footer 버튼 줄바꿈
  - compact 시뮬레이션 QA에서도 Cancel/Snooze는 스크롤 없이 노출되어야 한다.

## 8) 검증 연동
- 검증/QA/인수인계 절차: [RUNBOOK.md](./RUNBOOK.md)
- verification 산출물(JSON/Schema): [../artifacts/verification/](../artifacts/verification/)
- handoff 보고서: [../artifacts/handoff/](../artifacts/handoff/)
