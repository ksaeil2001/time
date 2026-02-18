# FRONTEND KNOWLEDGE BASE

## OVERVIEW
- React + TypeScript UI layer for safety-critical shutdown scheduling.
- `src/App.tsx` is the orchestration center for routes, overlays, quick actions, and runtime state updates.

## STRUCTURE
src/
|- App.tsx                 # Main orchestration (routing, actions, overlays, state sync)
|- api.ts                  # Tauri invoke wrapper and mock switching
|- types.ts                # Front-back contract types
|- policy.ts               # UI-level policy helpers and limits
|- mockScheduler.ts        # Browser-only scheduler mock for tests/e2e mock mode
|- components/ui/          # Reusable primitives and data display patterns
|- styles/design-system-v2.css  # Core design tokens/layout classes

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Final warning/soft countdown UX | App.tsx | Overlay + always-on-top + cancel/snooze action wiring |
| Schedule creation validation | App.tsx, policy.ts | Builder validation and mode-specific checks |
| Backend command bridge | api.ts | `invoke` command names and payload shape |
| Contract changes | types.ts | Keep aligned with Rust serde camelCase fields |
| UI primitive behavior | components/ui/*.tsx | Shared buttons, cards, tables, banners, form controls |
| Frontend behavior tests | App.behavior.test.tsx, a11y.test.tsx | Regressions for flow and accessibility semantics |

## CONVENTIONS
- Preserve action immediacy: cancel/snooze handlers must stop current countdown path immediately.
- Keep absolute + relative time visible together in active/final-warning contexts.
- Use existing primitives from `components/ui` before adding new component patterns.
- Keep `App.tsx` edits surgical; avoid broad route/component restructuring.
- Maintain Korean-first safety copy in user-visible status/action text.

## ANTI-PATTERNS
- Bypassing arm confirmation flow or arming implicitly.
- Removing cancel/snooze affordances from quick action bar or warning dialogs.
- Introducing divergent event labels/reason semantics without backend alignment.
- Splitting critical flow logic across many files without explicit request.

## COMMANDS
```bash
npm run typecheck
npm run test
npm run test:a11y
npm run build
```

## NOTES
- LSP may be unavailable locally; use test/build verification to guard changes when diagnostics cannot run.
- Treat `App.tsx` and `mockScheduler.ts` as flow-critical hotspots.
