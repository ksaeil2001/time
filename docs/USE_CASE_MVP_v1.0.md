# 자동 종료 예약 스케줄러 Use Case (MVP v1.0)

> STATUS: CANONICAL
> Role: 상태 전이/예외 처리/테스트 관점의 진실 원천
> Canonical Set: [PRD](./PRD_MVP_v1.0.md), [DESIGN_GUIDE](./DESIGN_GUIDE_MVP_v1.0.md), [USE_CASE](./USE_CASE_MVP_v1.0.md), [IA](./IA_MVP_v1.0.md)
> Ops Guide: [RUNBOOK.md](./RUNBOOK.md)
> Archive: [archive/](./archive/)
> Artifacts: [../artifacts/verification/](../artifacts/verification/)
> Update Rule: Follow RUNBOOK `Doc Sync`
> Last synced with implementation: 2026-02-17 (commit db40591)

## TL;DR
- 이 문서는 상태 전이, 예외 처리, 테스트 관점의 정본이다.
- UI 상태는 `대기 중/예약됨/최종 경고`, 내부 단계는 `idle -> armed -> finalWarning -> shuttingDown`을 기준으로 본다.
- Arm 확인 모달, Final Grace 개입 가능성, 단일 활성 예약은 모든 유스케이스에서 유지한다.
- 라우트/화면 구조는 IA를, UI 세부 표현은 Design Guide를 참조한다.
- 과거 버전은 archive를 참고하고 현재 운영 기준은 정본 4문서 + RUNBOOK으로 본다.

## Document Meta
- Version: MVP v1.0 (as-built canonical)
- Date: 2026-02-17
- Change Summary: 문서 정본 체계 정리(archive 링크/상호참조 정비)

## Archived Versions
- [2026-02-17 pre-refactor snapshot](./archive/2026-02-17_pre-refactor/USE_CASE_MVP_v1.0.md)

## 1) 액터 정의
| 액터 | 역할 |
| --- | --- |
| 사용자 | 예약 생성/확인/취소/미루기/설정 |
| 앱(UI + 스케줄러) | 검증, 상태 전이, 경고, 종료 실행 |
| OS | 프로세스 목록/알림/종료 명령/트레이 제공 |

## 2) 상태 모델
| 계층 | 상태 |
| --- | --- |
| UI 상태 | `대기 중(예약 없음)`, `예약됨`, `최종 경고` |
| 저장 상태 | `active=null`, `active.status=armed|finalWarning`, `history[]` |
| 내부 상태 | `idle -> armed -> finalWarning -> shuttingDown` |

핵심 규칙:
- Arm 전 확인 모달 필수
- Final Grace 동안 취소/미루기 가능
- 단일 활성 예약 유지

## 3) 화면별 운영 시나리오 (코드 기준)
### 3.1 대시보드 (`/dashboard`)
- 핵심 목적: 현재 상태와 즉시 행동 파악
- 1차 정보: 상태 배지/남은 시간/종료 시각/다음 행동
- 레이아웃: 상태 카드 + 지금 할 일 + 최근 이벤트
- Empty/Error/Loading:
  - Empty: `예약이 없어요`
  - Error: 상단 danger 배너
  - Loading: Skeleton
- 인터랙션: 이벤트 선택 -> 상세, `전체 보기` -> 이력
- 마이크로카피: `상태와 다음 동작을 먼저 확인하세요.`

### 3.2 새 예약 (`/schedule/new`)
- 핵심 목적: 안전한 입력 검증 후 Arm 준비
- 1차 정보: 모드/예상 종료/검증 상태
- 레이아웃: 모드 세그먼트 + 입력 폼 + 미리보기 카드
- Empty/Error/Loading:
  - process empty: `검색 결과가 없습니다`
  - process error: `프로세스 목록을 불러오지 못했습니다.`
  - validation: 인라인 위험 배너
- 인터랙션:
  - `예약 준비` -> 확인 모달
  - process shell guard 위반 시 Arm 차단
- 마이크로카피: `모드 선택 → 값 입력 → 확인 모달`

### 3.3 활성 예약 (`/schedule/active`)
- 핵심 목적: 취소/미루기와 진행 단계 추적
- 1차 정보: 상태/남은 시간/종료 시각/즉시 액션
- 레이아웃: 상태 카드 + 액션 카드 + 타임라인
- Empty/Error/Loading:
  - Empty: `현재 활성 예약이 없습니다.`
  - Error: action error 배너
  - Loading: Skeleton
- 인터랙션: `지금 취소`, `5/10/15분 미루기`, 사용자 지정 미루기
- 마이크로카피: `지금 할 수 있는 것`

### 3.4 이력 (`/history`)
- 핵심 목적: 사건의 요약/시점/출처를 빠르게 파악
- 1차 정보: 필터/검색/정렬 + 최신 이벤트
- 레이아웃: 툴바 + 테이블 + 상세 드로어
- Empty/Error/Loading:
  - Empty: `조건에 맞는 이력이 없습니다.`
  - Error: 공통 danger 배너
  - Loading: Skeleton
- 인터랙션: 행 클릭/Enter 상세, `더 보기 (120개)`
- 마이크로카피: `정렬/필터/검색과 행 클릭 상세로 빠르게 스캔`

### 3.5 일반 설정 (`/settings/general`)
- 핵심 목적: 시뮬레이션/실종료 정책 확인
- 1차 정보: 상태 배지, 저장 정책, 단축키
- 레이아웃: 안전/동작 + 저장/기록 + 단축키 + 저장 버튼
- Empty/Error/Loading:
  - Save success: `설정을 저장했습니다.`
  - Save error: danger 배너
  - Loading: Skeleton
- 인터랙션: 토글 -> 저장
- 마이크로카피: `시뮬레이션 모드(실제 종료 안 함)`

### 3.6 알림 설정 (`/settings/notifications`)
- 핵심 목적: 알림 임계값과 차단 상태 확인
- 1차 정보: 사전 알림 칩, 최종 경고 초, 차단 배너
- 레이아웃: 배너 + 칩 + range/number + 미리보기
- Empty/Error/Loading:
  - blocked: `종료 전 경고를 놓칠 수 있어요...`
  - save success: `설정을 저장했습니다.`
  - Loading: Skeleton
- 인터랙션: `알림 설정 열기`로 OS 설정 진입
- 마이크로카피: `최종 경고에서도 취소/미루기 가능`

### 3.7 Google 연동 (`/settings/integrations/google`)
- 핵심 목적: 모의 연동 상태와 복구 경로 노출
- 1차 정보: 상태 배지, 가능한 액션
- 레이아웃: 상태 카드 + 버튼 그룹
- Empty/Error/Loading:
  - 만료/오프라인 상태 가드 문구
  - action error 배너
  - Loading: Skeleton
- 인터랙션: 연결/해제/테스트/재시도
- 마이크로카피: `옵션 기능`, `재시도`

### 3.8 도움말 (`/help`)
- 핵심 목적: 안전 경로와 FAQ 확인
- 1차 정보: 취소/미루기 경로, FAQ, 링크 상태
- 레이아웃: 안전 고지 + FAQ + 링크 카드
- Empty/Error/Loading:
  - offline: `오프라인에서는 열 수 없습니다.`
  - link error: danger 배너
  - Loading: Skeleton
- 인터랙션: 오프라인 시 링크 disabled
- 마이크로카피: `안전 고지`, `FAQ / 문제 해결`

## 4) 주요 유스케이스
### UC-01: 예약 생성과 Arm 확인
1. 사용자: `/schedule/new`에서 모드/값 입력
2. 시스템: 유효성 검증, 미리보기 표시
3. 사용자: `예약 준비` 클릭
4. 시스템: Arm 확인 모달 표시(`예약을 활성화할까요?`)
5. 사용자: `예약 활성화` 클릭
6. 시스템: 단일 활성 정책으로 Arm 처리, `/schedule/active` 이동

### UC-02: 취소/미루기
1. 사용자: 하단 Footer 또는 활성 예약 화면에서 액션 선택
2. 시스템:
   - 취소: `active=null`, `cancelled` 기록
   - 미루기: 1..1440 범위 재계산
3. process-exit:
   - 감시 유지, `snoozeUntilMs`로 final warning 진입 지연

### UC-03: Final Grace
1. 시스템: `finalWarning` 진입 시 오버레이 표시
2. 사용자: `예약 취소` 또는 `{n}분 미루기` 실행 가능
3. 시스템: 유예 만료 시 종료 실행 단계로 이동

### UC-04: Quit Guard
1. 사용자: 트레이/앱 종료 요청
2. 시스템: 상태가 armed/finalWarning면 종료 보류
3. 시스템: 선택 모달 표시(취소 후 종료/트레이 유지/돌아가기)
4. 사용자 선택에 따라 종료 또는 유지

### UC-05: 알림 차단 폴백
1. 시스템: Notification 권한 denied/unsupported 확인
2. UI: `/settings/notifications`에서 위험 배너 노출
3. 복구: `알림 설정 열기` CTA 및 앱/트레이 경로 안내

## 5) 이벤트 카드/이력 표준
규칙:
1. 제목행: `[상태 배지] + 한 문장 요약`
2. 메타칩: `[절대시각] [상대시간] [출처] [모드/조건]`
3. 우측은 결과 또는 행동 하나만 노출
4. 시간 표기는 단일 위치 + tabular 숫자

예시:
- `[사용자 취소] 예약이 취소됐어요`
- `[2026-02-15 23:39:24] [2분 전] [출처: UI] [모드: 카운트다운]`
- `[정상 처리] 예약이 정상 처리됐어요`

## 6) 예외/복구 시나리오
| 예외 | 사용자 노출 문구 | 복구 경로 |
| --- | --- | --- |
| 알림 권한 거부 | `종료 전 경고를 놓칠 수 있어요. 시스템 알림 설정을 확인해 주세요.` | `알림 설정 열기` 버튼 |
| 프로세스 selector 손상 | `프로세스 감시 설정이 유효하지 않아 예약이 안전 중단되었습니다.` | process 모드에서 대상 재선택 |
| 상태 파일 손상 | `상태 파일 손상이 감지되어 복구 절차가 실행되었습니다.` | 대시보드/이력 확인 |
| 절전 복귀 | 상태 재동기화 문구/최신 상태 반영 | 재예약 또는 유지 |
| 타임존 변경 | specific-time 재정렬 이벤트 기록 | 이력 확인 후 필요 시 재설정 |

## 7) 테스트 포인트
1. Arm 확인 모달 없이 활성화 불가
2. Final Grace에서 취소/미루기 가능
3. Dashboard/History 이벤트 스캔 중복 없음
4. 알림 차단 시 배너/폴백 안내 확인
5. Quit Guard 3가지 선택지 동작
6. 단일 활성 정책 유지

## 8) 연계
- 제품 기준: [PRD_MVP_v1.0.md](./PRD_MVP_v1.0.md)
- 레이아웃/카피 기준: [DESIGN_GUIDE_MVP_v1.0.md](./DESIGN_GUIDE_MVP_v1.0.md)
- 라우팅 기준: [IA_MVP_v1.0.md](./IA_MVP_v1.0.md)
