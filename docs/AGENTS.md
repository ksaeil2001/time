# DOCS KNOWLEDGE BASE

## OVERVIEW
- `docs/` is the documentation control plane: canonical product policy, runbook operations, and archive/deprecated boundaries.
- This directory defines what is normative versus reference-only. Keep this distinction explicit in every edit.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Policy/scope acceptance changes | PRD_MVP_v1.0.md | Product requirements and non-negotiables |
| UX copy/accessibility/layout policy | DESIGN_GUIDE_MVP_v1.0.md | UI safety and interaction constraints |
| State transitions and edge cases | USE_CASE_MVP_v1.0.md | Lifecycle, timing, and exception semantics |
| Route and information architecture | IA_MVP_v1.0.md | Screen flow and IA contract |
| Operational workflow and verification | RUNBOOK.md | Verify pipeline, handoff, doc-sync rules |
| Discovery entrypoint | README.md | Fast links to canonical, archive, and artifacts |

## CONVENTIONS
- Update canonical docs only for as-built behavior; avoid speculative/planned wording.
- Keep policy ownership singular: PRD/DESIGN_GUIDE/USE_CASE/IA each own one concern.
- Merge process or execution guidance into `RUNBOOK.md` instead of creating new operational docs.
- Keep links to artifact outputs under `artifacts/verification` and `artifacts/handoff` accurate.

## ANTI-PATTERNS
- Adding a new policy/process markdown file when existing canonical docs or RUNBOOK can absorb the change.
- Writing contradictory guidance across canonical docs for the same behavior.
- Treating `docs/archive` content as current source of truth.
- Expanding `docs/deprecated` stubs into active policy text.

## NOTES
- Korean-first user safety language should remain consistent with UI copy and runbook wording.
- If implementation and docs diverge, verify code/commits first and record uncertainty in handoff artifacts.
