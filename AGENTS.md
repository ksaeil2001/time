# PROJECT KNOWLEDGE BASE

Generated: 2026-02-17 (Asia/Seoul)
Commit: db40591
Branch: main

## OVERVIEW
- Safety-critical desktop scheduler (Tauri + React/TypeScript + Rust) that can issue OS shutdown commands.
- Highest risk area: any change that can reduce cancellation visibility, arm silently, or execute shutdown unexpectedly.

## STRUCTURE
time/
|- src/                  # Frontend app state, screens, safety actions, UI primitives
|  |- components/ui/     # Design-system primitives used across screens
|- src-tauri/src/        # Rust scheduler/state machine/process scan/shutdown dispatch
|- docs/                 # Canonical requirements + runbook + archive/deprecated governance
|- scripts/              # Verification and handoff-manifest automation
|- e2e/                  # Playwright end-to-end safety/accessibility flow

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Safety policy truth | docs/PRD_MVP_v1.0.md | Product non-negotiables and acceptance criteria |
| UX/accessibility safety | docs/DESIGN_GUIDE_MVP_v1.0.md | 3-second scan, 30-second rule, overlay constraints |
| Flow/state transitions | docs/USE_CASE_MVP_v1.0.md | Idle/Armed/FinalWarning semantics and edge cases |
| Route/information structure | docs/IA_MVP_v1.0.md | Navigation and screen-level IA |
| Frontend behavior | src/App.tsx | Main orchestration, overlays, quick actions, route rendering |
| Frontend contracts | src/types.ts, src/api.ts | Front-back schema and invoke wrapper |
| Backend scheduler logic | src-tauri/src/lib.rs | Core state machine, persistence, tray commands, shutdown execution |
| Backend process scan | src-tauri/src/process_scan.rs | Process matching and fail-safe scan rules |
| Verification pipeline | scripts/verify/run-verify.mjs | Ordered lint/typecheck/test/build/e2e logic |

## CODE MAP
- LSP codemap unavailable in this environment (missing typescript-language-server and rust-analyzer).
- Hotspot files from static analysis:
  - src/App.tsx (single-file frontend orchestrator)
  - src-tauri/src/lib.rs (single-file backend state machine)
  - scripts/verify/run-verify.mjs (verification policy automation)

## CONVENTIONS
- Source-of-truth order is fixed: PRD -> DESIGN_GUIDE -> USE_CASE -> IA.
- Keep diffs minimal and targeted; avoid broad refactor unless explicitly requested.
- Use as-built documentation: no speculative/planned statements in canonical docs.
- Verification-first workflow after code changes: typecheck/test/build + Rust tests as applicable.
- Canonical frontend scripts live in package.json; backend crate config in src-tauri/Cargo.toml.

## ANTI-PATTERNS (THIS PROJECT)
- Arm confirmation bypass (explicit confirmation before ARMED is mandatory).
- Hidden/removed cancel-snooze paths in any of: main UI, final-warning overlay, tray.
- Showing only relative or only absolute shutdown time (must show both).
- In Final Grace, disabling cancel/snooze before countdown expiry.
- Multi-schedule behavior violating single-active-schedule policy.
- Introducing new docs for policy/process when RUNBOOK consolidation says merge into existing docs.

## UNIQUE STYLES
- Safety language and UX copy are Korean-first and policy-specific.
- Test coverage intentionally mixes unit/policy/a11y/behavior + optional e2e.
- Simulation mode and dry-run traces are first-class safety artifacts, not secondary debug behavior.
- docs/deprecated is stub-only; docs/archive is snapshot-only; current truth lives in canonical docs + RUNBOOK.

## COMMANDS
```bash
npm run dev
npm run tauri dev
npm run lint
npm run typecheck
npm run test
npm run test:a11y
npm run test:e2e
npm run build
npm run verify
cargo test --manifest-path src-tauri/Cargo.toml
```

## NOTES
- Treat shutdown-command dispatch, final-warning timing, and cancel/snooze controls as high-risk code paths.
- If behavior/policy changes are requested, document intent and verify against canonical docs before editing.
- For full-repo audit requests, use $full-repo-review workflow.
