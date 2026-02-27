# Claude Auto-Continue

## What This Is

A Node.js CLI tool that automatically resumes Claude Code sessions when they pause due to usage limits. It wraps Claude Code in a PTY, detects rate-limit messages, waits until reset, and sends "continue" to resume — with a live status bar and countdown timer. Installable via `npm install -g claude-auto-continue`.

## Core Value

Unattended Claude Code sessions that automatically resume after usage limits reset, so you never have to manually babysit and type "continue."

## Current State

**Shipped:** v1.0 (2026-02-27)
**Codebase:** 2,117 lines TypeScript, 91 tests, 8 test files
**Tech stack:** Node.js (CJS), TypeScript, node-pty, vitest
**Install:** `npm install -g claude-auto-continue` or `cac` alias

## Requirements

### Validated

- ✓ Detect when Claude Code hits usage limit — v1.0 (PatternDetector with ANSI stripping and rolling buffer)
- ✓ Parse the reset timestamp from Claude Code output — v1.0 (PatternDetector extracts Date from human-readable timestamp)
- ✓ Wait until the usage limit resets — v1.0 (Scheduler delays until parsed reset time + safety buffer)
- ✓ Automatically send "continue" to resume the paused session — v1.0 (ProcessSupervisor sends ESC + "continue\r" via StdinWriter)
- ✓ Provide visible feedback (countdown, status bar) while waiting — v1.0 (StatusBar + CountdownCard with 1-second ticks)
- ✓ Installable via npm as CLI command — v1.0 (bin wrapper with dual aliases)

### Active

(None — all v1 requirements shipped)

### Out of Scope

- Multi-session orchestration — user prefers one session per terminal window
- Mobile notifications — desktop tool only
- GUI/web interface — CLI/terminal tool
- API key management — uses existing Claude Code auth
- Upgrading plans — just waits for reset

## Context

- Claude Code shows "Claude usage limit reached" with a reset timestamp when hitting rate limits
- It presents `/rate-limit-options` with options: stop and wait, or upgrade
- After reset, typing "continue" resumes the session
- User runs multiple Claude Code instances in separate terminal windows, each with its own `claude-auto-continue` wrapper

## Constraints

- **Tech stack**: Node.js (CJS) with TypeScript — fits existing workflow
- **Simplicity**: Small, focused tool — 2,117 LOC total
- **Reliability**: Must reliably detect the limit message and correctly resume
- **Zero-config**: Works out of the box; optional config at `~/.config/claude-auto-continue/config.json`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js over shell script | Fits user's workflow, easier to extend | ✓ Good — CJS project with TypeScript |
| Build custom vs use existing | User wants tailored solution | ✓ Good — custom tool |
| node-pty for PTY spawning | Real TTY required for Claude Code; hangs without it | ✓ Good — Phase 2 |
| Four-state machine (RUNNING/LIMIT_DETECTED/WAITING/RESUMING) | Clean separation of detection, waiting, and resume concerns | ✓ Good — Phase 2 |
| Dependency injection over module mocking | spawnFn/onExit constructor options avoid vi.mock() ESM/CJS pitfalls | ✓ Good — Phase 2 |
| CommonJS over ESM | node-pty native module interop friction with ESM | ✓ Good — Phase 1 |
| strip-ansi@6 (not v7) | v7 is ESM-only, incompatible with CJS project | ✓ Good — Phase 1 |
| Raw ANSI escapes over TUI library | Zero new dependencies, project stays minimal | ✓ Good — Phase 3 |
| Single session per terminal window | User preference, simpler architecture | ✓ Good — Phase 3 |
| Thin bin wrapper with shebang | Standard npm pattern, works with npm link and npm install -g | ✓ Good — Phase 4 |

---
*Last updated: 2026-02-27 after v1.0 milestone*
