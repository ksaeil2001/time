---
name: spec-doc-sync
description: Review the repo implementation (Rust/Tauri + React/TS) and synchronize MVP spec docs (PRD, Design Guide, Use Case, IA) to match as-built behavior. Apply minimal doc diffs, keep cross-doc consistency, and never “paper over” safety regressions—flag them as decision-required instead.
---

# Spec Doc Sync Skill (MVP) — PRD/Design/UseCase/IA 업데이트

## Goal
코드를 “as-built(현재 구현)” 기준으로 리뷰한 뒤, 다음 4개 문서를 **개발 과정에서 변경된 실제 동작에 맞게 업데이트**한다.

Targets (locate by filename, do not assume paths):
1) PRD_MVP_v1.0.md
2) DESIGN_GUIDE_MVP_v1.0.md
3) USE_CASE_MVP_v1.0.md
4) IA_MVP_v1.0.md

> IMPORTANT: 이 프로젝트는 **OS 종료를 실행하는 safety‑critical 앱**이다.
> 문서 업데이트는 “사용자가 믿고 따라도 안전한 설명”이어야 한다.
> 안전/정책 위반을 “문서 수정으로 정당화”하지 말고, 반드시 Decision Required로 격리한다.

---

## Ground rules (Non‑negotiables)
### 1) Minimal Diff
- 문서 구조(TOC/헤딩/테이블 형식)는 최대한 유지.
- 바뀐 부분만 국소적으로 수정한다.
- 불필요한 문장 리라이트 금지.

### 2) Consistency
- 동일 개념은 4개 문서에 동일한 용어/값으로 반영한다.
  - ScheduleMode / 상태명 / 라우트 / 트레이 항목 / Snooze 정책 / Final grace / 저장 정책 등

### 3) Safety integrity (do not “paper over”)
다음 종류의 변경은 **문서만 바꿔서 합리화 금지**:
- 명시적 Arm 확인(confirm_before_arm) 제거/우회
- Final grace(최종 유예) 축소/취소 불가
- Cancel/Snooze 접근성 저하
- 재시작 후 자동 복구(정책 위반)
- 예기치 않은 종료(무동의 종료 가능성)

이런 항목은 “Spec vs Code Gap”에 남기고 **Decision Required**로 표기한다.
(문서를 코드에 맞추려면 제품 결정이 필요함)

---

## Workflow

### Step 0) Locate docs + capture sync stamp
- Search repo for the 4 filenames.
- Determine current commit hash (if git exists) using `git rev-parse --short HEAD`.
- Determine current date (ISO) using `date -I` (or platform equivalent).
- Add (or update) a single line near the top of EACH target doc:

  `> Last synced with implementation: YYYY-MM-DD (commit abc123)`

If the docs already have a “version” line (MVP v1.0), do NOT rename versions unless explicitly asked.

---

### Step 1) Build “As‑Built Map” (code → behaviors)
Inspect code and extract “truth statements” with evidence anchors:

Required areas to scan:
- Scheduler state machine: states, transitions, timing model (tick cadence), trigger logic
- ProcessExit: selector schema, matching policy, stability window behavior, revalidation behavior
- Notifications/pre-alerts/final warning: thresholds, actions, cancelability
- Snooze: for each mode, what changes and what persists
- Tray/menu bar: quick start, quit behavior, open/show countdown
- Storage/persistence: state file name, atomicity, load failures, resume policy
- Shutdown execution: platform commands, simulateOnly, failure handling
- Integrations: Google/OAuth/email (real vs mocked), token storage behavior

For EACH truth statement, collect:
- Behavior summary (1–2 lines)
- Evidence: file path + function/component + key condition(s)
- User impact / spec impact tag

---

### Step 2) Diff classification (decide how to update docs)
For each mismatch between docs and code, classify into exactly one bucket:

**A) Doc Outdated (safe to update)**
- Implementation is consistent and does not reduce safety guarantees.
- Example: UI list shows top 120 items; default stable sec changed; naming tweaks.

**B) Decision Required (policy/safety)**
- Updating docs would relax a safety rule or contradict explicit product policy.
- Do NOT silently modify normative policy text.
- Instead: add a “⚠️ Decision Required” callout in the relevant doc section + include in final report.

**C) Code Bug vs Spec (do not update docs to match)**
- Code appears to violate stated safety/UX rules and likely needs fixing.
- Keep spec text; add “Known Implementation Gap” note + include recommended fix plan (but do not edit code in this skill).

---

### Step 3) Apply doc updates (edit the 4 docs)
Update each doc with minimal diffs, using the As‑Built Map.

#### 3.1 PRD_MVP_v1.0.md update checklist
- MVP In/Out scope: reflect actually shipped vs not shipped (especially Optional features).
- Interfaces/Types tables:
  - Update ScheduleMode / ScheduleState / ProcessSelector fields to match code+frontend payloads.
- Policies:
  - If code deviates from confirm_before_arm / final grace / reboot policy, mark Decision Required (do not rewrite policy away).
- Test cases:
  - Update acceptance scenarios to match current behavior, AND add new edge cases discovered in code.

#### 3.2 DESIGN_GUIDE_MVP_v1.0.md update checklist
- Page Implementations:
  - Update Watch Process screen requirements if UI differs (search/filter, item caps, warnings, sentinel templates).
- Interaction Patterns:
  - Update Snooze semantics per mode.
  - Update Final Grace behavior (including revalidation rules) — if code does not revalidate, mark as Gap/Decision.
- Accessibility:
  - If current UI lacks aria-live / focus-visible requirements, keep requirement (do not delete); optionally add “current status” note.

#### 3.3 USE_CASE_MVP_v1.0.md update checklist
- State transition table:
  - If implementation uses a simplified state model, add an “Implementation mapping” subsection:
    - Spec state → current implementation representation
- UC flows:
  - Update UC-04/UC-05/UC-06 with the actual runtime behavior (process-exit stable window, snooze, revalidation, notifications).
- Exception handling:
  - Align failure handling with what code actually does; if missing recovery UI/state, mark as Gap.

#### 3.4 IA_MVP_v1.0.md update checklist
- Site map & routes:
  - Ensure routes match real router configuration.
- Navigation structure:
  - Tray/menu items should match what exists.
- Edge cases:
  - Update with as-built behavior (e.g., process list limits, matching policy, resume policy).

---

### Step 4) Cross-doc consistency pass (mandatory)
After edits, do a consistency sweep:
- Terminology: `process-exit` vs `process_exit` vs `ProcessExit` — keep doc convention.
- Schedule states: same set across PRD/UseCase/Design (or mapping noted).
- Snooze policy: same across PRD/UseCase/Design/IA.
- Final grace: same constant or same configurable range across docs.
- Storage: same file name and retention across docs.
- Tray/menu bar: same items + same semantics across IA/Design/UseCase.

---

## Required Output (MUST)
When done, output a “Doc Sync Report” in the assistant response (not as a new repo file unless asked):

### 1) Summary
- What changed in docs (high-level bullets)
- Count of changes by bucket: A/B/C

### 2) Decision Required list (bucket B)
For each item:
- What the docs said
- What code does
- Why it’s policy/safety significant
- Proposed wording options (Option 1: keep spec + fix code, Option 2: update spec) — but do not enforce.

### 3) Known Implementation Gaps (bucket C)
- List gaps, impact, suggested fix plan (no code edits here)

### 4) Patch overview
- Files changed (4 docs)
- Key sections updated per file

---

## Guardrails (MUST follow)
- Do NOT change code in this skill. Only docs.
- Do NOT delete safety requirements from docs. If not implemented, mark as gap.
- Do NOT introduce new product features in docs that code does not have.
- Do NOT claim OAuth/token storage is implemented if it’s mocked.
- Keep Korean copy style consistent with existing docs (unless docs are bilingual).
- Never hide user-risk behaviors: document them clearly.

---

## Definition of Done
- All 4 docs reflect as-built behavior for non-policy items.
- Any safety/policy divergence is explicitly labeled as Decision Required.
- Cross-doc terminology is consistent.
- Each doc has a “Last synced with implementation” stamp with date + commit.
