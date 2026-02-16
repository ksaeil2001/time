# Auto Shutdown Scheduler — Codex Project Instructions (AGENTS.md)

## Project context
- This repo is a safety‑critical desktop app (Tauri + React/TS + Rust) that can trigger OS shutdown.
- Treat any change that could cause an unexpected shutdown, block cancel paths, or reduce warning visibility as HIGH RISK.

## Source of truth (must follow)
When judging correctness or UX, follow these documents (in this order):
1) PRD_MVP_v1.0.md (product requirements, safety rules)
2) DESIGN_GUIDE_MVP_v1.0.md (layout/UX/accessibility, safety UX rules)
3) USE_CASE_MVP_v1.0.md (flows, edge cases, failure handling)
4) IA_MVP_v1.0.md (routes, navigation, information architecture)

If file paths differ, locate by filename.

## Non‑negotiables (do not break)
- Explicit confirmation before entering ARMED (never arm silently).
- Cancel/Snooze must remain easy to access (UI + overlay + tray/menu bar paths).
- Always disclose both: exact shutdown time AND remaining time.
- Final grace period (60s) must remain actionable (cancel/snooze still possible).
- Single active schedule policy must remain consistent across entry points.

## Default behavior for Codex in this repo
- Prefer minimal, targeted diffs. Do not refactor broadly unless asked.
- Do not change user‑visible behavior or safety policy unless the user explicitly requests it.
- If you must propose behavior changes (e.g., fixing a safety bug), propose as a PATCH PLAN first.

## Repo-wide code review default
- If the user asks for “전체 코드 리뷰 / full repo review / audit”, use the skill: `$full-repo-review`.
- Otherwise, for small reviews: provide
  - (1) findings grouped by severity (P0/P1/P2),
  - (2) evidence (file path + function/component),
  - (3) concrete recommendations,
  - (4) QA checklist.

## Running commands
- Prefer read-only inspection. Avoid commands that mutate the repo unless necessary.
- If you modify code: run appropriate format/lint/typecheck/tests that exist in this repo (inspect package.json and Cargo configs first).

## Output quality bar
- No hand-wavy statements. Always include code evidence.
- Prioritize user safety and reliability over cleverness.
