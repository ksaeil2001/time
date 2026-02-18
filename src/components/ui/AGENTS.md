# UI PRIMITIVES KNOWLEDGE BASE

## OVERVIEW
- `src/components/ui` is the reusable primitive layer used by scheduling, warning, and history surfaces.
- Changes here are broad-impact: one prop or class change can alter multiple safety-critical interactions.

## STRUCTURE
src/components/ui/
|- Button.tsx, IconButton.tsx   # Action controls, including immediate/safety action affordances
|- Form.tsx                     # Inputs, selects, toggles, segmented controls
|- AlertBanner.tsx              # Contextual warning and status callouts
|- Card.tsx, SectionHeader.tsx  # Section framing and hierarchy
|- DataPatterns.tsx             # Resource/history/event list and table primitives
|- DetailDrawer.tsx             # Drill-down panel pattern
|- Icon.tsx, Badge.tsx          # Semantic/iconic status primitives
|- cn.ts                        # Class merge utility
|- index.ts                     # Public export surface

## CONVENTIONS
- Keep primitive APIs small and stable; prefer additive optional props over breaking renames.
- Maintain `className` passthrough and variant/size composition via existing `ui-*` class scheme.
- Preserve accessibility defaults (`type="button"`, `aria-*`, disabled/loading semantics).
- Update `index.ts` exports whenever adding/removing primitives to prevent private drift.

## ANTI-PATTERNS
- Embedding page-specific business logic into primitives.
- Introducing visual variants without corresponding design token/classes.
- Removing safety affordance props (for example `immediate`) used by critical actions.
- Changing primitive markup in ways that silently break test selectors or keyboard flow.

## VERIFY
```bash
npm run typecheck
npm run test
npm run test:a11y
```
