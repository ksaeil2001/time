---
name: full-repo-review
description: Use when the user requests a full repository code review / audit. Produce a structured report (P0/P1/P2, spec gaps, QA checklist) for a safety-critical auto-shutdown desktop app (Tauri + React/TS + Rust). Do not modify code unless explicitly requested.
---

# Full Repository Review Skill — Auto Shutdown Scheduler

## Goal
Perform a **full-repo code review** with a safety-first lens:
- correctness & safety (shutdown scheduling, cancelability, warnings)
- reliability (persistence, concurrency, edge cases)
- UX quality (layout consistency, accessibility, action discoverability)
- spec alignment (PRD/Design Guide/Use Case/IA)

Default output is a report; **no code edits** unless the user asks.

---

## Inputs / Sources to read first
1) PRD_MVP_v1.0.md
2) DESIGN_GUIDE_MVP_v1.0.md
3) USE_CASE_MVP_v1.0.md
4) IA_MVP_v1.0.md

Then locate key code entrypoints:
- Rust backend scheduler/state machine/process monitor/shutdown executor/persistence
- Frontend App shell, routing, schedule builder, active schedule, final warning overlay, settings, history
- Tauri bridge: invoke commands, dev/prod flags (simulateOnly), platform branches

If filenames/paths differ, search by keyword instead of assuming paths.

---

## Safety rubric (Severity)
### P0 (Must fix)
Any issue that can:
- cause unexpected shutdown without explicit consent,
- hide/remove/disable cancel/snooze paths,
- skip final grace or reduce warning visibility,
- corrupt/lose active schedule state,
- crash/brick the app during ARMED/final_warning.

### P1 (Should fix)
- spec mismatches that confuse users (time display, snooze policy, process-exit behavior)
- reliability gaps (race conditions, clock changes, sleep/resume drift)
- major UX inconsistencies (actions not consistently visible)

### P2 (Nice to have)
- maintainability refactors, dedup, naming, small perf wins, nicer UI polish

---

## Review checklist (what you MUST inspect)

### A) State machine correctness
- Does the code match the spec states and transitions?
- Confirm explicit ARM confirmation exists and cannot be bypassed.
- Confirm final grace period is always executed and still cancellable.

### B) ProcessExit monitoring correctness (high risk)
- Identity matching: PID reuse risk, name fallback risk, executable/path/cmdline availability
- Child process tree tracking cost/limits
- Re-validation during final warning (if target comes back, does the app still proceed?)
- Snooze semantics (does snooze keep process watching or switch modes?) — call out spec mismatch.

### C) Timing & system events
- Clock/timezone changes
- sleep/hibernate/resume and “time jump”
- wall-clock vs monotonic time usage

### D) Shutdown execution (OS-specific)
- Windows/macOS command correctness
- failure handling: user recovery path, logs
- dev/prod simulateOnly behavior and user clarity

### E) Persistence & history
- state file schema, corruption handling, atomic writes
- history size cap behavior (FIFO), log semantics
- privacy: do not store secrets in plain text

### F) Frontend architecture & UI/UX
- AppShell layout consistency
- Cancel/Snooze always discoverable (esp. overlay, narrow window, scroll)
- Forms: label/field alignment, consistent spacing scale
- Accessibility: focus ring, keyboard nav, aria labels, tabular-nums for countdown

---

## Required output format (MUST follow)

### 1) Executive Summary (5–10 lines)
- Top 3 risks (P0)
- Top 5 improvements (P1)
- Key spec gaps
- Recommended next steps (short)

### 2) Findings by Priority
Provide grouped lists: P0 / P1 / P2

For EACH finding, use this template:
- **Title**
- **Severity**: P0 | P1 | P2
- **Area**: backend | frontend | tauri_bridge | ux | storage | process_monitor
- **Evidence**: file path + function/component + short excerpt/description
- **Risk**
- **Recommendation**
- **Patch sketch**: only if it can be expressed as minimal change (otherwise provide a plan)

### 3) Spec vs Code Gap Table
A table with:
- Spec requirement
- Current implementation
- Impact (safety/UX/reliability)
- Recommendation + priority

### 4) Suggested Refactor / Fix Plan (task breakdown)
- Break work into 30–90 minute tasks
- Each task includes: files, verification steps, risk

### 5) QA Checklist (manual scenarios)
Include at minimum:
- min window size + resize
- sleep/resume
- clock/timezone change
- process-exit: normal exit / restart / same-name processes
- final warning actions
- shutdown failure paths

---

## Guardrails
- Do not edit code unless the user explicitly requests a patch.
- If you run commands, prefer read-only or safe checks (lint/test). Avoid destructive operations.
- When uncertain, state assumptions explicitly and propose how to verify quickly.
