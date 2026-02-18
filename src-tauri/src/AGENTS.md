# RUST CORE KNOWLEDGE BASE

## OVERVIEW
- `src-tauri/src` contains the runtime safety state machine, shutdown dispatch, process scanning, and scheduler loop.
- Highest-risk edits are any changes to arming/final-warning transitions, cancel/snooze timing, and OS shutdown command execution.

## STRUCTURE
src-tauri/src/
|- lib.rs          # Command handlers, persisted state, schedule lifecycle, shutdown dispatch, tray wiring
|- process_scan.rs # sysinfo-backed process matching and PID-tree tracking logic
|- scheduler.rs    # 1-second scheduler tick loop with panic containment
|- main.rs         # Tauri bootstrap entrypoint

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Schedule lifecycle transitions | lib.rs | `ScheduleStatus` flow and timing fields |
| Final warning + cancel/snooze safety | lib.rs | Maintain intervention path until deadline |
| Shutdown command behavior | lib.rs | Dry-run logging, OS-specific command line, abortability |
| Process-targeted trigger behavior | process_scan.rs | Selector normalization and fallback/degradation semantics |
| Tick robustness | scheduler.rs | Panic-safe loop and cadence guarantees |

## CONVENTIONS
- Preserve serde `camelCase` contracts for frontend compatibility.
- Keep simulation mode and execution history as first-class outputs, not debug-only traces.
- Prefer explicit state fields over inferred/implicit transitions in schedule handling.
- Keep process matching deterministic: normalized text/path comparisons, sorted PID outputs.

## ANTI-PATTERNS
- Dispatching shutdown before final-warning countdown reaches zero.
- Removing or delaying cancel/snooze effect during final-warning windows.
- Silent state transitions that bypass explicit user control points.
- Weakening dry-run audit trails that prove command intent without real shutdown.

## COMMANDS
```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```
