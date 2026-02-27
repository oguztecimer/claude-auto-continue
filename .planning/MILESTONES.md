# Milestones

## v1.0 MVP (Shipped: 2026-02-27)

**Phases completed:** 4 phases, 9 plans
**Codebase:** 2,117 lines TypeScript, 91 tests
**Timeline:** ~3.5 hours (same day)
**Commits:** 47

**Delivered:** A CLI tool that wraps Claude Code in a PTY, auto-detects rate limits, waits for reset, sends "continue" to resume, and shows a live countdown — installable via npm.

**Key accomplishments:**
- Rate-limit detection engine with ANSI stripping, rolling buffer, and 3-format timestamp parsing
- Timed resume scheduler with wall-clock anchoring, safety buffer, and cancellation
- EPIPE-safe PTY write wrapper for graceful handling of dead processes
- Four-state PTY orchestrator (RUNNING/LIMIT_DETECTED/WAITING/RESUMING) with 30s cooldown
- Live status bar with color-coded states and centered countdown card
- Installable CLI with `claude-auto-continue` and `cac` aliases, `--` arg passthrough

**Archive:** `.planning/milestones/v1.0-ROADMAP.md`, `.planning/milestones/v1.0-REQUIREMENTS.md`

---

