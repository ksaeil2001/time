# 자동 종료 스케줄러 Use-Case 문서 (MVP v1.0)

> Last synced with implementation: 2026-02-16 (commit N/A - git metadata unavailable)

## As-built Alignment
- last_synced: 2026-02-16 (commit N/A - git metadata unavailable)
- key changes (변경 이유/영향):
  - 라우팅은 hash 기반 단일 앱 쉘이며 `/schedule/new?mode=countdown|specific-time|process-exit` 쿼리로 모드를 전환한다.
    영향: UC 라우트/모드 표기는 hash + kebab-case를 기준으로 유지한다.
  - Tray Quick Start는 즉시 Arm하지 않고 프런트엔드 확인 모달(`confirm_before_arm`)을 연 뒤 사용자 확정 시 Arm한다.
    영향: 모든 진입점에서 명시적 Arm 확인 단계가 필수다.
  - 사용자 노출 상태 라벨은 `대기 중(예약 없음)` / `예약됨` / `최종 경고`로 렌더된다.
    영향: Use-Case의 상태 표기/검증 문구를 코드 라벨과 동일하게 맞춘다.
  - QuickActionFooter는 온보딩 외 전 라우트에서 노출되며 Idle에서는 비활성 `미루기(분)` 입력과 비활성 `지금 취소/10분 미루기`를 함께 표시한다.
    영향: Idle 상태도 액션 경로는 보이되 실행은 차단된다.
  - 활성 예약 상태의 QuickActionFooter는 `취소 → 10분 미루기 → 5/15분 미루기 → 미루기(분) 입력` 순서로 동작한다.
    영향: 키보드로 2동작 이내 취소/10분 미루기 접근 기준을 안정적으로 만족한다.
  - Tray 메뉴 항목은 고정 순서(`Quick Start Last Mode` → `Show Countdown` → `Open Window` → `Cancel Schedule` → `Snooze 10m` → `Quit App`)이며 상태별 비활성 처리가 없다.
    영향: Idle `Cancel Schedule`은 no-op, `Snooze 10m`은 요청이 무시된다.
  - 알림은 정보형 데스크톱 알림으로 발송되며 Cancel/Snooze 액션은 앱 하단 바, 최종 경고 오버레이, 트레이 메뉴 경로로 제공된다.
    영향: 알림 클릭 기반 액션 시나리오는 Use-Case에서 제외한다.
  - process-exit 목록은 백엔드 정렬(name→pid), UI 최대 120개, 새로고침 중심이며 검색 입력은 제공되지 않는다.
    영향: UC-04 프로세스 선택 단계는 검색 대신 새로고침/선택 플로우를 따른다.
  - shell 계열 프로세스는 `실행 파일 경로` 또는 `명령줄 토큰` 미입력 시 Arm이 차단된다(UI/백엔드 공통).
    영향: Arm 실패 예외 케이스를 정책 위반이 아닌 정상 가드로 분류한다.
  - process-exit selector가 손상되면 `NO_FAIL_OPEN_PROCESS_EXIT` 정책으로 즉시 안전 중단하고 `failed` 이력을 남긴다.
    영향: fail-open 없이 스케줄이 해제된다.
- P0 Policy(목표):
  - `QuitBehaviorWhenArmed = BLOCK_AND_CHOOSE`를 적용한다. (`예약 취소 후 종료` / `백그라운드 유지` / `돌아가기`)
  - Final Grace는 기본 60초, 설정 범위 `15..300초`를 사용한다.
  - 사전 알림 10m/5m/1m은 시간 기반 모드 전용이며 `process-exit`는 완료 감지 후 즉시 Final Warning으로 진입한다.
  - 프로세스 식별 정보는 최소 수집 정책을 적용한다(`cmdlineContains` 원문 저장/로그 금지).
- As-built note(현재 구현):
  - Tray/App Quit은 `armed`/`finalWarning`에서 `quit_guard_requested` 모달을 열고 선택 결과를 적용한다(정책과 일치).
  - `process-exit` 사전 알림 정책(사전 알림 없음 + Final Warning 직행)은 현재 구현과 일치한다.
  - 상태 파일에는 `active.processSelector` 및 `lastScheduleRequest.processSelector`의 `executable`, `cmdlineContains`가 원문으로 저장될 수 있다(정책과 불일치).

문서 정본: `docs/PRD_MVP_v1.0.md`, `docs/DESIGN_GUIDE_MVP_v1.0.md`, `docs/USE_CASE_MVP_v1.0.md`, `docs/IA_MVP_v1.0.md`

## Table of Contents
- Actor Definitions
- Use Case Scenarios
- Main Steps
- Exception Handling
- Comprehensive Actor Definitions
- Detailed Use Case Scenarios
- Main Steps and Flow of Events
- Alternative Flows and Edge Cases
- Preconditions and Postconditions
- Business Rules and Constraints
- Exception Handling Procedures
- User Interface Considerations
- Data Requirements and Data Flow
- Security and Privacy Considerations
- 테스트 케이스 및 시나리오
- Assumptions
- Open Questions

## Actor Definitions
| 액터 | 유형 | 핵심 책임 |
| --- | --- | --- |
| Primary User (Desktop user) | 주 액터 | 스케줄 생성, 확인, 취소, 미루기, 모니터링 |
| Operating System (Windows/macOS) | 외부 시스템 | 알림 권한/프로세스 정보/종료 API 제공, 실제 종료 실행 |
| Notification System | 외부 시스템 | 사전 알림(정보형) 표시 및 상태 고지(액션은 앱/트레이 경로에서 처리) |
| Process Monitor | 내부 서브시스템(OS API 사용) | 프로세스/자식 트리 감시, 종료 완료 판정 |
| Google Integration (Mock, 옵션) | 내부 UI 상태 | 연결/해제 상태 표시(localStorage) |

## Use Case Scenarios
| UC ID | 시나리오 | 우선순위 | 결과 |
| --- | --- | --- | --- |
| UC-01 | 첫 실행/안전 고지 및 권한 고지 | MVP | 사용자에게 위험/취소 경로/권한 범위 명확화 |
| UC-02 | 시간 기반 스케줄(카운트다운) 생성 | MVP | 확인 후 ARMED 상태 진입 |
| UC-03 | 시간 기반 스케줄(특정 시각) 생성 | MVP | 목표 시각 기준 ARMED 상태 진입 |
| UC-04 | 조건 기반 스케줄(프로세스 감시) 생성 | MVP | 프로세스/센티널 종료 안정 구간 후 최종 경고 진입 및 종료 |
| UC-05 | 활성 스케줄 관리 | MVP | 조회/취소/미루기/교체 일관 처리 |
| UC-06 | 종료 전 알림 상호작용 | MVP | 시간 기반 10m/5m/1m + 최종 경고(기본 60초, 15~300초) 처리 |
| UC-07 | Google 연동 화면(모의) 상태 토글 | Optional | 연결/해제 UI 상태 일관 유지 |
| UC-08 | 종료 실행 | MVP 핵심 | 최종 경고 후 OS 종료 수행 |
| UC-09 | 종료 실패 복구 | MVP 안정성 | 실패 사유 안내 및 수동 재설정 경로 제공 |

## Main Steps
1. User: 스케줄 모드를 선택하고 입력값을 설정한다.
2. System: 입력값 유효성을 검증하고 확인 모달을 표시한다.
3. User: `예약 시작(Arm) 확인` 모달에서 명시적으로 확인한다.
4. System: 단일 활성 스케줄 정책을 적용해 ARMED 상태로 전환한다.
5. System: 시간 기반 모드에서 임계 알림(10m/5m/1m)을 정보형으로 운영하고, 모든 모드에서 최종 경고(기본 60초, 설정 15~300초)를 운영한다.
6. User: 필요 시 Cancel/Snooze/Replace를 수행한다.
7. System: 종료 조건 충족 시 OS 종료를 실행한다.
8. System: 결과를 로컬 로그에 기록하고 상태를 COMPLETED 또는 FAILED로 종료한다.

## Exception Handling
1. 권한/환경 오류가 발생하면 스케줄을 즉시 강행하지 않고 사용자에게 복구 경로를 제시한다.
2. 상태 파일 손상 감지 시 `.bak` 복구를 우선 시도하고, 실패하면 안전 모드 초기화 배너를 노출한다.
3. 알림이 차단되면 앱 내 경고 배너와 트레이 경고를 폴백으로 사용한다.
4. 종료 명령 실패 시 FAILED 상태로 전환하고 수동 재예약 경로를 안내한다.
5. 재시작 후 미완료 스케줄이 감지되면 `resume_not_supported` 안내 배너/히스토리 이벤트를 노출한다.

## Comprehensive Actor Definitions
### 1) Primary User (Desktop user)
- 목표: 장시간 작업 후 자동 종료로 전력/시간 낭비 최소화
- 권한: 스케줄 생성/수정/취소, Google 연동(모의) 상태 토글
- 주의: 종료는 파괴적 동작이므로 항상 명시적 확인 필요

### 2) Operating System (Windows/macOS)
- 역할: 프로세스 조회 API, 알림 채널, 종료 API, 권한 모델 제공
- 제약: OS 정책, 기업 보안 정책, 관리자 권한 여부에 따라 종료 실패 가능
- 보안 포인트: 앱은 최소 권한 원칙으로 OS 기능을 호출

### 3) Notification System
- 역할: 10m/5m/1m 및 최종 경고 진입 정보를 데스크톱 알림(정보형)으로 고지
- 제약: 현재 구현은 데스크톱 알림 액션 버튼(Cancel/Snooze)을 제공하지 않음
- 폴백/실행 경로: 앱 하단 고정 바 + 최종 경고 오버레이 + 트레이 메뉴 액션

### 4) Process Monitor
- 역할: 선택 PID + 자식 프로세스 트리 감시, 고급 식별(`executable`, `cmdlineContains`) 보조 매칭
- 완료 판정: `PID/트리 -> 추적 PID -> 고급 매칭 -> name fallback` 순서로 실행 여부 판정 후 안정 구간(기본 10초) 통과 시 완료
- 제약: 권한 부족 시 일부 프로세스 정보 접근 불가

### 5) Google Integration (Mock, 옵션)
- 역할: 설정 화면에서 연결/해제 상태를 표시하고 로컬 저장소에 반영
- 범위: UI 상태 토글(`connected`/`disconnected`)만 제공
- 제약: 실제 OAuth, 토큰 저장, 이메일 송신은 구현 범위 밖

## Detailed Use Case Scenarios
### UC-01: First Run / Safety Notice & Permissions Disclosure
- 목적: 종료 기능의 영향, 취소 방법, 권한 범위를 사용자에게 명확히 전달한다.
- 액터: Primary User, Operating System, Notification System
- 사전조건: 앱 최초 실행 상태
- 트리거: User가 앱을 처음 실행함
- 본 흐름:
1. User: 온보딩 시작 화면에서 "계속"을 선택한다.
2. System: 앱의 종료 동작, 트리거 시점, 취소 경로(UI/트레이/알림)를 설명한다.
3. User: 안전 고지를 확인하고 동의한다.
4. System: 알림 권한, 프로세스 감시 접근, 종료 권한의 필요성을 OS별로 안내한다.
5. User: 권한 요청을 진행하거나 건너뛴다.
6. System: 현재 권한 상태와 기능 제한 범위를 표시하고 대시보드로 이동한다.
- 대안 흐름:
1. User: 권한 요청을 "나중에" 선택한다.
2. System: 제한 모드(예: 알림 액션 불가)를 명확히 표시한 채 사용을 허용한다.
- 예외 처리:
| Exception condition | System action | User message |
| --- | --- | --- |
| 알림 권한 거부 | 알림 기능 비활성화 플래그 저장, 앱 배너/트레이 폴백 활성화 | "시스템 알림이 꺼져 있어요. 종료 전 경고를 놓칠 수 있습니다." |
| 권한 설정 페이지 열기 실패 | OS 버전별 수동 경로 안내 | "설정 페이지를 자동으로 열지 못했습니다. 수동 경로를 따라 권한을 허용해 주세요." |
| 종료 권한 제한 | 종료 API 사전 점검 실패 기록 | "현재 권한으로는 종료 실행이 제한될 수 있습니다." |
- 사후조건: 온보딩 완료 플래그 저장, 권한 상태 캐시 업데이트
- Verification: 권한 거부 상태에서도 어떤 기능이 제한되는지 UI에 즉시 반영되는지 확인

### UC-02: Create Time-Based Shutdown Schedule (Countdown)
- 목적: 카운트다운 기반 자동 종료를 설정한다.
- 액터: Primary User, Operating System, Notification System
- 사전조건: 활성 스케줄 없음(`active = null`), 온보딩 완료
- 트리거: User가 카운트다운 모드를 선택함
- 본 흐름:
1. User: 프리셋(+30m/+1h/+2h) 또는 커스텀 시간을 입력한다.
2. System: 1분 이상 값인지 검증하고 예상 종료 시각을 계산한다.
3. User: 확인 모달에서 "예약 시작(Arm)"을 선택한다.
4. System: `ActiveSchedulePolicy = SINGLE_ACTIVE_ONLY`를 검증한다.
5. System: 상태를 `ARMED`로 전환하고 남은 시간을 실시간 표시한다.
6. System: 임계 시점 알림(10m/5m/1m)을 예약한다.
- 대안 흐름:
1. User: 확인 모달에서 취소한다.
2. System: 스케줄을 생성하지 않고 IDLE 상태를 유지한다.
- 예외 처리:
| Exception condition | System action | User message |
| --- | --- | --- |
| 0분/음수 입력 | 입력 거부, 확인 버튼 비활성화 | "카운트다운은 최소 1분 이상이어야 합니다." |
| 이미 활성 예약 존재 | 교체 안내 문구 표시 | "주의: 현재 활성 예약은 새 예약으로 교체됩니다." |
| 절전/복귀로 시간 점프 | 복귀 시 남은 시간 재계산 및 상태 동기화 | "시스템 복귀를 감지해 남은 시간을 재계산했습니다." |
- 사후조건: 단일 활성 카운트다운 스케줄 저장
- Verification: 확인 모달을 거치지 않고 ARMED 상태가 되지 않음을 검증

### UC-03: Create Time-Based Shutdown Schedule (Specific Clock Time)
- 목적: 특정 시각 기준으로 자동 종료를 설정한다.
- 액터: Primary User, Operating System
- 사전조건: 활성 스케줄 없음(`active = null`)
- 트리거: User가 특정 시각 모드를 선택함
- 본 흐름:
1. User: 목표 시각(필요 시 날짜 포함)을 선택한다.
2. System: 로컬 시간대 기준으로 목표 타임스탬프를 계산한다.
3. System: 현재 시각보다 과거인지 검사한다.
4. User: 과거 시각인 경우 "다음날로 설정" 또는 날짜 재선택을 결정한다.
5. User: 확인 모달에서 활성화를 승인한다.
6. System: ARMED 전환 후 남은 시간과 목표 시각을 함께 표시한다.
- 대안 흐름:
1. User: 과거 시각 감지 시 날짜를 직접 수정한다.
2. System: 수정된 목표 시각으로 재검증 후 진행한다.
- 예외 처리:
| Exception condition | System action | User message |
| --- | --- | --- |
| 목표 시각이 이미 경과 | 다음날 자동 제안 버튼 표시 | "선택한 시각이 이미 지났습니다. 다음날 같은 시각으로 설정할 수 있습니다." |
| DST/타임존 변경 감지 | 목표 타임스탬프 재계산, 변경점 로그 기록 | "시간대 변경을 감지해 스케줄 시각을 보정했습니다." |
| 수동 시계 변경 | 시계 변경 이벤트 수신 후 경고 배너 표시 | "시스템 시간이 변경되어 스케줄 정확도에 영향이 있을 수 있습니다." |
- 사후조건: 특정 시각 기반 활성 스케줄 저장
- Verification: 로컬 시간대 기준 계산이 변경 이벤트 이후에도 일관되는지 확인

### UC-04: Create Condition-Based Shutdown Schedule (Watch a Process/App)
- 목적: 선택한 작업 프로세스 완료 시 자동 종료를 수행한다.
- 액터: Primary User, Process Monitor, Operating System
- 사전조건: 프로세스 목록 접근 가능, 활성 스케줄 없음(`active = null`)
- 트리거: User가 프로세스 감시 모드를 선택함
- 본 흐름:
1. User: 센티널 템플릿(폴더/네트워크, OS별)과 실행 가이드를 확인한다.
2. User: 필요 시 터미널에서 센티널을 먼저 실행하고 출력된 PID를 확인한다.
3. User: 현재 실행 중인 프로세스를 선택하고, 필요 시 `실행 파일 경로`/`명령줄 토큰`을 입력한다.
4. System: 선택 프로세스의 PID와 자식 트리 스냅샷을 생성한다.
5. System: `ProcessCompletionPolicy = ROOT_PLUS_CHILDREN_WITH_STABILITY_WINDOW`로 감시를 시작한다.
6. System: `PID/트리 -> 추적 PID -> 고급 매칭 -> name fallback` 순으로 실행 여부를 판정한다.
7. System: 미실행 상태가 안정 구간(기본 10초, 허용 5~600초) 이상 지속되면 사전 알림 없이 최종 경고로 즉시 전환한다.
8. System: `프로세스 종료가 감지되어 최종 경고가 시작되었습니다.` 안내를 표시한다.
9. System: 그레이스 종료 후 OS 종료 실행으로 이동한다.
- 대안 흐름:
1. User: 원하는 프로세스를 찾지 못하면 새로고침 또는 시간 기반 모드로 전환한다.
2. System: 빈 상태 가이드와 전환 CTA를 제공한다.
- 예외 처리:
| Exception condition | System action | User message |
| --- | --- | --- |
| 프로세스 목록 비어 있음 | Empty state + 새로고침 + 모드 전환 제안 | "감시 가능한 프로세스를 찾지 못했습니다." |
| 선택 직후 프로세스 종료(레이스) | 안정 구간 카운트 후 최종 경고 진입 | "선택한 프로세스가 종료 상태로 감지되면 안정 구간 후 경고를 시작합니다." |
| 프로세스 접근 권한 부족 | 목록 조회 실패 배너 노출, 시간 기반 전환 CTA 제공 | "프로세스 목록을 가져오지 못했습니다." |
| 루트 종료 후 자식 잔존 | 완료 판정 보류, 잔존 PID 목록 유지 | "연관 작업이 아직 실행 중입니다. 종료를 보류합니다." |
| shell 계열 동명이인(고급 식별값 없음) | Arm 차단 + 경고 배너 표시 | "동명이인 오탐 방지를 위해 실행 파일 경로 또는 명령줄 토큰 입력이 필요합니다." |
| process-exit selector 손상(파싱 실패/필드 누락) | `NO_FAIL_OPEN_PROCESS_EXIT` 정책으로 즉시 안전 중단 + `failed` 이력 기록 | "프로세스 종료 감시 설정이 손상되어 예약을 안전 중단했습니다. 감시 대상을 다시 선택해 주세요." |
| 고급 매칭 정보 접근 불가 | name fallback으로 강등 + degraded 이벤트 기록 | "고급 프로세스 정보를 읽지 못해 이름 기반 감시로 전환했습니다." |
- 사후조건: 프로세스 감시 스케줄 활성화 또는 사용자 취소
- Verification: 루트 PID만 종료되고 자식이 남아 있을 때 완료로 오판하지 않음을 검증

### UC-05: Manage Active Schedule
- 목적: 활성 스케줄의 상태 조회 및 제어(Cancel/Snooze/Replace)를 제공한다.
- 액터: Primary User, Notification System, Operating System
- 사전조건: 활성 스케줄 존재(`status = armed | finalWarning`)
- 트리거: User가 활성 스케줄 화면, 트레이 메뉴, 최종 경고 오버레이에서 제어를 수행함
- 본 흐름:
1. User: 활성 스케줄 화면 또는 트레이에서 현재 상태를 조회한다.
2. System: 남은 시간, 모드, 감시 상태를 표시한다.
3. User: Cancel을 선택하면 즉시 취소를 요청한다.
4. System: 활성 스케줄을 해제하고 `cancelled` 이벤트를 기록한다.
5. User: Snooze를 선택하면 분 단위(1~1440) 값을 입력한다.
6. System: 입력 분 기준으로 목표 시각을 재계산하고 ARMED를 유지한다.
7. System(process-exit): Snooze 시 모드/selector/감시는 유지하고 `snoozeUntilMs`를 설정해 final warning 진입만 지연한다.
8. System(process-exit): final warning 중 대상 프로세스가 다시 실행되면 ARMED로 롤백하고 종료를 보류한다.
9. User: 새 스케줄을 만들면 Replace 확인을 수행한다.
10. System: 새 스케줄 유효성 검증을 먼저 수행한다.
11. System: 검증 성공 시 기존 스케줄 `cancelled(reason=replace)`를 기록한다.
12. System: 새 스케줄을 Arm한다.
13. System: Arm 실패 시 기존 스케줄을 복원하고 `replace_rolled_back` 이벤트를 기록한다.
- 대안 흐름:
1. User: 완전 종료(Quit)를 시도한다.
2. System(Policy): `Armed` 상태에서는 즉시 종료하지 않고 선택 모달을 연다.
3. User: `예약 취소 후 종료` 또는 `백그라운드 유지`를 선택한다.
4. System: 사용자 선택에 따라 종료/유지를 수행한다.
5. System(As-built note): 현재 구현은 선택 모달 결과에 따라 종료/유지를 처리한다.
- 예외 처리:
| Exception condition | System action | User message |
| --- | --- | --- |
| 미루기 분 입력 범위 초과 | 입력 거부(1..1440) | "미루기 시간은 1분에서 1440분 사이로 입력해 주세요." |
| UI와 트레이 상태 불일치 | 상태 동기화 루틴 실행, 최신 상태 재렌더 | "상태를 동기화했습니다. 최신 정보를 확인해 주세요." |
| Replace 중 새 스케줄 유효성 실패 | 교체 시작 전 중단, 기존 스케줄 유지 | "새 스케줄이 유효하지 않아 기존 스케줄을 유지합니다." |
| Replace 중 Arm 실패 | 기존 스케줄 복원 + `replace_rolled_back` 기록 | "새 예약 활성화에 실패해 기존 예약으로 복원했습니다." |
- 사후조건: 단일 활성 스케줄 정책 유지
- Verification: UI/트레이/최종 경고 오버레이 어느 진입점에서도 단일 활성 정책이 동일하게 적용되는지 확인

### UC-06: Pre-Shutdown Notification Interaction
- 목적: 종료 직전 사용자 개입 기회를 제공하고 안전하게 종료를 진행한다.
- 액터: Primary User, Notification System, Operating System
- 사전조건: ARMED 상태, 임계시점 도달
- 트리거: 시간 기반은 남은 시간이 알림 임계값(10m/5m/1m)에 도달함, process-exit는 완료 감지 시점에 즉시 최종 경고 진입
- 본 흐름:
1. System(시간 기반): 10분 전, 5분 전, 1분 전 정보를 데스크톱 알림으로 발송한다.
2. System(process-exit): 완료 감지 시 사전 알림 없이 최종 경고 오버레이를 즉시 표시한다.
3. User: 화면 하단 고정 바, 활성 스케줄 화면, 트레이 메뉴에서 Cancel/Snooze를 선택할 수 있다.
4. System: 액션 입력이 없으면 종료 절차를 유지한다.
5. System: 최종 경고 시작 시점(`finalWarningSec`)부터 카운트다운을 표시한다.
6. User: 최종 경고 오버레이에서 즉시 취소 또는 미루기를 선택할 수 있다.
7. System: 그레이스 만료 시 `shuttingDown` 내부 상태로 전환 후 종료 명령을 실행한다.
- 대안 흐름:
1. User: 최종 경고 오버레이에서 Snooze(기본 입력값 10분)를 선택한다.
2. System: 임계 알림/종료 시점을 재계산하고 ARMED 상태를 유지한다.
- 예외 처리:
| Exception condition | System action | User message |
| --- | --- | --- |
| OS 알림 차단 | 앱 내 고정 배너 + 트레이 강조 상태로 폴백 | "시스템 알림이 꺼져 있어 사전 알림을 받지 못할 수 있습니다." |
| 알림 액션 버튼 미지원(현행 기본) | 앱 내 액션 바/오버레이/트레이 경로 사용 | "알림은 정보만 표시됩니다. 취소/미루기는 앱 또는 트레이에서 선택해 주세요." |
| 전체화면 앱으로 알림 가시성 저하 | 트레이 아이콘 배지/깜빡임 강화 | "전체화면 사용 중이라 알림 노출이 제한될 수 있습니다." |
- 사후조건: Cancel/Snooze/Shutdown 중 하나가 확정
- Verification: 알림 차단 상태에서도 앱 배너와 트레이 경고가 동작하는지 확인

### UC-07: Toggle Google Integration (Mock)
- 목적: `Google 계정 연결(테스트)` 화면에서 모의 연결 상태를 연결/해제한다.
- 액터: Primary User
- 사전조건: User가 설정 > Google 계정 연결(테스트) 화면에 접근 가능
- 트리거: User가 `연결하기`/`연결 해제` 버튼을 선택함
- 본 흐름:
1. User: `연결하기`를 선택한다.
2. System: `localStorage(autosd.google.connected.v1)=true`로 저장하고 상태를 `연결됨`으로 표시한다.
3. User: `연결 해제`를 선택한다.
4. System: 로컬 상태를 `false`로 갱신하고 `연결 안 됨`으로 표시한다.
- 대안 흐름:
1. User: 앱을 재시작한다.
2. System: 마지막 로컬 상태를 복원해 동일하게 표시한다.
- 예외 처리:
| Exception condition | System action | User message |
| --- | --- | --- |
| 로컬 저장소 접근 실패 | 상태 저장 실패를 알리고 UI 토글을 이전값으로 되돌림 | "Google 연동 상태를 저장하지 못했습니다." |
| 설정 화면 미접근(온보딩 중) | 설정 화면 진입 경로 안내 | "온보딩을 완료한 뒤 설정에서 변경할 수 있습니다." |
- 사후조건: Google 연동(모의) 상태가 `연결됨` 또는 `연결 안 됨`으로 확정
- Verification: 앱 재시작 후에도 마지막 토글 상태가 유지되는지 검증

### UC-08: Execute Shutdown
- 목적: 최종 경고 유예 시간이 만료되면 OS 종료 명령을 실행한다.
- 액터: Operating System
- 사전조건: 종료 조건 충족, final warning 잔여 시간 0초 도달
- 트리거: 스케줄러 tick에서 final warning 만료가 감지됨
- 본 흐름:
1. System: final warning 만료 직후 내부 상태를 `shuttingDown`으로 전환한다.
2. System: 시뮬레이션 모드(`simulateOnly=true`) 여부를 확인한다.
3. System: 시뮬레이션 모드면 실제 종료 없이 성공 이벤트/이력을 기록한다.
4. System: 일반 모드면 OS별 종료 명령을 호출한다(Windows/macOS).
5. System: 성공 시 `completed` 이력으로 기록하고 활성 스케줄을 해제한다.
- 대안 흐름:
1. User: final warning 중 취소 또는 미루기를 선택한다.
2. System: 종료 실행으로 진입하지 않고 `armed` 또는 비활성 상태로 유지/복귀한다.
- 예외 처리:
| Exception condition | System action | User message |
| --- | --- | --- |
| OS 종료 명령 실패 | 실패 이벤트/이력 기록 후 활성 스케줄 해제 | "자동 종료에 실패했습니다. 오류 내역을 확인해 주세요." |
| 종료 진행 중 취소/미루기 요청 | 요청 거부(`Shutdown is already in progress.`) | "종료가 이미 진행 중입니다." |
- 사후조건: `COMPLETED` 또는 `FAILED` 이력 기록
- Verification: final warning 만료 전에는 종료 명령이 실행되지 않음을 확인

### UC-09: Shutdown Failure Handling
- 목적: 종료 실패를 기록하고 사용자가 수동 재시도 경로를 인지할 수 있게 한다.
- 액터: Primary User, Operating System
- 사전조건: UC-08에서 종료 명령 실패
- 트리거: `shutdown_failed` 이벤트 수신 또는 실패 이력 생성
- 본 흐름:
1. System: 오류 메시지/타임스탬프를 이벤트 로그와 히스토리에 기록한다.
2. System: 활성 스케줄을 해제해 중복 종료 시도를 방지한다.
3. User: 히스토리/대시보드에서 실패 사실을 확인한다.
4. User: 필요 시 새 스케줄을 다시 생성한다(수동 재시도).
- 대안 흐름:
1. User: 즉시 종료를 원하면 OS에서 수동 종료를 수행한다.
2. System: 앱은 추가 자동 종료를 강행하지 않는다.
- 예외 처리:
| Exception condition | System action | User message |
| --- | --- | --- |
| 권한 부족 | 실패 로그에 원인 저장, 권한 확인 가이드 노출 | "권한 부족으로 종료를 실행할 수 없습니다." |
| 보안 소프트웨어/조직 정책 차단 | 실패 로그에 원인 저장, 정책 확인 안내 | "보안/조직 정책이 종료 요청을 차단했습니다." |
- 사후조건: 실패 이력 보존 + 활성 스케줄 해제 상태 유지
- Verification: 실패 이후에도 단일 활성 정책이 깨지지 않는지 검증

## Main Steps and Flow of Events
### 상태 모델 3계층 (IMP-05)
| 계층 | 값 | 설명 |
| --- | --- | --- |
| UI 표기 상태 | `대기 중(예약 없음)`, `예약됨(Armed)`, `최종 경고(Final warning)`, `종료 명령 실행 중(Shutting down)` | 사용자가 보는 상태 |
| 저장 상태 | `active=null`, `active.status=armed|finalWarning`, `history.status=completed|failed|cancelled` | 상태 파일/히스토리 영속 값 |
| 내부 실행 상태 | `idle -> armed -> finalWarning -> shuttingDown` | 스케줄러 내부 상태 |

```text
IDLE -> ARMED -> FINAL_WARNING -> SHUTTING_DOWN -> HISTORY(completed|failed)
            ^         |
            |---------| (cancel/snooze/process re-appeared)
```

### 상태 전이
| 현재 상태 | 이벤트 | 다음 상태 | 비고 |
| --- | --- | --- | --- |
| 비활성(`active = null`) | 사용자 확인 후 스케줄 활성화 | ARMED | 확인 모달 필수 |
| ARMED(countdown/specificTime) | 10m/5m/1m 임계시점 도달 | ARMED | 사전 알림 이벤트 발행 |
| ARMED(processExit) | 감시 대상 미실행 + 안정 구간 충족 | FINAL_WARNING | 정책: 사전 알림 없이 final warning 직접 진입 + 완료 감지 안내 |
| ARMED | 종료 조건 충족(시간 도달/프로세스 안정 종료) | FINAL_WARNING | `finalWarningEntered` |
| FINAL_WARNING(process-exit) | 대상 프로세스 재실행 감지 | ARMED | `final_warning_reverted`, 종료 보류 |
| ARMED/FINAL_WARNING | 사용자 취소 | 비활성(`active = null`) | `cancelled` 이벤트 기록 |
| ARMED/FINAL_WARNING | 사용자 미루기 | ARMED | 분 입력 `1..1440`, 모드별 재계산 |
| FINAL_WARNING | 유예 시간 만료 | SHUTTING_DOWN(내부) | cancel/postpone 차단 시작 |
| SHUTTING_DOWN | 종료 성공(또는 시뮬레이션 성공) | COMPLETED(히스토리) | 활성 스케줄 해제 |
| SHUTTING_DOWN | 종료 실패 | FAILED(히스토리) | 활성 스케줄 해제 |

### Glossary
| 용어 | 정의 |
| --- | --- |
| `armed` | 사용자가 확인 모달에서 확정한 활성 예약 상태 |
| `finalWarning` | 종료 직전, 취소/미루기가 가능한 상태 |
| `shuttingDown` | 종료 명령 실행 중인 내부 상태(비영속) |
| `watching_process` | process-exit 모드에서만 표시되는 UI 파생 태그 |

### 네이밍 정본화 (IMP-06)
| URL 쿼리(kebab-case) | 내부 타입(camelCase) |
| --- | --- |
| `countdown` | `countdown` |
| `specific-time` | `specificTime` |
| `process-exit` | `processExit` |

신규 모드/라우트 체크리스트:
- [ ] URL 토큰은 kebab-case로 정의
- [ ] 내부 타입은 camelCase로 정의
- [ ] PRD/Design/IA/Use-Case 매핑 표 동시 갱신

### 개념 계약(Interfaces/Types)
1. `ScheduleMode = countdown | specificTime | processExit`
2. `ScheduleStatus = armed | finalWarning` (`active = null`이면 비활성)
3. `QuitBehaviorWhenArmed(target) = BLOCK_AND_CHOOSE`
4. `QuitBehaviorWhenArmed(asBuilt) = BLOCK_AND_CHOOSE_IMPLEMENTED`
5. `RebootPolicy = NO_RESUME_IN_MVP` (`resume_not_supported` 이벤트 발행)
6. `ProcessCompletionPolicy = ROOT_PLUS_CHILDREN_WITH_STABILITY_WINDOW`
7. `ProcessIdentityPolicy = PID_TREE -> TRACKED_PIDS -> ADVANCED(executable/cmdlineContains) -> NAME_FALLBACK`
8. `NotificationPolicy = INFO_ONLY` (취소/미루기 실행은 앱/오버레이/트레이 경로)
9. `NotificationThresholdsDefault = [600, 300, 60]` (초, 시간 기반 전용)
10. `FinalWarningDurationDefault = 60s` (설정값 범위 `15..300`)
11. `SnoozePolicy = minutes 1..1440, default input 10, 횟수 제한 없음`
12. `ProcessExitSnoozePolicy = keep monitoring + delay final warning until snoozeUntilMs`
13. `ActiveSchedulePolicy = SINGLE_ACTIVE_ONLY`
14. `ReplacePolicy = validate_new -> confirm_replace -> cancel_old_recorded -> arm_new -> rollback_if_needed`
15. `StateFilePolicy = scheduler-state.json + .tmp/.bak + corruption quarantine`
16. `HistoryStoragePolicy = keep 250(FIFO)`
17. `HistoryUiPolicy = render 120 per page + load more 120`
18. `GoogleMockIntegrationState = localStorage(autosd.google.connected.v1: "true"|"false")`
19. `ProcessSelectorPrivacyPolicy(target) = cmdlineContains_mask_or_hash_only + executable_minimized`

## Alternative Flows and Edge Cases
| 엣지 케이스 | 영향 UC | 처리 원칙 |
| --- | --- | --- |
| 권한 거부(알림/프로세스/종료) | UC-01, UC-04, UC-09 | 기능 제한 명시 + 복구 경로 제공 |
| 프로세스 목록 비어 있음 | UC-04 | 새로고침 + 시간 기반 모드 전환 CTA |
| 프로세스 즉시 종료(레이스) | UC-04 | 즉시 완료 강행 금지, 안정 구간 재확인 |
| 자식 프로세스 잔존 | UC-04 | 트리 전체 종료+안정 구간 통과 전 완료 금지 |
| shell 계열 동명이인 | UC-04 | 고급 식별값 없으면 Arm 차단 + 입력 가이드 경고 |
| process-exit selector 손상 | UC-04, UC-05 | `NO_FAIL_OPEN_PROCESS_EXIT`로 즉시 안전 중단 |
| 고급 매칭 정보 접근 불가 | UC-04 | name fallback 허용 + degraded 이벤트 기록 |
| final warning 중 프로세스 재등장 | UC-04, UC-05 | 즉시 ARMED 롤백 + 종료 보류 안내 |
| 절전/복귀 | UC-02, UC-03, UC-06 | 복귀 시 남은 시간/목표 시각 재계산 |
| 시스템 시계/타임존 변경 | UC-03, UC-06 | 변경 감지 이벤트로 재계산 및 경고 |
| 앱 완전 종료(Quit) | UC-05 | 정책은 BLOCK_AND_CHOOSE, 현재 구현도 Quit Guard 모달로 선택을 요구 |
| 다중 스케줄 요청 | UC-05 | Replace 확인 후 단일 활성 유지 |
| 알림 차단 | UC-01, UC-06 | 앱 배너/트레이 폴백 |
| 상태 파일 손상 | UC-05, UC-09 | `.bak` 복구 또는 기본 상태로 재초기화 |
| 종료 명령 실패 | UC-08, UC-09 | FAILED 이력 기록 및 수동 재시도 경로 안내 |

## Preconditions and Postconditions
| UC ID | 사전조건 | 사후조건 |
| --- | --- | --- |
| UC-01 | 최초 실행 | 온보딩 완료 및 권한 상태 저장 |
| UC-02 | 활성 스케줄 없음 | 카운트다운 스케줄 ARMED |
| UC-03 | 활성 스케줄 없음 | 특정 시각 스케줄 ARMED |
| UC-04 | 활성 스케줄 없음 + 프로세스 접근 가능 | 감시 스케줄 ARMED 또는 취소 |
| UC-05 | 활성 스케줄 존재 | 비활성 또는 ARMED(재계산) |
| UC-06 | ARMED + 임계시점 도달 | 취소/미루기/종료 실행 중 하나 확정 |
| UC-07 | 설정 화면 접근 가능 | Google 연동(모의) 상태 저장 |
| UC-08 | FINAL_WARNING + 유예시간 만료 | COMPLETED 또는 FAILED 이력 |
| UC-09 | 종료 실패 이력 생성 | 활성 스케줄 해제 + 수동 재시도 가능 |

## Business Rules and Constraints
1. 명확한 ARMED 상태 표시 및 즉시 취소 경로를 항상 제공한다.
2. 종료 스케줄 활성화 전 명시적 확인 단계는 필수다.
3. MVP는 단일 활성 스케줄만 허용한다.
4. 최종 경고 기본값은 60초이며 설정에서 `15..300초` 범위를 허용한다.
5. Snooze 입력은 `1..1440분` 범위를 강제하고 횟수 제한은 두지 않는다.
6. process-exit Snooze는 감시를 유지하고 final warning 진입만 지연한다.
7. Replace는 `유효성 검증 -> 교체 확인 -> 기존 취소 기록 -> 새 Arm` 순서를 원자적으로 수행한다.
8. Replace 실패 시 기존 스케줄 복원(`replace_rolled_back`)을 보장한다.
9. 재부팅 후 스케줄 자동 복구는 MVP 범위에서 지원하지 않는다.
10. 로컬 저장소 정책을 기본으로 하며 기본 텔레메트리는 수집하지 않는다.
11. 히스토리 저장은 최대 250건(FIFO)이며, UI는 페이지당 120건씩 렌더한다.
12. Notification은 info-only로 제공하고 액션 실행은 앱/오버레이/트레이에서만 허용한다.
13. Google 연동은 모의 상태 토글만 제공하며 실제 OAuth/이메일 전송은 구현하지 않는다.
14. Armed 상태 Quit 정책은 `BLOCK_AND_CHOOSE`를 사용한다.
15. 창 닫기(X)는 앱 종료가 아니라 창 숨김으로 처리한다.
16. `simulateOnly=true`일 때는 TopStatusBar/Active Schedule/Confirm Modal에 시뮬레이션 안내 문구를 노출한다.

## Exception Handling Procedures
1. 감지: 권한/프로세스 조회/상태 파일 IO/OS 종료 API 오류를 표준 오류로 분류한다.
2. 기록: 민감정보를 제외하고 이벤트 로그(시간, 모듈, 오류 메시지, 결과)를 저장한다.
3. 통지: 시스템 알림 또는 앱 배너로 사용자에게 실패 맥락과 영향 범위를 안내한다.
4. 폴백: 알림 차단 시 앱/트레이 경고, 상태 파일 손상 시 백업 복구, 종료 실패 시 실패 이력으로 전환한다.
5. 개인정보 보호: `cmdlineContains` 원문/전체 경로를 로그 reason에 기록하지 않고 마스킹 또는 해시 값만 저장한다.
6. 상태 파일 손상 복구 성공 시 배너(`상태 파일 손상을 감지해 마지막 정상 백업(.bak)으로 복구했습니다. 현재 스케줄을 확인해 주세요.`)와 `state_restored_from_backup` 이력을 남긴다.
7. 상태 파일 손상 복구 실패(백업 없음) 시 안전 모드 배너(`상태 파일 손상을 감지해 기본 상태로 복구했습니다. 기존 스케줄은 안전을 위해 복원되지 않았습니다.`)를 노출한다.
8. 재부팅 후 자동 복구 미지원 감지 시 `resume_not_supported` 배너/이력을 노출한다.
9. 복구: 재시도 가능한 오류는 사용자가 새 스케줄을 수동 재생성해 복구한다.
10. 일관성: 어떤 예외에서도 단일 활성 정책과 상태 전이 규칙을 깨지 않는다.

### 사용자 에러 문구 표준 (IMP-14)
| 상황 | 사용자 문구 |
| --- | --- |
| 미루기 범위 초과 | `미루기 시간은 1분에서 1440분 사이로 입력해 주세요.` |
| 최종 경고 시간 범위 초과 | `최종 경고 시간은 15초에서 300초 사이로 설정해 주세요.` |
| 권한 부족 | `권한이 없어 요청을 완료할 수 없습니다.` |
| 상태 저장 실패 | `상태를 저장하지 못했습니다. 다시 시도해 주세요.` |
| 상태 파일 손상 | `저장 상태를 읽지 못했습니다. 복구를 시도합니다.` |
| 자동 종료 실행 실패 | `자동 종료를 실행하지 못했습니다.` |

## User Interface Considerations
1. 비온보딩 화면 헤더에 상태 배지(`대기 중(예약 없음)`/`예약됨`/`최종 경고`)와 핵심 타이머를 표시한다.
2. ARMED/FINAL_WARNING 상태에서는 남은 시간과 정확한 종료 시각을 동시에 노출한다.
3. 확인 모달에는 "언제 종료되는지"(절대시각+상대시간)와 "어떻게 취소/미루는지"를 명시한다.
4. 트레이/메뉴바에서 Quick Start Last Mode, Show Countdown, Open Window, Cancel Schedule, Snooze 10m, Quit App을 제공한다.
5. 트레이 상태 규칙(As-built): Idle에서도 Cancel/Snooze 메뉴는 선택 가능하며 각각 no-op/요청 무시로 처리된다.
6. Quit 정책: Armed/FinalWarning에서 `Quit App`은 `BLOCK_AND_CHOOSE` 모달을 거친다.
7. 알림은 정보 표시만 수행하고 취소/미루기 실행은 앱/오버레이/트레이 경로로 제한한다.
8. 알림이 차단된 환경을 위한 고정 경고 배너를 제공한다.
9. 프로세스 감시 모드는 새로고침과 빈 상태 가이드를 제공하며 목록은 최대 120개로 표시한다.
10. 종료 실패는 히스토리/이벤트 로그에 기록하고 사용자 수동 재설정을 유도한다.
11. 상태 파일 복구(성공/기본 복구)와 `resume_not_supported`는 TopStatusBar 배너 + 히스토리 이벤트를 함께 노출한다.
12. QuickActionFooter는 Idle에서 `새 예약 만들기`를 primary로 표시하고 `지금 취소`/`10분 미루기`는 비활성 사유를 제공한다.
13. 활성 예약 상태에서는 QuickActionFooter와 대시보드 카드에서 `지금 취소`와 `10/5/15분 미루기`를 즉시 실행할 수 있다.
14. 이력 화면은 키보드(`Tab` + `Enter`)로 행 선택 후 상세 드로어를 열 수 있고, 닫으면 이전 행 포커스로 복귀해야 한다.

## Data Requirements and Data Flow
### 저장 데이터
| 데이터 | 저장 위치 | 보존 정책 |
| --- | --- | --- |
| 사용자 설정(`preAlertsSec`, `finalWarningSec`, `simulateOnly`) | `scheduler-state.json` | 사용자 변경 전까지 유지 |
| 현재 활성 스케줄 | `scheduler-state.json` | 스케줄 종료/취소/실패 시 갱신 |
| 실행 이력(결과/오류 메시지) | `scheduler-state.json` | 저장 최대 250건 FIFO |
| 히스토리 UI 렌더 버퍼 | 메모리(뷰모델) | 페이지당 120건 렌더 + `더 보기` 120건 단위 추가 |
| 상태 보호 파일 | `scheduler-state.json.tmp/.bak/.corrupt-*` | 원자적 저장/복구용 |
| Google 연동(모의) 상태 | `localStorage` | 사용자 토글 변경 시 갱신 |

### 런타임 데이터 흐름
1. User: 입력(시간/시각/프로세스/설정)을 제공한다.
2. System: 유효성 검사와 정책 검사(단일 활성, 미루기 범위)를 수행한다.
3. System: 명시적 확인 후 스케줄을 ARMED로 전환하고 상태 파일에 저장한다.
4. System: 1초 tick으로 임계 알림/최종 경고 전환을 평가한다.
5. User: 앱/오버레이/트레이에서 Cancel/Snooze를 수행한다.
6. System: 유예 만료 시 종료 명령(또는 시뮬레이션)을 실행하고 결과를 기록한다.
7. System: 이력/활성 상태를 갱신하고 스냅샷 이벤트를 발행한다.
8. System: `simulateOnly=true` 실행 결과는 `[시뮬레이션]` 표기와 함께 기록한다.

## Security and Privacy Considerations
1. 최소 권한 원칙: 알림/프로세스/종료에 필요한 권한만 요청한다.
2. 현재 구현은 OAuth/토큰/이메일 전송을 사용하지 않는다.
3. 로깅 정책: 민감정보/개인식별 정보는 로그에 기록하지 않는다.
4. 상태 저장은 임시 파일 + 백업 교체 방식으로 원자성을 보장한다.
5. 오프라인 환경에서도 핵심 종료 스케줄 기능은 동작한다.
6. 사용자 통제: Google 연동(모의) 상태는 언제든 연결/해제할 수 있다.
7. 프로세스 식별 정보 정책(목표):
   - Do: `cmdlineContains`는 마스킹/해시 값만 저장하고, `executable`은 기본 파일명 수준으로 표시
   - Don't: cmdline 원문, 사용자 경로, 토큰 문자열을 상태 파일/로그에 평문 저장
8. As-built note: 현재 구현은 상태 파일의 `active.processSelector`, `lastScheduleRequest.processSelector`에 `executable`, `cmdlineContains` 원문이 저장될 수 있다.

## 테스트 케이스 및 시나리오
### 정상 흐름 테스트
1. UC-01: 온보딩 완료 후 대시보드 진입 및 권한 상태 반영
2. UC-02: 30분 카운트다운 생성 후 ARMED 진입
3. UC-03: 특정 시각 스케줄 생성 후 정확한 목표 시각 표시
4. UC-04: 프로세스 종료 안정 구간 통과 후 FINAL_WARNING 진입
5. UC-04: final warning 중 프로세스 재등장 시 ARMED 롤백
6. UC-05: Cancel/Snooze/Replace 각각 단일 활성 정책 준수
7. UC-05: process-exit Snooze 시 모드/selector 유지 + 종료 지연
8. UC-06: 10m/5m/1m 알림과 최종 경고 오버레이 동작
9. UC-06(process-exit): 안정 구간 충족 시 사전 알림 없이 final warning 직접 전환 확인
10. UC-05(Armed Quit): Quit 요청 시 `예약 취소 후 종료` / `백그라운드 유지` / `돌아가기` 선택 모달 노출
11. UC-07: Google 연동(모의) Connect/Disconnect 상태 토글 및 재시작 복원
12. UC-08: 유예 만료 후 시뮬레이션/실종료 분기 실행
13. UC-09: 종료 실패 후 실패 이력 기록 및 수동 재설정
14. UC-05: Replace 성공 시 `cancelled(reason=replace)` 후 새 스케줄 Arm 확인
15. UC-08: `simulateOnly=true`일 때 TopStatusBar/Active/History에 시뮬레이션 표기가 일치함

### 예외 흐름 테스트
1. 권한 거부 시 기능 제한 안내와 폴백 동작
2. 프로세스 레이스(선택 직후 종료) 처리
3. 절전 복귀 후 시간 재계산 정확성
4. 알림 차단 환경에서 앱 배너/트레이 경고 동작
5. 상태 파일 손상 시 `.bak` 복구 또는 기본 상태 초기화
6. 종료 명령 실패 후 FAILED 이력 기록
7. shell 계열 동명이인 선택 시 고급 식별값 없으면 Arm 차단
8. process-exit selector 손상 시 `NO_FAIL_OPEN_PROCESS_EXIT` fail-safe 중단 + `failed` 이력 기록
9. 고급 매칭 정보 접근 불가 시 name fallback + degraded 이벤트 기록
10. process selector 저장 시 민감정보 마스킹 규칙 적용(정책 기준)
11. Replace 중 Arm 실패 시 기존 스케줄 복원 + `replace_rolled_back` 이벤트 기록
12. 상태 파일 복구 성공 시 배너/히스토리 이벤트(`state_restored_from_backup`) 노출
13. 상태 파일 복구 실패(백업 없음) 시 안전 모드 배너/`state_parse_failed` 히스토리 이벤트 노출
14. 재시작 시 미완료 스케줄 감지 시 `resume_not_supported` 배너/이력 노출
15. 알림은 정보형 only이며 Cancel/Snooze가 알림 버튼이 아닌 앱/오버레이/트레이 경로로만 수행됨

### 경계값 테스트
1. 카운트다운 1분 입력 허용
2. 카운트다운 0분 입력 거부
3. 과거 시각 선택 시 다음날 제안
4. Snooze 1440분 허용 / 1441분 거부
5. processStableSec 5초 미만 입력 거부 및 600초 초과 clamp
6. finalWarningSec 15초 미만/300초 초과 입력 거부

### 플랫폼 차이 테스트
1. Windows/macOS 알림 채널 표시 차이에 따른 폴백
2. Windows/macOS 종료 권한/정책 차이에 따른 오류 처리

### 상태 일관성 테스트
1. 메인 UI, 트레이, 알림(정보 표시), 최종 경고 오버레이 간 상태 동기화
2. 상태 전이(`active=null`/`armed`/`finalWarning`/`shuttingDown` 내부/`completed|failed|cancelled` 이력) 무결성
3. 접근성: 전역 `aria-live`(`polite/assertive`) 분리, Final Warning 포커스 트랩/복귀, 키보드 2동작 내 취소/미루기 도달

## Assumptions
1. 앱은 Tauri 기반 단일 인스턴스 데스크톱 앱이다.
2. MVP에서 재부팅 후 자동 복구는 지원하지 않는다.
3. `processStableSec` 기본값은 10초이며 허용 범위는 5~600초다.
4. 최종 경고 기본값은 60초이며 설정에서 15~300초로 변경 가능하다.
5. 히스토리 최대 보존은 250건이다.

## Open Questions
1. v1.1에서 재부팅 복구 기능을 지원할지 여부 (권장: v1.1에서는 미지원 유지, 실패/중단 복구는 v1.2에서 재평가)
2. 프로세스 트리 깊이/감시 비용 상한을 정책화할지 여부
3. Google OAuth/이메일 실연동을 v1.1+ 범위에 포함할지 여부


