## 자동 종료 스케줄러 IA (MVP v1.0)

> Last synced with implementation: 2026-02-16 (commit N/A - git metadata unavailable)

## As-built Alignment
- last_synced: 2026-02-16 (commit N/A - git metadata unavailable)
- key changes (변경 이유/영향):
  - 라우팅은 hash 기반이며 `/schedule/new`에서 `mode=countdown|specific-time|process-exit` 쿼리를 사용한다.
    영향: 라우트 문서는 해시 URL과 kebab-case 모드 토큰을 기준으로 표준화한다.
  - Sidebar/Route 라벨은 `src/constants/copy.ts` 맵과 동일하게 `대시보드`, `새 예약`, `활성 예약`, `이력`, `일반 설정`, `알림 설정`, `Google 연동`, `도움말`을 사용한다.
    영향: IA 내 라벨 표기를 코드 문자열과 1:1로 고정한다.
  - TopStatusBar와 QuickActionFooter는 온보딩을 제외한 모든 라우트에서 고정 노출되며, 활성 예약 중에는 라우트 이동과 무관하게 취소/미루기 경로가 유지된다.
    영향: `/history`, `/settings/*`, `/help`에서도 안전 액션이 숨겨지지 않는다.
  - QuickActionFooter는 Idle에서 `새 예약 만들기` + 비활성 `취소/10분 미루기` + 비활성 `미루기(분)` 입력을 표시한다.
    영향: Idle `미루기(분)` 입력은 숨김이 아니라 비활성 노출로 정의해야 한다.
  - 트레이/메뉴바는 `Quick Start Last Mode`, `Show Countdown`, `Open Window`, `Cancel Schedule`, `Snooze 10m`, `Quit App` 순서의 고정 메뉴를 제공한다.
    영향: Idle에서도 `Cancel/Snooze` 메뉴는 비활성화되지 않고 no-op/요청 무시로 처리된다.
  - ProcessExit 프로세스 목록은 새로고침 중심으로 동작하며 UI 상한은 120개, 정렬은 name→pid, 검색 입력은 미제공이다.
    영향: IA의 Watch Process 탐색 흐름은 "검색"이 아닌 "정렬+새로고침" 패턴을 따른다.
  - shell 계열 프로세스는 `실행 파일 경로` 또는 `명령줄 토큰` 없이 Arm할 수 없고, UI/백엔드에서 모두 차단된다.
    영향: 오탐 방지 제약이 입력 단계에서 강제된다.
  - process-exit 감시 selector가 손상되면 `NO_FAIL_OPEN_PROCESS_EXIT` 정책으로 활성 예약을 즉시 안전 중단한다.
    영향: fail-open 없이 예약이 취소되며 재선택 안내 배너가 노출된다.
- P0 Policy(목표):
  - `Armed` 상태 Quit 요청은 `BLOCK_AND_CHOOSE`로 처리한다.
  - Final Grace는 기본 60초, 설정 범위 `15~300초`를 사용한다.
  - 사전 알림 10m/5m/1m은 시간 기반 모드 전용이며 `process-exit`는 완료 감지 후 즉시 Final Warning으로 진입한다.
  - `cmdlineContains` 원문은 저장/로그에 남기지 않고 마스킹/해시 값만 허용한다.
- As-built note(현재 구현):
  - Tray/App Quit은 `armed`/`finalWarning`에서 `quit_guard_requested` 모달을 통해 `예약 취소 후 종료` / `백그라운드 유지` / `돌아가기`를 요구한다(정책과 일치).
  - `process-exit` 사전 알림 정책(사전 알림 없음 + Final Warning 직행)은 구현과 일치한다.
  - 상태 파일에는 `active.processSelector` 및 `lastScheduleRequest.processSelector`의 `executable`, `cmdlineContains` 원문이 저장될 수 있다(정책과 불일치).

## Summary
- 단일 창 데스크톱 앱(Tauri + React) 기준
- SPA 스타일 in-app route 기준 정보 구조 채택
- 단일 활성 예약 정책
- 창 닫기(X) 시 종료가 아닌 트레이/메뉴바 최소화
- `Armed` 상태 Quit은 즉시 종료가 아니라 선택 모달(`예약 취소 후 종료` / `백그라운드 유지`)을 거침
- 최종 경고 기본값은 60초이며 설정에서 15~300초로 변경 가능
- 프로세스 종료 판정은 `PID/트리 -> 추적 PID -> 고급 매칭(executable/cmdlineContains) -> name fallback` 순서
- process-exit는 10m/5m/1m 사전 알림 없이 완료 감지 후 final warning으로 즉시 진입
- process-exit Snooze는 감시를 유지하고 final warning 진입만 지연(`snoozeUntilMs`)
- Notification은 info-only이며 액션 실행은 앱/오버레이/트레이 경로로 제한
- History는 저장 250(FIFO), UI 렌더 120(페이지 단위)로 분리
- ProcessExit 화면에서 센티널 템플릿(Windows PowerShell/macOS shell)과 실행 가이드를 제공(앱 직접 spawn 미지원)
- Google 연동은 옵션이며 현재 구현은 모의 연결 상태 토글만 제공
- 모드 명명 규칙: URL 쿼리는 kebab-case(`specific-time`, `process-exit`), 내부 타입은 camelCase(`specificTime`, `processExit`)

## State Model Layers (IMP-05)
| 계층 | 상태 |
| --- | --- |
| UI 표기 상태 | `대기 중(예약 없음)`, `예약됨(Armed)`, `최종 경고(Final warning)`, `종료 명령 실행 중(Shutting down)` |
| 저장 상태 | `active=null`, `active.status=armed|finalWarning`, `history.status=completed|failed|cancelled` |
| 내부 실행 상태 | `idle -> armed -> finalWarning -> shuttingDown` |

```text
IDLE -> ARMED -> FINAL_WARNING -> SHUTTING_DOWN -> HISTORY(completed|failed)
```

Glossary:
- `armed`: 사용자 확인 후 활성화된 예약 상태
- `finalWarning`: 종료 직전 개입 가능한 경고 상태
- `shuttingDown`: 내부 실행 단계(비영속)
- `watching_process`: process-exit 모드의 UI 파생 태그

## Site Map
```text
APP_ROOT
├─ /onboarding/welcome
├─ /onboarding/permissions
├─ /onboarding/safety
├─ /dashboard
├─ /schedule/new?mode=countdown|specific-time|process-exit
├─ /schedule/active
├─ /history
├─ /settings/general
├─ /settings/notifications
├─ /settings/integrations/google
└─ /help
```

## Navigation Structure
- 좌측 사이드바: 주요 화면 이동
- 상단 헤더: 라우트 제목 + 상태 제목(`대기 중(예약 없음)`/`예약됨`/`최종 경고`) + 남은 시간/종료 예정
- 하단 퀵 액션 바: 온보딩을 제외한 전 라우트에서 노출되며 Idle은 `새 예약 만들기` 중심, 활성 예약에서 `취소 → 10분 미루기 → 5/15분 미루기 → 입력 미루기` 순으로 제공
- 트레이/메뉴바: Quick Start Last Mode, Show Countdown, Open Window, Cancel Schedule, Snooze 10m, Quit App
- Quit 정책(구현): Armed/FinalWarning 상태에서 Quit 요청 시 선택 모달을 제공하고 처리 방식을 먼저 선택

QuickActionFooter 상태 규칙(IMP-08):
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

## URL Structure
- `/dashboard`
- `/schedule/new?mode=countdown`
- `/schedule/new?mode=specific-time`
- `/schedule/new?mode=process-exit`
- `/schedule/active`
- `/history`
- `/settings/general`
- `/settings/notifications`
- `/settings/integrations/google`
- `/help`

## Naming Mapping (IMP-06)
| URL 쿼리(kebab-case) | 내부 타입(camelCase) |
| --- | --- |
| `countdown` | `countdown` |
| `specific-time` | `specificTime` |
| `process-exit` | `processExit` |

신규 모드/라우트 템플릿:
- [ ] URL 토큰 추가(`/schedule/new?mode=...`)
- [ ] 내부 타입/enum 추가
- [ ] URL 파서 매핑 및 역직렬화 규칙 추가
- [ ] PRD/Design/Use-Case/IA 동시 갱신

## Responsive Policy (IMP-07)
- MVP 최소 창 크기: `980x700`
- 활성 브레이크포인트: `standard(980+)`, `desktop(1200+)`, `wide(1440+)`
- `compact(480)` 구간은 현재 구현에서 도달 불가하므로 MVP IA에서 제외(v1.1 후보)

## Component Hierarchy
```text
AppShellV2
├─ SidebarNav
├─ TopStatusBar
├─ MainCanvas(Route Content)
│  ├─ OnboardingViews
│  ├─ DashboardView
│  ├─ ScheduleBuilderView
│  ├─ ActiveScheduleView
│  ├─ HistoryView
│  ├─ SettingsViews
│  └─ HelpView
├─ RightPanel(Summary/Detail)
├─ QuickActionFooter
├─ DetailDrawer
├─ ConfirmModal / QuitGuardModal / FinalWarningOverlay
└─ TrayMenuAdapter
```

## Edge Cases
- 프로세스 목록 비어 있음: Empty state + 새로고침 + 시간 기반 전환 CTA
- shell 계열 동명이인: `Executable path` 또는 `Cmdline token` 미입력 시 Arm 차단 + 경고 배너 노출
- 고급 매칭 정보 접근 불가: name fallback 허용 + degraded 이벤트 기록
- process-exit 감시 selector 손상: `failed` 이벤트(`NO_FAIL_OPEN_PROCESS_EXIT`) 기록 후 스케줄 안전 중단
- final warning 중 프로세스 재등장: 즉시 `armed` 롤백 후 종료 보류
- process-exit 사전 알림: 시간 기반 모드와 달리 10m/5m/1m 사전 알림 없이 안정 구간 후 final warning으로 즉시 진입
- process-exit 대체 안내: `프로세스 종료가 감지되어 최종 경고가 시작되었습니다.` 문구 노출
- 권한/알림 차단: 경고 배너 + 트레이 폴백
- 시스템 시간/타임존 변화: specific-time 재정렬
- 절전/복귀: tick 재개 시 남은 시간 재계산
- 재시작 후 상태 복구: 자동 재개 미지원(`resume_not_supported` 이벤트 + 배너)
- 상태 파일 손상 복구 성공: 상단 배너 + `state_restored_from_backup` 이력
- 상태 파일 손상 복구 실패(백업 없음): 안전 모드 배너 + `state_parse_failed` 이력
- Google 연동(모의) 상태 저장 실패: 토글 롤백 + 오류 안내
- 프라이버시 정책(목표): cmdline 원문/전체 경로 평문 로그 금지, 마스킹/해시 값만 허용

## Assumptions
- 로컬 저장소(파일/로컬 DB)만 사용, 서버 DB는 사용하지 않음
- 기본 사전 알림(시간 기반): 10m/5m/1m
- Notification은 info-only이며 액션은 앱/오버레이/트레이에서만 실행
- 히스토리 저장 최대 250건(FIFO), UI 렌더는 페이지당 120건
- 최소 창 크기: 980x700
- 최종 경고 기본값 60초, 설정에서 15~300초 변경 가능
- `simulateOnly=true`일 때 TopStatusBar에 `테스트 모드` 배지를 노출하고 설정 화면에 `테스트 모드(실제 종료 안 함)` 토글 문구를 노출

## 문서 정본 규칙 (IMP-18)
- 정본 세트: `PRD_MVP_v1.0.md`, `DESIGN_GUIDE_MVP_v1.0.md`, `USE_CASE_MVP_v1.0.md`, `IA_MVP_v1.0.md`
- 공통 헤더 규칙: `Last synced with implementation` + `As-built Alignment`의 `Policy/As-built note` 분리 표기
- 중복 문서가 생기면 정본 링크를 포함한 `DEPRECATED` 헤더를 추가하고 `/archive`로 이동한다.

## Open Questions
- v1.1+에서 알림 액션 버튼 도입 여부(현재 MVP 정책은 info-only 유지)
- 배터리/절전 예외 규칙의 정책화 범위(강제 즉시 종료 vs 복귀 후 재확인)
- v1.2 이후 다중 활성 스케줄 확장 필요성 검증(기본값은 단일 활성 유지)





