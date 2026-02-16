# SKILL: MVP 문서 동기화 (Code → PRD/Design/UseCase/IA)

## 목적 (Goal)
개발 과정에서 코드가 변경되어 문서(4종)가 뒤처졌을 때,
**현재 레포의 “as-built 동작”을 기준으로** 다음 문서 4개를 **일관되게 수정**한다.

- docs/PRD_MVP_v1.0.md
- docs/DESIGN_GUIDE_MVP_v1.0.md
- docs/USE_CASE_MVP_v1.0.md
- docs/IA_MVP_v1.0.md

핵심 원칙:
- 문서는 “원하는 정책”이 아니라 **지금 코드가 실제로 하는 일(as-built)** 을 1차로 반영한다.
- 다만, 정책/스펙과 코드가 다르면 문서에 **GAP(코드 변경 필요)** 로 명확히 남긴다.
- “as-built vs policy”를 섞지 않는다. (문서 신뢰성 유지)

---

## 비목표 (Non-goals)
- 기능 추가/리팩터링/버그 픽스 등 **코드 변경 금지**
- 실제 OS 종료를 유발하는 테스트/명령 실행 금지
- 문서의 톤/브랜딩을 전면 개편(필요 최소 변경만)
- 외부 서비스(OAuth 등) 설계 과다 확장 (현재 구현 범위 밖이면 "mock/미구현"으로 명시)

---

## 안전 가드레일 (Safety Guardrails)
- `shutdown`, `pmset`, AppleScript shutdown, `taskkill` 등 시스템 종료/전원 관련 커맨드 실행 금지
- 앱을 실행하더라도 **simulateOnly** 등의 안전 플래그를 임의로 해제하거나 실제 종료를 유발하는 조작 금지
- 테스트는 “코드 읽기/빌드 체크/정적 분석” 중심으로만 한다

---

## 입력 (Inputs)
- Repo root (현재 작업 디렉토리)
- 대상 문서 4개 경로
- 코드 소스:
  - 프론트: src/** (특히 App.tsx, api.ts, types.ts, App.css)
  - 백엔드: src-tauri/src/** (특히 lib.rs, main.rs 등)

---

## 출력 (Outputs)
1) 문서 4개 수정(diff 발생)  
2) 변경 요약 리포트(최종 메시지에 포함):
   - Doc Change Summary Table (파일/섹션/변경/근거/영향)
   - Remaining Gaps Table (문서-코드 불일치 중 “코드 변경 필요” 항목)
   - Cross-doc Consistency Check 결과

---

## 수행 절차 (Steps)

### Step 0) 스냅샷/범위 확인
- 수정 대상 파일이 존재하는지 확인한다.
- 반드시 “문서 4개만” 수정한다(다른 파일은 변경하지 않음).

권장 커맨드:
- `git status`
- `ls docs`
- `rg -n "PRD|MVP v1.0|자동 종료|Schedule" docs -S`

---

### Step 1) as-built 사실(FACT) 수집: “코드가 실제로 하는 것”
다음 항목별로 **코드 근거(파일 경로 + 라인)** 를 모은다.
라인은 `nl -ba` 또는 에디터 라인 번호 기준으로 캡처 가능해야 한다.

#### 1-A. 라우팅/IA
- 라우트 목록(해시 라우팅/쿼리 파라미터 포함)
- 사이드바/진입점(온보딩 리다이렉트, unknown route fallback 포함)
- 트레이/메뉴바 항목 라벨과 동작(Quick Start/Cancel/Snooze/Quit/Open 등)

권장 탐색:
- `rg -n "KNOWN_PATHS|/dashboard|/schedule/new|onboarding|hash" src -S`
- `rg -n "tray|menu|Quick Start|Quit|Snooze|Cancel|Open Window" src-tauri/src -S`

#### 1-B. 상태머신/스케줄 엔진
- 상태 enum(실제로 쓰는 상태 vs 문서에만 있는 상태)
- 모드 enum(카운트다운/특정시각/프로세스 종료)
- tick 주기/스케줄 평가 기준
- final warning(그레이스) 진입/만료/취소/미루기 동작
- reboot/resume 정책(앱 재시작 시 active 복구 여부)

권장 탐색:
- `rg -n "armed|finalWarning|pre_shutdown|failed|cancel" src src-tauri/src -S`
- `rg -n "tick|scheduler|trigger_at|final|grace" src-tauri/src -S`
- `rg -n "load_store|persist|scheduler-state.json|history" src-tauri/src -S`

#### 1-C. ProcessExit(프로세스 감시) 구현 디테일
- 요청 스키마: selector(pid/name/executable/cmdlineContains 등) + stableSec clamp
- 실행 여부 판정 알고리즘(우선순위, fallback, 동명이인 리스크)
- process-exit에서 preAlerts가 실제로 동작하는지 여부
- final warning 이후 프로세스 재등장 시 rollback 존재 여부
- snooze가 process-exit에서 감시 유지/모드 전환/selector 제거 중 무엇을 하는지

권장 탐색:
- `rg -n "process|ProcessExit|selector|cmdline|executable|stable" src-tauri/src -S`
- `rg -n "is_process_running|process_tree|tracked" src-tauri/src -S`

#### 1-D. UX 카피/설정/제어 경로
- 버튼/라벨/경고 문구(특히 위험 액션: Arm, Cancel, Snooze, Quit)
- 설정 화면: simulateOnly/알림 임계값/final warning seconds 등
- 히스토리 이벤트 타입과 UI 노출 형태(raw인지 매핑인지)

권장 탐색:
- `rg -n "simulate|final warning|threshold|10m|5m|1m" src -S`
- `rg -n "eventType|history|cancelled|postponed|failed" src src-tauri/src -S`

---

### Step 2) 문서별 업데이트 전략
문서는 **“as-built alignment” 섹션을 최우선으로 업데이트**한다.
정책/요구사항이 as-built와 다르면, 문서에 “Gap/Decision Needed” 표로 분리한다.

#### 2-A. IA_MVP_v1.0.md 업데이트 규칙
- Site Map/Navigation/URL structure는 “현재 라우트”가 기준
- Component Hierarchy는 실제 AppShell 구조/레이어 기준
- Edge Cases는 코드에 존재하는 분기만 반영 + 미지원은 “미지원”으로 명시
- Open Questions는 ‘결정이 필요한 정책’만 남김(이미 구현된 것은 제거)
- 반드시 `last_synced`(날짜/커밋) 기록
  - 커밋 해시 확인 가능하면 포함, 불가하면 N/A 명시

#### 2-B. PRD_MVP_v1.0.md 업데이트 규칙
- “MVP 포함 범위/Out of scope”를 as-built에 맞춰 재정렬
- 인터페이스 계약(types/state/mode)을 코드와 1:1로 맞춤
- KPI/목표는 유지하되, 구현 없는 기능은 “mock/미구현”으로 명확화
- 수용 기준/테스트 케이스에서 “현재 코드로 검증 가능한 것”과 “향후 코드 변경 필요”를 분리

#### 2-C. USE_CASE_MVP_v1.0.md 업데이트 규칙
- UC의 본 흐름/대안 흐름/예외 흐름을 코드 동작 기준으로 수정
- 상태 전이표는 실제 enum/전이만 사용
- 알림 액션(가능/불가)와 폴백(앱 배너/트레이)을 as-built에 맞춤
- process-exit의 snooze, final warning rollback 등은 실제 구현대로 서술

#### 2-D. DESIGN_GUIDE_MVP_v1.0.md 업데이트 규칙
- 문구/마이크로카피 가이드는 현재 UI 문자열과 불일치 시 “권장(TO-BE)”로 남기되,
  “현재(as-built)” 섹션에서 실제 문자열/문제점도 명시한다.
- 레이아웃 컴포넌트/브레이크포인트/최소 창 크기 등은 실제 CSS/구현 근거로 업데이트
- 접근성 체크리스트는 유지하되, 미구현 항목은 “현재 미구현” 체크 + 구현 포인트 명시

---

### Step 3) 교차-일관성(Cross-doc Consistency) 검사
문서 4개 간 다음 항목이 동일해야 한다:

- 라우트/쿼리 값 표기: `specific-time`, `process-exit` 등
- 내부 모드/상태 명명: snake_case/camelCase/enum 값
- Final Grace 정책(초), 알림 임계값(10/5/1) 기본값
- 히스토리/저장 정책(파일명, 최대 보관 수)
- process identity 정책(우선순위/강등 시 degraded 이벤트 등)
- 트레이 메뉴 라벨과 동작

검사 방식:
- 문서 전체에서 키워드 grep 후 불일치 찾기
  - `rg -n "process-exit|process_exit|specific-time|specific_time|final" docs -S`

---

### Step 4) 변경 반영(문서 수정)
- 문서의 구조/목차를 최대한 유지하면서 “내용만” 업데이트한다.
- 대규모 재작성 금지. 꼭 필요한 곳만 수정한다.
- 표/리스트는 markdown 깨지지 않도록 유지한다.

---

### Step 5) 최종 리포트 작성(필수)
최종 응답에는 아래 3개를 포함한다.

#### 5-A. Doc Change Summary Table
| File | Section | What changed | Why (as-built evidence: file/line) | Risk / User impact |

#### 5-B. Remaining Gaps Table (needs code change)
| Gap | Where found (doc + code evidence) | Risk | Recommended fix direction | Rationale |

#### 5-C. 교차 일관성 체크 결과
- 정렬 완료 항목 bullet list
- 남은 불일치 bullet list(있으면)

그리고 마지막에 반드시 명시:
- “코드 변경 없음”
- “실제 종료 유발 테스트/명령 실행 없음”
- “문서 4개만 수정”

---

## 품질 기준 (Acceptance Criteria)
- ✅ 문서 4개만 수정되었고, 코드 diff는 0이어야 한다.
- ✅ 각 핵심 변경에는 코드 근거(파일+라인)가 붙어야 한다.
- ✅ as-built vs policy gap이 섞이지 않고 표로 분리되어야 한다.
- ✅ 4문서 간 용어/숫자/정책이 상호 일관되어야 한다.
- ✅ 위험 동작(종료/취소/미루기/quit)의 사용자 경로가 명확히 문서화되어야 한다.

---

## 참고 (Optional): context7 사용 가이드
- “코드가 무엇을 한다”가 아니라 “표준 패턴/권장 UX” 근거가 필요할 때만 context7을 쓴다.
  예: Tauri tray, React Router, ARIA dialog 패턴 등.
- 단, as-built 동기화가 목적이므로 **외부 문서 인용이 as-built를 덮어쓰면 안 된다.**
