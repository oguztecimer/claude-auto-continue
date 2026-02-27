# Retrospective

## Milestone: v1.0 — MVP

**Shipped:** 2026-02-27
**Phases:** 4 | **Plans:** 9

### What Was Built
- Rate-limit detection engine with ANSI stripping, rolling buffer, 3-format timestamp parsing
- Timed resume scheduler with wall-clock anchoring and safety buffer
- EPIPE-safe PTY write wrapper for graceful dead-process handling
- Four-state PTY orchestrator automating detect-wait-resume cycle
- Live status bar with color-coded states and centered countdown card
- Installable CLI with dual aliases (claude-auto-continue / cac)

### What Worked
- TDD approach (RED/GREEN) produced clean, well-tested modules
- Pure logic modules first (Phase 1), then PTY integration (Phase 2) — testing was easy
- Dependency injection (spawnFn, onExit) eliminated module mocking pain
- Private class fields (#field) for encapsulation — consistent pattern across all modules

### What Was Inefficient
- Multi-session scope (MULT-01 through MULT-04) was planned, researched, and then dropped during Phase 3 discussion — wasted roadmap/requirements effort
- STATE.md total_phases counter was wrong after Phase 2 completion (tool counted disk directories, not roadmap phases)

### Patterns Established
- Constructor options bag with optional overrides for all side effects
- Dead-flag pattern (markDead() + isDead getter) for safe resource cleanup
- process.stderr.write() for diagnostic output (never console.log which pollutes PTY)
- Raw ANSI escapes over TUI libraries — zero new dependencies

### Key Lessons
- Discuss scope with user BEFORE creating requirements — the multi-session feature was assumed, not validated
- Keep the tool minimal — user explicitly preferred simplicity over features

---
