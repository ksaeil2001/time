# Auto Shutdown Scheduler (Desktop) PRD (MVP v1.0)

> Last synced with implementation: 2026-02-16 (commit N/A - git metadata unavailable)

## As-built Alignment
- last_synced: 2026-02-16 (commit N/A - git metadata unavailable)
- key changes (변경 이유/영향):
  - 앱 라우팅은 hash 기반 단일 쉘이며 모드 전환은 `/schedule/new?mode=countdown|specific-time|process-exit` 쿼리로 동작한다.
    영향: 북마크/딥링크 문구는 hash URL과 kebab-case 쿼리를 기준으로 안내해야 한다.
  - Tray Quick Start는 즉시 Arm하지 않고 확인 모달을 먼저 열어 명시 동의 후 활성화한다.
    영향: `confirm_before_arm` 정책이 트레이 진입점에서도 유지된다.
  - 사용자 노출 상태 라벨은 `대기 중(예약 없음)` / `예약됨` / `최종 경고`로 렌더된다.
    영향: 문서의 상태 라벨 예시는 `예약 활성화됨` 대신 `예약됨`으로 통일한다.
  - 하단 QuickActionFooter는 온보딩을 제외한 모든 라우트에 노출되며, Idle에서는 `새 예약 만들기` + 비활성 `지금 취소/10분 미루기` + 비활성 `미루기(분)` 입력을 표시한다.
    영향: Idle 상태에서도 미루기 입력 필드가 숨김이 아니라 비활성 노출된다.
  - 활성 예약 상태의 QuickActionFooter 액션 순서는 `취소 → 10분 미루기 → 5/15분 미루기 → 미루기(분) 입력`으로 고정된다.
    영향: 키보드 탐색 시 2동작 이내에 취소 또는 10분 미루기에 도달하는 안전 동선이 보장된다.
  - Arm 확인 모달은 `예약 시작(Arm) 확인` 제목과 `무엇이 일어나나요? / 언제 일어나나요? / 취소·미루기 경로 / 알림 임계값` 4개 섹션으로 구성된다.
    영향: Arm 전 정보 공개(행동/시점/복구 경로)가 모든 모드에서 일관된다.
  - Tray 메뉴는 `Quick Start Last Mode`, `Show Countdown`, `Open Window`, `Cancel Schedule`, `Snooze 10m`, `Quit App` 순서로 고정되며 상태별 비활성 처리를 하지 않는다.
    영향: Idle에서도 `Cancel Schedule`/`Snooze 10m`이 클릭 가능하지만 각각 no-op/무시 처리된다.
  - `process-exit` 감시는 프로세스 목록 UI 최대 120개(백엔드 정렬: name→pid), 검색 입력 없이 새로고침으로만 갱신한다.
    영향: Watch Process IA/UX는 "새로고침 + 정렬 + 상한" 중심으로 기술해야 한다.
  - shell 계열 프로세스는 `실행 파일 경로` 또는 `명령줄 토큰` 미입력 시 Arm이 차단된다(UI/백엔드 공통).
    영향: 오탐 방지 정책이 확인 모달 이전 단계에서 강제된다.
  - process-exit selector가 손상되면 `NO_FAIL_OPEN_PROCESS_EXIT` 정책으로 즉시 안전 중단하고 `failed` 이력을 남긴다.
    영향: Fail-open 없이 예약이 해제되며 사용자에게 재선택 배너를 노출한다.
- P0 Policy(목표):
  - `QuitBehaviorWhenArmed = BLOCK_AND_CHOOSE`를 적용한다. `Armed` 상태에서 Quit 요청 시 `예약 취소 후 종료` / `백그라운드 유지` / `돌아가기`를 제공한다.
  - Final Grace는 기본값 60초를 유지하되 설정에서 `15~300초`를 허용한다. 모든 안내 문구는 현재 설정값을 표시한다.
  - 사전 알림은 시간 기반 모드 전용(10/5/1분)이며 `process-exit` 모드는 완료 감지 후 즉시 Final Warning으로 진입한다.
  - 프로세스 식별 정보는 최소 수집 원칙을 적용한다. `cmdlineContains` 원문은 저장/로그에 남기지 않고 마스킹 또는 해시 값만 허용한다.
- As-built note(현재 구현):
  - Tray/App Quit은 `armed`/`finalWarning`에서 즉시 종료하지 않고 `quit_guard_requested` 모달을 통해 선택지를 요구한다(정책과 일치).
  - `process-exit` 모드는 안정 구간 통과 시 10m/5m/1m 사전 알림 없이 `finalWarning`으로 직접 진입한다(정책과 일치).
  - 상태 파일의 `active.processSelector` 및 `lastScheduleRequest.processSelector`에 `executable`, `cmdlineContains` 값이 원문 형태로 저장될 수 있다(정책과 불일치).

## 문서 정본 규칙 (IMP-18)
- 정본 문서 세트(Canonical Set): `docs/PRD_MVP_v1.0.md`, `docs/DESIGN_GUIDE_MVP_v1.0.md`, `docs/USE_CASE_MVP_v1.0.md`, `docs/IA_MVP_v1.0.md`
- 본 저장소에서는 동일 주제의 중복 버전 문서를 운영하지 않으며, 정책/흐름/IA 변경은 위 4문서를 동시 갱신한다.
- 문서 헤더 포맷은 공통으로 유지한다.
  - `Last synced with implementation: YYYY-MM-DD (commit ...)`
  - `As-built Alignment`에서 `P0 Policy(목표)`와 `As-built note(현재 구현)`를 분리 기록
- 중복 문서가 새로 생기는 경우 처리 규칙:
  - 정본 외 문서에는 `DEPRECATED` 헤더 + 정본 링크를 추가한다.
  - 가능하면 `/archive`로 이동하고 변경 이력만 남긴다.

## 제품 개요(상세 설명)
### 제품 한 줄 정의
터미널 명령 없이 GUI만으로 종료 시점을 예약하고(시간/조건 기반), 종료 직전 취소·미루기 안전장치를 제공하는 Windows/macOS 크로스플랫폼 데스크톱 앱.

### 제품 비전
장시간 작업(다운로드, 렌더링, 배치 작업) 이후 사용자가 자리를 비워도, 시스템이 안전하게 자동 종료되도록 하여 전력 낭비와 불필요한 기기 가동 시간을 줄인다.

### 핵심 사용자 가치(5개)
1. OS별 명령어를 외울 필요 없는 직관적 GUI 예약.
2. Windows/macOS 간 일관된 사용 경험.
3. 종료 직전 알림과 취소/미루기(스누즈)로 오작동 리스크 감소.
4. 프로세스 종료 기반 자동 종료로 실제 작업 완료 시점에 맞춘 제어.
5. 로컬 우선 저장 구조로 프라이버시 및 독립성 강화(백엔드 필수 아님).

### 핵심 차별점
- 시간 기반 예약뿐 아니라 `선택한 프로세스 종료 시 자동 종료`를 MVP 핵심 차별 기능으로 제공한다.

### 대상 플랫폼
- Windows 10/11
- macOS 최근 버전(Apple Silicon/Intel 공존 환경 포함)

## 문제 정의 및 기회
### 문제 정의
- 사용자는 장시간 작업 종료 후 PC를 끄기 위해 터미널/명령 프롬프트를 열고 OS별 명령어를 기억해야 한다.
- 작업 완료 시점을 예측하기 어려워 수면/외출 중 PC가 장시간 켜진 상태로 방치된다.
- 기존 유틸리티는 UI가 복잡하거나 OS 종속적이며, 안전장치(최종 경고/취소/미루기)가 불충분한 경우가 있다.

### 시장/제품 기회
- 에너지 비용 민감도가 높아진 사용자층(다운로더, 크리에이터, 개발자/배치 작업자)에 즉시 효용이 크다.
- “설정 후 잊어도 되는” 신뢰형 유틸리티 포지셔닝이 가능하다.
- 로컬 우선 구조로 초기 출시 복잡도를 줄이고, 향후 선택적 연동(이메일/동기화/원격 제어)으로 확장 가능하다.

## 목표 및 KPI(베타 30일)
### 제품 목표
1. 장시간 작업 이후 불필요한 가동 시간을 줄인다.
2. 사용자가 신뢰할 수 있는 “Set and Forget” 종료 경험을 제공한다.
3. 종료 실패/혼란 취소를 낮추고, 상태 가시성(남은 시간/트리거/취소 경로)을 강화한다.

### KPI 목표값 (베타 30일 기준)
| 지표 | 정의 | 목표 |
| --- | --- | --- |
| 예약 실행 성공률 | 혼란성 취소를 제외하고 실제 실행 완료된 비율 | `>= 95%` |
| WAU | 주간 활성 사용자 수 | `>= 150` |
| MAU | 월간 활성 사용자 수(베타 30일 집계) | `>= 300` |
| 주간 사용자당 스케줄 생성 수 | 사용자 1명 기준 주간 평균 예약 생성 건수 | `>= 2.5` |
| 취소+미루기 비율 | 예약 대비 취소·미루기 이벤트 비율 | `<= 35%` |
| 혼란성 취소 비율 | “실수/이해 부족” 사유 취소 비율 | `<= 10%` |
| 에너지 절감 추정 기능 사용률 | 절감 추정값 확인/입력 기능 사용 사용자 비율 | `>= 40%` |

### KPI 해석 원칙
- 취소율이 낮기만 해도 좋은 것은 아니며, 안전 목적 취소는 정상 행동으로 분리 분석한다.
- 혼란성 취소(UX 문제)는 별도로 추적해 UI 개선 우선순위에 반영한다.

## 범위 정의(MVP / Out of Scope)
### MVP 포함 범위 (In Scope)
- GUI 기반 종료 예약
  - 카운트다운(예: 30분, 1시간, 3시간)
  - 특정 시각(예: 오전 2:30)
- 예약 확정 전 확인 모달(명시적 ARM)
- 종료 전 알림(시간 기반 모드 10/5/1분) 및 최종 유예(기본 60초, 설정 15~300초)
- 취소/미루기 액션: 화면 하단 고정 바, 최종 경고 오버레이, 트레이/메뉴바에서 제공
- 조건 기반 종료: 선택 프로세스 종료 감시(루트+자식 프로세스 기반)
- 로컬 저장: 설정/활성 예약/이력
- 크로스플랫폼 실행(Windows/macOS)
- 선택 기능: Google 연동 화면(모의 연결 상태 토글)

### MVP 제외 범위 (Out of Scope)
- “실제 종료 후 이메일” 보장 기능(백엔드 없이는 불가능)
- 필수 서버/클라우드 DB 의존 구조
- 다중 동시 활성 스케줄
- 팀 협업/원격 다중 디바이스 제어
- 고급 전력 정책 자동 최적화(기업 IT 정책 통합 등)

### 이메일 요구사항 처리 원칙
- 현재 구현(MVP 코드)은 Google OAuth/이메일 발송을 포함하지 않으며, `Google 연동 (옵션)` 화면에서 로컬 상태 토글만 제공한다.
- 진짜 “종료 직전/종료 후 이메일”이 필요하면 별도 백엔드(큐/리트라이/상태 추적)와 OAuth 토큰 저장 설계가 필요하며 v1.1+ 아키텍처 검토 항목으로 분리한다.

## 핵심 기능 및 상세 명세
### 기능 1: 시간 기반 예약 (카운트다운/특정 시각)
#### 무엇을
- 사용자가 GUI에서 종료 시점을 입력하고 예약을 활성화한다.

#### 언제
- 대시보드 또는 새 예약 화면에서 즉시.

#### 어떻게
1. 모드 선택(`countdown` 또는 `specificTime`)
2. 값 입력 및 유효성 검사
3. 확인 모달 표시(`예약 시작(Arm) 확인` + 종료 시각(절대/상대) + 취소·미루기 경로 + 알림 임계값)
4. 사용자 확인 시 `armed` 상태 전환

#### 예외 시
- 과거 시각 선택 시 “다음 날 동일 시각” 제안 또는 날짜 재선택 유도.
- 시스템 시계/타임존 변경 감지 시 예약 재계산 및 사용자 안내 배너 노출.

### 기능 2: 조건 기반 예약 (프로세스 종료 감시)
#### 무엇을
- 사용자가 선택한 프로세스(또는 센티널 프로세스) 종료를 트리거로 자동 종료를 실행한다.

#### 언제
- 렌더링, 다운로드, 배치 작업처럼 완료 시점이 불규칙한 작업 실행 시.

#### 어떻게
1. ProcessExit 화면에서 OS별 센티널 템플릿(폴더/네트워크)과 실행 가이드를 제공한다(앱 직접 spawn은 MVP 범위 제외).
2. 실행 중 프로세스 목록에서 대상 선택(`pid`, `name` + 선택 필드 `executable`, `cmdlineContains`)
3. 감시 정책 적용: PID 루트+자식 트리 -> 추적 PID -> 고급 매칭(`executable`/`cmdlineContains`) -> 마지막 `name` fallback 순서
4. 종료 판정 안정 구간(`processStableSec`, 기본 10초, 허용 5~600초) 확인 후 최종 경고 단계로 이동한다.
5. `processExit`에서 Snooze 시 감시는 유지하고, 종료 진입만 `snoozeUntilMs`까지 지연
6. 최종 유예 중 프로세스가 다시 실행되면 `armed`로 롤백 후 재감시
7. 최종 유예 만료 시 종료 실행
8. `process-exit`는 10/5/1 사전 알림 없이 Final Warning으로 직접 진입하며, 대체 알림으로 `프로세스 종료가 감지되어 최종 경고가 시작되었습니다.` 안내를 표시한다.

#### 예외 시
- 프로세스가 즉시 종료된 경우: 즉시 종료 대신 사용자 재확인.
- 고급 매칭 정보(`exe/cmdline`) 접근 불가 시: name fallback으로 강등하고 경고 이벤트(`process_match_degraded`) 기록.
- 권한 부족으로 프로세스 열람 실패 시: 권한 안내 및 시간 기반 모드 대체 CTA 제공.

### 기능 3: 사전 알림/취소/미루기 안전장치
#### 무엇을
- 종료 직전 사용자 개입 창구를 제공해 오작동을 줄인다.

#### 언제
- 종료 임계 시점(시간 기반 10/5/1분)과 최종 경고 단계(기본 60초, 설정 15~300초).

#### 어떻게
- 데스크톱 알림(정보 표시)과 앱 내 상태 카드/오버레이를 동시 운영한다.
- 상태 변경(`예약 활성화/취소/완료/실패`)은 전역 `aria-live`(`polite/assertive`)로 구분 전달한다.
- 실행 가능한 액션 경로: 앱 하단 고정 바, 최종 경고 오버레이, 트레이/메뉴바.
- 스누즈 후 종료 시점을 재계산한다(입력 범위 1~1440분).
- 최종 경고 문구는 현재 설정값을 반영한다(예: `종료 45초 전입니다. 지금 취소하지 않으면 종료가 진행됩니다.`).
- Final Warning 오버레이는 `role="alertdialog"` + 포커스 트랩 + 닫힘 시 원위치 포커스 복귀를 적용한다.

#### 예외 시
- OS 알림 차단 또는 알림 채널 제한 시: 앱 내 배너(`시스템 알림이 꺼져 있어 사전 알림을 받지 못할 수 있습니다.`) + 트레이 메뉴 액션으로 대체.

### 기능 4: 로컬 저장 및 이력
#### 무엇을
- 설정/활성 예약/실행 이력을 로컬에 저장한다.

#### 언제
- 예약 생성/변경/취소/실행/실패 이벤트 발생 시.

#### 어떻게
- 로컬 파일 또는 로컬 DB(예: SQLite) 기반 저장.
- 이력 최대 보관 수(예: 250건 FIFO) 유지.

#### 예외 시
- 쓰기 실패 시 메모리 캐시 유지 + 사용자 경고 + 재시도.

### 기능 5: 선택 기능 - Google 연동 화면(모의)
#### 무엇을
- `Google 계정 연결(테스트)` 화면에서 상태를 `연결됨/연결 안 됨`으로 토글한다.

#### 언제
- 사용자가 설정 화면(`/settings/integrations/google`)에서 연결/해제를 선택할 때.

#### 어떻게
- `localStorage` 키(`autosd.google.connected.v1`)로 UI 상태를 저장한다.
- 버튼 라벨은 `연결하기` / `연결 해제`를 사용한다.
- 실제 OAuth, 토큰 저장, 메일 발송은 구현하지 않는다.

#### 예외 시
- 저장소 접근 실패 시 기본 상태(`연결 안 됨`)로 표시한다.

### 추상 인터페이스 계약 (Public APIs / 타입)
| 인터페이스 | 필드/값 | 설명 |
| --- | --- | --- |
| `ScheduleMode` | `countdown \| specificTime \| processExit` | 예약 모드 |
| `ScheduleStatus` | `armed \| finalWarning` (내부 처리에 `shuttingDown`) | 활성 예약 상태 |
| `ScheduleRequest` | `mode`, `durationSec?`, `targetLocalTime?`, `processSelector?`, `preAlerts?`, `processStableSec?` | 예약 생성 요청 |
| `ProcessSelector` | `pid?`, `name?`, `executable?`, `cmdlineContains?` | 프로세스 식별자(고급 매칭 필드 포함) |
| `ActiveSchedule(processExit)` | `processSelector`, `processStableSec`, `snoozeUntilMs?`, `processTreePids?` | 감시 유지형 Snooze/재검증 상태 |
| `ProcessWatchPolicy` | `includeChildren`, `stabilityWindowSeconds` | 프로세스 감시 정책 |
| `QuitPolicy(target)` | `BLOCK_AND_CHOOSE` | Armed 상태 Quit 요청 시 선택 모달 기반 처리 |
| `FinalWarningPolicy` | `default=60s`, `range=15..300s` | 최종 경고 시간 정책 |
| `ActionCommand` | `cancel`, `postpone(minutes: 1..1440)` | 앱/오버레이/트레이에서 실행되는 취소/미루기 명령 |
| `IntegrationConfig` | `googleConnectedMock` (`localStorage`) | 연동 화면 상태(모의) |
| `ExecutionResult` | `status`, `reasonCode`, `timestamp` | 실행 결과 |
| `StoragePolicy` | 로컬 설정/이력/활성 예약 저장(`scheduler-state.json`, `.bak`, `.corrupt-*`) | 저장 정책 |

### 상태 모델 정규화 (IMP-05)
#### 3계층 상태 정의
| 계층 | 상태 값 | 설명 |
| --- | --- | --- |
| UI 표기 상태 | `대기 중(예약 없음)`, `예약됨(Armed)`, `최종 경고(Final warning)`, `종료 명령 실행 중(Shutting down)` | 사용자가 화면/트레이에서 보는 상태 라벨 |
| 저장 상태 | `active = null`, `active.status = armed | finalWarning`, `history.status = completed | failed | cancelled`, `runtimeTag = watching_process?` | 상태 파일/히스토리로 복원 가능한 상태 |
| 내부 실행 상태 | `idle -> armed -> finalWarning -> shuttingDown` | 스케줄러 tick과 OS 종료 호출에서 사용하는 내부 단계 |

#### 상태 전이 다이어그램(텍스트)
```text
IDLE(active=null)
  -> [confirm_before_arm]
ARMED(active.status=armed)
  -> [time pre-alert 10m/5m/1m, time-based only]
  -> [trigger reached]
FINAL_WARNING(active.status=finalWarning)
  -> [cancel] IDLE
  -> [snooze 1..1440] ARMED
  -> [process re-appeared, process-exit only] ARMED
  -> [grace expired]
SHUTTING_DOWN(internal only, non-persisted)
  -> [success] COMPLETED(history)
  -> [failure] FAILED(history)
```

#### 상태 전이 표(정규화)
| 현재(내부) | 이벤트 | 다음(내부) | 저장 반영 |
| --- | --- | --- | --- |
| `idle` | 사용자 Arm 확정 | `armed` | `active.status=armed` |
| `armed` | 종료 조건 충족 | `finalWarning` | `active.status=finalWarning` |
| `finalWarning` | 사용자 `cancel` | `idle` | `active=null`, `history=cancelled` |
| `finalWarning` | 사용자 `postpone(1..1440)` | `armed` | `active.status=armed`, `snoozeUntilMs` 업데이트 |
| `finalWarning` | 유예 만료 | `shuttingDown` | 저장 상태 유지(내부 실행 단계) |
| `shuttingDown` | 종료 성공/실패 | `idle` | `active=null`, `history=completed|failed` |

#### Glossary
| 용어 | 정의 |
| --- | --- |
| `armed` | 사용자가 확인 모달을 통과해 예약이 활성화된 상태 |
| `finalWarning` | 종료 직전 사용자 개입(취소/미루기)이 가능한 경고 상태 |
| `shuttingDown` | 종료 명령 실행 중인 내부 상태(사용자 조작 불가, 비영속) |
| `watching_process` | `process-exit` 모드에서만 보이는 UI 파생 태그(독립 저장 상태가 아님) |
| `active = null` | 현재 활성 스케줄이 없는 비활성 상태 |

### 네이밍 정본화 (IMP-06)
#### URL 쿼리(kebab-case) ↔ 내부 타입(camelCase) 매핑
| 도메인 | 외부 표기 (URL/라우트) | 내부 표기 (타입/상태) | 비고 |
| --- | --- | --- | --- |
| 모드 | `countdown` | `countdown` | 동일 표기 유지 |
| 모드 | `specific-time` | `specificTime` | 하이픈 제거 + camelCase |
| 모드 | `process-exit` | `processExit` | 하이픈 제거 + camelCase |
| 상태 라벨 | `final-warning`(UI slug) | `finalWarning` | URL slug가 필요할 때만 사용 |

#### 신규 모드/라우트 추가 체크리스트(템플릿)
- [ ] URL 쿼리/라우트 토큰은 kebab-case로 정의했는가?
- [ ] 내부 enum/type은 camelCase로 정의했는가?
- [ ] 본 PRD의 매핑 표, IA의 URL 구조 표, Design Guide의 인터페이스 표를 함께 갱신했는가?
- [ ] Use-Case의 상태 전이/예외/테스트 케이스에 신규 모드를 반영했는가?
- [ ] URL 파서/복원 시 kebab↔camel 매핑 테스트를 추가했는가?

## 추가 기능 제안(v1.1+)
### 우선순위
1. 트레이/프리셋 UX 고도화 (최우선)
2. Idle 기반 종료 (CPU/네트워크 유휴 조건)
3. Sleep/Hibernate 확장

### 상세 제안
- 트레이/메뉴바 빠른 제어:
  - 시작/취소/미루기/남은 시간 표시
  - 30m/1h/2h/4h 프리셋 원클릭
- 추가 트리거:
  - 시스템 유휴 시간
  - CPU/네트워크 임계값 기반 조건
- 액션 확장:
  - Shutdown 외 Sleep/Hibernate 선택
- UX 확장:
  - 다국어(한국어/영어), 다크 모드, 시작 시 자동 실행

## 사용자 페르소나 및 주요 시나리오
### 페르소나 A: 헤비 다운로더
- 특성: 야간 대용량 다운로드/업데이트를 자주 수행.
- 목표: 작업 완료 직후 자동 종료.
- 시나리오: `processExit`로 다운로드 클라이언트 프로세스 감시 후 종료.

### 페르소나 B: 크리에이터/렌더러
- 특성: 영상 인코딩/렌더링 시간이 길고 변동이 큼.
- 목표: 예상 시간이 아니라 실제 완료 기준 종료.
- 시나리오: 렌더러 프로세스 종료 시점 + 종료 직전 알림으로 마지막 확인.

### 페르소나 C: 배치 작업 사용자
- 특성: 스크립트/배치 작업을 야간에 실행.
- 목표: 작업 완료 후 전력 절감 및 장비 보호.
- 시나리오: 특정 시각 예약 또는 프로세스 종료 기반 예약을 작업 성격에 따라 선택.

## 레퍼런스 서비스 분석(근거 포함)
### 레퍼런스 1: Windows 기본 도구 (`shutdown`, `schtasks`)
- 관련성:
  - OS 네이티브 종료/예약의 신뢰 가능한 베이스라인.
  - 권한/파라미터/예약 개념을 제품 UX에 매핑 가능.
- 학습 포인트:
  - 명령 기반 도구는 강력하지만 일반 사용자 접근성이 낮음.
  - 우리 제품은 이 기능을 GUI로 추상화하고 확인/취소 흐름을 강화해야 함.
- Note: Microsoft `shutdown` 문서  
  https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/shutdown
- Note: Microsoft `schtasks /create` 문서  
  https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks-create

### 레퍼런스 2: macOS `pmset` 전원 예약
- 관련성:
  - macOS에서 전원 스케줄링의 공식 경로.
  - 시스템 상태(로그인/절전/미저장 문서)가 종료 성공에 영향을 줌.
- 학습 포인트:
  - 단순 예약만으로는 신뢰 경험이 부족하며, 앱 레벨 사전 안내와 복구 UX가 필요.
- Note: Apple Support `pmset` 가이드  
  https://support.apple.com/en-vn/guide/mac-help/mchl40376151/mac

### 레퍼런스 3: Wise Auto Shutdown
- 관련성:
  - 대중적 자동 종료 유틸리티의 시간 기반 예약/리마인더 패턴 확인 가능.
- 학습 포인트:
  - “예약 준비/활성화 확인 후 백그라운드 동작 + 트레이 제어”는 사용성 핵심 패턴.
  - 리마인더(사전 경고)와 간단한 작업 설정 구조가 MVP UX에 유효.
- Note: Wise Auto Shutdown 도움말  
  https://www.wisecleaner.com/PCE/Help/AutoShutdown/autoshutdown.html
- Note: Wise Auto Shutdown Manual  
  https://www.wisecleaner.com/help/wiseautoshutdown/

### 레퍼런스 4: Airytec Switch Off
- 관련성:
  - 트레이 중심 제어, 스누즈, Idle 트리거 등 확장 기능의 선행 사례.
- 학습 포인트:
  - “트레이 우선 조작성”은 반복 사용 도구의 핵심.
  - Idle 트리거는 v1.1 확장 기능 우선 검토 가치가 높음.
- Note: Airytec Switch Off  
  https://www.airytec.com/switch-off

### 레퍼런스 5: den4b Shutter
- 관련성:
  - 이벤트/액션 조합이 풍부한 자동화 유틸리티.
  - 프로세스 기반 트리거와 종료 액션 조합 관점에서 비교 가치 높음.
- 학습 포인트:
  - 기능 폭이 넓을수록 UX 복잡도가 급증하므로 MVP는 핵심 시나리오 우선이 적절.
- Note: den4b Shutter 제품 페이지  
  https://www.den4b.com/products/shutter

## UX/안전장치 요구사항
### 핵심 UX 원칙
1. 현재 상태를 항상 명시한다(사용자 노출: `대기 중(예약 없음)` / `예약됨` / `최종 경고`).
2. 종료 예정 시각, 남은 시간, 트리거 조건, 취소 경로를 한 화면에서 확인 가능하게 한다.
3. 예약은 반드시 확인 모달을 통해 명시적으로 활성화한다.

### 안전장치 요구사항
- 사전 알림 기본값: 10분/5분/1분
- 최종 유예: 기본 60초, 설정 범위 15~300초 + 즉시 취소 가능
- `process-exit` 모드는 10/5/1 사전 알림 없이 완료 감지 후 즉시 최종 경고로 진입한다.
- 대체 알림: `process-exit` 최종 경고 진입 시 `프로세스 종료가 감지되어 최종 경고가 시작되었습니다.` 안내를 노출한다.
- 알림 정책: 데스크톱 알림은 정보 표시만 수행한다(info-only). 취소/미루기 실행은 앱/최종 경고 오버레이/트레이에서만 제공한다.
- 스누즈: 1~1440분 범위 입력(기본 10분)
- 미저장 문서/업데이트 진행 중 감지 시 best-effort 경고
- 종료 실패 시 복구 화면에서 원인 코드와 재시도/취소 제공
- Armed 상태 Quit 정책(목표): `BLOCK_AND_CHOOSE`
  - 선택지 A: `예약 취소 후 종료`
  - 선택지 B: `백그라운드 유지`
  - 선택지 C: `돌아가기`
- 윈도우 닫기(X) 정책: 앱 종료가 아니라 창 숨김 처리로 통일한다(예약 유지).
- AC-01: `Armed` 상태에서 Tray/Menu/App Quit 요청 시 선택 모달 없이 즉시 종료되지 않는다.
- AC-02: `백그라운드 유지`를 선택하면 활성 예약/카운트다운/이력이 유지된다.
- AC-03: `예약 취소 후 종료`를 선택하면 `cancelled` 이벤트 기록 후 앱이 종료된다.
- As-built note: 현재 구현은 Tray `Quit App`에서도 `quit_guard_requested` 모달을 표시한 뒤 선택지 결과를 적용한다.

QuickActionFooter 상태 행렬(IMP-08):
| 상태 | `새 예약 만들기` | `지금 취소` | `미루기 입력(1..1440)` | `미루기 빠른 버튼` |
| --- | --- | --- | --- | --- |
| Idle | Enabled | Disabled(사유 안내) | Disabled(기본값 10 노출) | `10분 미루기` 단일 버튼 Disabled(사유 안내) |
| Armed | Hidden | Enabled | Enabled(기본 10) | `10·5·15분 미루기` Enabled |
| FinalWarning | Hidden | Enabled | Enabled(기본 10) | `10·5·15분 미루기` Enabled |

Tray/Menu 상태 규칙(IMP-09):
| 상태 | 요약 라벨 | `Cancel Schedule` | `Snooze 10m` | `Quit App` |
| --- | --- | --- | --- | --- |
| Idle | `활성 스케줄 없음` | Enabled(no-op) | Enabled(요청 무시) | 즉시 종료 |
| Armed | `자동 종료 대기 중` | Enabled | Enabled | `BLOCK_AND_CHOOSE` |
| FinalWarning | `최종 경고 진행 중` | Enabled | Enabled | `BLOCK_AND_CHOOSE` |

### 접근성 수락 기준 (IMP-15)
- A11Y-AC-01: 전역 `aria-live`를 `polite/assertive`로 구분한다.
- A11Y-AC-02: Final Warning 오버레이는 `role="alertdialog"`, `aria-labelledby`, `aria-describedby`를 가진다.
- A11Y-AC-03: Final Warning 진입 시 포커스 트랩이 적용되고 종료 시 직전 포커스로 복귀한다.
- A11Y-AC-04: 키보드만으로 2동작 이내 `지금 취소` 또는 `10분 미루기`에 도달 가능하다.

### Replace 트랜잭션 규칙 (IMP-10)
- 원자성 단계:
  1. `새 스케줄 유효성 검증`
  2. `교체 확인 모달 승인`
  3. `기존 스케줄 취소 이벤트 기록(cancelled:reason=replace)`
  4. `새 스케줄 arm`
- 실패/롤백 규칙:
  - 1단계 실패: 교체 시작하지 않고 기존 스케줄 유지
  - 3단계 실패: 기존 스케줄 상태를 보존하고 새 스케줄 Arm 시도 금지
  - 4단계 실패: 기존 스케줄을 즉시 복원(`armed`), `replace_rolled_back` 이벤트 기록
  - 결과는 항상 단일 활성 스케줄 불변식을 만족해야 한다.

### simulateOnly 인지 장치 (IMP-12)
- TopStatusBar: `테스트 모드` 배지를 상시 노출한다.
- General Settings: 토글 라벨은 `시뮬레이션 모드(실제 종료 안 함)`, 보조 문구는 `실제 종료 명령을 실행하지 않습니다.`를 사용한다.
- Confirm Modal: 제목은 `예약 시작(Arm) 확인`을 사용하고, `무엇이 일어나나요? / 언제 일어나나요? / 취소·미루기 경로 / 알림 임계값` 섹션을 모두 노출한다.
- History/Logs: 시뮬레이션 실행 결과는 `[시뮬레이션]` 접두어와 `simulated=true` 태그를 함께 기록한다.

### 악성행위 오인 방지 UX
- 앱이 수행할 행동을 평문으로 상시 표시:
  - “언제(시각/조건), 무엇(종료), 어떻게 취소(버튼/트레이)”를 고정 영역에 노출
- 권한 요청 시 목적/범위/거부 시 영향 설명

## 기술 스택 권고안(2~3안 비교)
### 전제
- 현재 코드베이스는 Tauri + React + TypeScript 기반이므로, MVP 리드타임/리스크 관점에서 연속성이 가장 중요하다.

### 옵션 비교
| 항목 | 옵션 A (권고) Tauri + React | 옵션 B Electron + React/Vue | 옵션 C Flutter Desktop 또는 .NET MAUI |
| --- | --- | --- | --- |
| 개발 연속성 | 현재 레포와 직접 연속, 전환 비용 최소 | 전환 필요(런타임/빌드 체인 변경) | 전환 비용 큼(UI/플러그인/운영체계 차이) |
| 실행 크기/메모리 | 상대적으로 가벼운 편 | 상대적으로 무거운 편 | 프레임워크 의존(중간~큰 편) |
| 보안 표면 | Rust 백엔드 + 권한 경계 관리 용이 | Node 통합 시 공격면 관리 필요 | 플랫폼 채널/플러그인 보안 점검 필요 |
| OS 통합(알림/트레이/권한) | 플러그인 및 네이티브 바인딩으로 충분 | 성숙한 생태계로 구현 용이 | 구현 가능하나 생태계/사례 편차 존재 |
| 패키징/배포 | Tauri 번들러로 Win/mac 패키징 | Electron Builder 등 성숙 | 플랫폼별 배포 파이프라인 별도 최적화 필요 |
| 자동 업데이트 | 구현 가능(정책/서명 체계 필요) | 풍부한 사례 | 프레임워크별 별도 전략 필요 |
| MVP 적합성 | 매우 높음 | 중간 | 중간~낮음 |

### 권고 결론
- MVP는 **옵션 A(Tauri + React)** 채택.
- 이유: 현재 코드베이스 연속성, 비교적 작은 footprint, 로컬 우선 구조와 보안 경계 설계가 용이함.
- 백업안: 팀의 웹 생태계 인력 중심이라면 옵션 B도 가능하나, 배포 크기/리소스 비용을 감수해야 함.

## 데이터 구조 및 로컬 저장 정책(추상)
### 저장 원칙
- 필수 사용자 데이터만 저장(최소 수집).
- 서버 DB 의존 없음.
- 민감정보는 일반 로컬 파일에 저장하지 않는다.

### 프로세스 식별 정보 프라이버시 정책 (IMP-04)
- Policy(목표):
  - `cmdlineContains`는 평문 저장 금지. 저장 시 마스킹 또는 해시 값만 허용한다.
  - `executable`은 기본 저장/표시를 파일명 수준으로 최소화하고, 전체 경로 표시는 사용자 명시 동작(옵트인)에서만 허용한다.
  - 이벤트 로그/오류 메시지에는 토큰, 경로, 개인식별 문자열을 그대로 남기지 않는다.
- Do / Don't:
  - Do: `cmdlineTokenHash=sha256:ab12...`처럼 비가역 값으로 저장
  - Do: UI 기본값은 `pwsh.exe`처럼 최소 식별 정보만 표시
  - Don't: `--token=abc123` 같은 원문 인자 저장/노출
  - Don't: 전체 사용자 홈 경로(`/Users/alice/...`)를 로그 reason에 평문 기록
- As-built note:
  - 현재 구현은 `active.processSelector`와 `lastScheduleRequest.processSelector`의 `executable`, `cmdlineContains`를 상태 파일에 원문으로 보관할 수 있어 정책과 차이가 있다.

예시(정책 목표):
```json
{
  "processSelector": {
    "pid": 4242,
    "name": "pwsh.exe",
    "executableBasename": "pwsh.exe",
    "cmdlineTokenHash": "sha256:2f4c7a..."
  },
  "event": {
    "eventType": "process_match_degraded",
    "reason": "고급 매칭 정보를 읽지 못해 이름 기반 감시로 전환했습니다."
  }
}
```

### 추상 데이터 구조
| 엔티티 | 주요 필드(추상) | 저장 위치 |
| --- | --- | --- |
| 사용자 설정 | 언어, 알림 임계값, 기본 유예 시간, 시작 시 실행 여부 | 로컬 파일/로컬 DB |
| 활성 예약 | 모드, 목표 시각/조건, 생성 시각, 상태 | 로컬 파일/로컬 DB |
| 실행 이력 | 결과 상태, 원인 코드, 타임스탬프, 사용자 액션(취소/미루기) | 로컬 파일/로컬 DB(FIFO) |
| 연동 설정(모의) | Google 연결 on/off 상태 | `localStorage` |

### 보존 정책
- 저장 보관 한도: 이력 최대 250건(FIFO), 초과 시 오래된 항목부터 삭제.
- UI 렌더 한도: History 화면은 최근 120건을 1페이지로 렌더한다.
- 페이징 정책: `더 보기`를 선택할 때 120건 단위로 추가 로드한다(무한 스크롤 미사용).
- 프로세스 목록 120개 제한은 `Watch Process` 화면 전용 규칙이며, 히스토리 보관 한도와 분리한다.
- 사용자가 Google 연동(모의)을 해제하면 로컬 연결 상태를 즉시 `disconnected`로 갱신.

## 보안/개인정보/컴플라이언스
### 보안 원칙
1. 최소 권한 원칙(알림/프로세스 조회/종료 실행 권한만 요청).
2. 민감정보 평문 저장 금지.
3. 로컬 로그에 개인식별 정보/민감정보 저장 금지.
4. `cmdlineContains` 원문은 저장/로그에 기록하지 않고 마스킹 또는 해시 값으로만 처리한다.
5. `executable` 전체 경로는 기본 비노출이며, 필요한 경우에도 사용자 명시 동작에서만 노출한다.

### OAuth/이메일 관련 요구사항
- As-built note: MVP 구현은 Google 연동 화면의 모의 연결 상태 토글만 제공하며, 실제 OAuth/토큰 저장/이메일 전송은 포함하지 않는다.
- 실연동 도입 시 최소 스코프, 토큰 저장소, 실패 시 종료 지속 정책을 별도 제품 결정으로 확정해야 한다(v1.1+).

### 컴플라이언스/고지
- 앱 최초 실행 시 다음을 명시:
  - 어떤 동작(종료)을 하는지
  - 언제 트리거되는지
  - 어떻게 취소/미루는지
  - 어떤 데이터가 로컬에 저장되는지
- 개인정보 처리 안내(간단 고지 + 상세 링크) 제공.

## 운영 정책(권한, 절전/복귀, 타임존, 장애 처리)
### 권한 정책
- 권한 필요 시점에 지연 요청(선요청 최소화).
- 관리자 권한이 필요한 경우:
  - 필요 사유
  - 허용/거부 시 영향
  - 대체 경로
  를 한 화면에서 명확히 안내.

### 절전/복귀 정책
- 절전 진입 시 타이머 tick 일시 중지.
- 복귀 시 현재 시각 기준으로 남은 시간 재계산.
- 특정 시각 예약이 이미 지났으면 즉시 실행 대신 사용자 확인 후 진행(안전 우선).

### 타임존/시계 변경 정책
- 타임존 변경 이벤트 감지 시 특정 시각 예약 재해석.
- 수동 시계 변경 감지 시 배너 경고 + 예약값 재검증.

### 장애 처리 정책
- 종료 명령 실패 시 상태를 `failed`로 전환하고 원인 코드 제공.
- 사용자는 재시도/취소/재예약 중 선택 가능.
- 단일 활성 스케줄 정책 유지: 충돌 시 “교체 확인” 강제.

### 상태 파일 손상 복구 UX (IMP-16)
- 자동 복구 성공:
  - 위치: 시작 알림 + Dashboard 상단 배너 + History 이벤트
  - 배너 문구: `상태 파일 손상을 감지해 마지막 정상 백업(.bak)으로 복구했습니다. 현재 스케줄을 확인해 주세요.`
  - CTA: 없음(배너/이력 안내만 제공)
- 자동 복구 실패:
  - 위치: 시작 알림 + Dashboard 상단 배너
  - 배너 문구: `상태 파일 손상을 감지해 기본 상태로 복구했습니다. 기존 스케줄은 안전을 위해 복원되지 않았습니다.`
  - CTA: 없음(배너/이력 안내만 제공)
- 로그 규격: `state_parse_failed`, `state_restored_from_backup` 이벤트를 표준 reason과 함께 남긴다.

### 재시작 후 자동 복구 미지원 안내 (IMP-17)
- 재시작 감지 시점: 앱 시작 시 이전 `active` 스냅샷이 존재하고 미완료인 경우
- 사용자 노출:
  - TopStatusBar 배너: `앱 재시작 후 이전 스케줄은 자동 복구되지 않습니다.`
  - History 이벤트: `resume_not_supported`
  - CTA: 없음(배너/이력 안내만 제공)
- 정책 문구: MVP는 자동 resume을 지원하지 않으며, 사용자의 명시적 재예약으로만 재개한다.

### 오류 메시지 표준 사전 (IMP-14)
| 상황/코드 | 사용자 노출 문구(한국어) | 복구 CTA |
| --- | --- | --- |
| 범위 오류(`snooze_minutes_out_of_range`) | `미루기 시간은 1분에서 1440분 사이로 입력해 주세요.` | `입력값 수정` |
| 범위 오류(`final_warning_out_of_range`) | `최종 경고 시간은 15초에서 300초 사이로 설정해 주세요.` | `설정 열기` |
| 권한 오류(`permission_denied`) | `권한이 없어 요청을 완료할 수 없습니다.` | `권한 안내 보기` |
| 저장 실패(`state_save_failed`) | `상태를 저장하지 못했습니다. 다시 시도해 주세요.` | `다시 시도` |
| 상태 파일 손상(`state_parse_failed`) | `상태 파일 손상을 감지해 복구 절차를 수행했습니다. 현재 예약과 설정을 확인해 주세요.` | 없음(상단 배너 + 이력) |
| 종료 실패(`shutdown_failed`) | `자동 종료를 실행하지 못했습니다.` | `재시도`, `수동 종료 안내` |

## 성공 지표 측정 방법(로컬 우선)
### 측정 원칙
- 기본은 로컬 이벤트 로그 집계.
- 백엔드 강제 없이도 측정 가능하도록 설계.

### 이벤트 정의(로컬)
- `armed`
- `alerted`
- `final_warning`
- `process_match_degraded`
- `final_warning_reverted`
- `postponed`
- `cancelled`
- `shutdown_initiated`
- `executed`
- `failed`
- `settings_updated`
- `resume_not_supported`
- `timezone_realigned`
- `state_parse_failed`
- `state_restored_from_backup`

### KPI 계산 접근
- 앱 내 집계 대시보드(로컬) 제공.
- 베타 운영에서는 선택적 익명 리포트 내보내기(CSV/JSON)로 팀이 수집·분석.
- MAU/WAU는 베타 참여자 동의 기반 익명 집계 또는 수동 제출 방식으로 산정.

### 품질 해석 가이드
- `action_cancel`의 사유 태깅(실수/업무변경/테스트)을 분리해 혼란성 취소만 UX 개선 지표로 사용.

## 테스트 케이스 및 수용 기준
### 기능 테스트 케이스
| ID | 시나리오 | 기대 결과(수용 기준) |
| --- | --- | --- |
| TC-01 | 카운트다운 예약 생성 → 사전 알림 → 종료 실행 | 활성 상태 전이 및 이벤트 기록이 정상(`armed→finalWarning→shutdown_initiated→executed`) |
| TC-02 | 특정 시각 예약(자정 경계 포함) | 날짜 경계에서 오동작 없이 목표 시각에 실행 |
| TC-03 | 프로세스 종료 감시(자식 포함) | 안정 구간 충족 후 final warning 진입 및 종료 실행 |
| TC-04 | 시간 기반 사전 알림에서 Cancel | 즉시 `cancelled`로 전환, 종료 미실행 |
| TC-05 | 오버레이/하단바/트레이에서 미루기 | 입력한 분(1~1440) 기준으로 종료 시점이 재계산됨 |
| TC-06 | process-exit에서 Snooze | 모드/selector 유지 + `snoozeUntilMs` 동안 final warning 진입 지연 |
| TC-07 | process-exit final warning 중 프로세스 재등장 | 1초 tick 내 `armed` 롤백 + 종료 카운트다운 중지 |
| TC-08 | process-exit 사전 알림 정책 검증 | 10m/5m/1m 사전 알림 없이 최종 경고로 직접 진입하고, 진입 안내 문구를 표시함 |
| TC-09 | Armed 상태 Quit 요청 처리 | Quit 요청 시 `예약 취소 후 종료` / `백그라운드 유지` / `돌아가기` 선택지가 표시되고 선택 결과대로 종료/유지가 적용됨 |

### 예외/경계 테스트 케이스
| ID | 시나리오 | 기대 결과(수용 기준) |
| --- | --- | --- |
| TE-01 | 권한 거부 상태에서 예약/실행 | 제한 기능 안내 + 복구 경로 제공 |
| TE-02 | 절전 후 복귀 | 남은 시간/실행 시점 재계산, 상태 일관성 유지 |
| TE-03 | 타임존/시계 변경 | 특정 시각 예약 재해석 및 사용자 안내 |
| TE-04 | PID 재사용/즉시 종료 레이스 | 오탐 종료 방지(동일성 검증 통과 시만 진행) |
| TE-05 | 미저장 문서 존재 | best-effort 경고 노출 후 사용자 선택 반영 |
| TE-06 | shell 계열 동명이인 프로세스 존재 | 고급 식별값(`Executable path` 또는 `Cmdline token`) 미입력 시 Arm 차단, 입력 시 의도 대상만 추적 |
| TE-07 | exe/cmdline 접근 불가 환경 | name fallback 강등 + `process_match_degraded` 이벤트 기록 |
| TE-08 | process-exit selector 손상(파싱 실패/필드 누락) | `NO_FAIL_OPEN_PROCESS_EXIT` 정책으로 즉시 안전 중단 + `failed` 이벤트 기록 |
| TE-09 | process selector 민감정보 처리 | Policy(목표): `cmdline` 원문 미저장(마스킹/해시). As-built: 현재 구현은 상태 파일에 원문이 저장될 수 있어 불일치로 분류 |

### 연동 화면(모의) 테스트 케이스
| ID | 시나리오 | 기대 결과(수용 기준) |
| --- | --- | --- |
| TI-01 | Google 연결하기/연결 해제 | localStorage 상태와 UI 배지가 일관되게 동작 |

## 릴리즈/롤아웃 계획
### 단계별 롤아웃
1. 내부 알파 (1주)
   - 핵심 예약 3모드 + 안전장치 + 실패 복구 플로우 검증
2. 비공개 베타 (30일)
   - KPI 측정, 플랫폼별 권한/알림/절전 이슈 집중 개선
3. GA 준비 (2주)
   - 안정성/문구/온보딩 정리, 설치 패키지/서명/배포 문서 확정

### 운영 체크리스트
- Windows/macOS 패키징 및 코드 서명
- 권한 요청 문구 로컬라이징
- 장애 코드 사전 및 사용자 가이드 정비
- FAQ/헬프(취소 경로, 오작동 방지) 제공

### 디자인 문서 연계를 위한 샘플 이미지 콘셉트
1. 예약 생성 3-스텝 화면(모드 선택 → 조건 입력 → 예약 준비/활성화 확인)
2. `예약됨` 상태 대시보드(남은 시간/취소/미루기 강조)
3. 프로세스 선택기(새로고침/권한 안내/한계 설명)
4. 사전 알림 배너/토스트(10/5/1분, 정보형 알림 + 앱/트레이 액션 경로 안내)
5. 실패 복구 화면(권한 문제/명령 실패/재시도 CTA)

## Consistency Checklist (최종)
| 점검 항목 | 결과 | 근거 위치 |
| --- | --- | --- |
| Final Grace(기본 60초 + 설정 15~300초) | 통과 | `PRD > 안전장치 요구사항`, `DESIGN_GUIDE > Safety-first UX 규칙`, `USE_CASE > Business Rules` |
| Quit when Armed(BLOCK_AND_CHOOSE) | 통과 | `PRD > 안전장치 요구사항`, `IA > Navigation Structure`, `USE_CASE > UC-05` |
| process-exit pre-alert 정책(사전 알림 없음) | 통과 | `PRD > 기능 2`, `DESIGN_GUIDE > 사전 알림 패턴`, `USE_CASE > UC-06` |
| Snooze 범위(1..1440) | 통과 | `PRD > 안전장치 요구사항`, `USE_CASE > UC-05/Business Rules`, `DESIGN_GUIDE > Cancel/Snooze 패턴` |
| History 한도(저장 250 vs UI 렌더 120) | 통과 | `PRD > 보존 정책`, `DESIGN_GUIDE > History/Logs`, `USE_CASE > Data Requirements` |
| Notification info-only | 통과 | `PRD > 안전장치 요구사항`, `DESIGN_GUIDE > 알림센터 차이`, `USE_CASE > Actor Definitions/UC-06` |

## Open Questions
| 불확실성 | MVP 영향 | 권장 의사결정 |
| --- | --- | --- |
| v1.1에서 다중 활성 스케줄을 허용할지 | 상태 충돌/예외 복잡도 증가 | MVP와 v1.1 초기까지는 `단일 활성 스케줄` 유지 후, 실제 수요 데이터로 재평가 |
| 관리형 디바이스(기업/학교)에서 종료 권한 제한 대응 범위 | 실패율 증가 및 지원 비용 증가 | MVP는 `가이드 중심 지원`으로 제한하고, 정책 우회는 제공하지 않음 |
| OAuth/Gmail 실연동을 도입할지 | 인증/보안/QA 범위 크게 확대 | 현재 MVP 코드는 모의 연결만 제공. 실연동은 별도 제품/보안 결정 후 v1.1+ 검토 |
| 로컬 우선 KPI 수집에서 익명 리포트 제출 기본값 | MAU/WAU 집계 신뢰도에 영향 | 기본값은 `수동 제출`로 두고, 명시 동의 시에만 반자동 제출 제공 |
| 종료 전 경고 강도 개인화 여부 | UX 일관성 vs 사용자 선호 충돌 | MVP는 시간 기반 10/5/1분 + 최종 경고 기본 60초(설정 15~300초)로 운영, v1.1에서 프로필별 프리셋 도입 |


