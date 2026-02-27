# Claude Auto-Continue

## What This Is

A Node.js tool that automatically resumes Claude Code sessions when they pause due to usage limits. It detects when Claude Code hits its rate limit, waits for the reset window, and sends "continue" to resume work — across multiple concurrent Claude Code instances (2-5 terminals).

## Core Value

Unattended Claude Code sessions that automatically resume after usage limits reset, so you never have to manually babysit and type "continue."

## Requirements

### Validated

- ✓ Detect when Claude Code hits usage limit — Phase 1 (PatternDetector with ANSI stripping and rolling buffer)
- ✓ Parse the reset timestamp from Claude Code output — Phase 1 (PatternDetector extracts Date from human-readable timestamp)
- ✓ Wait until the usage limit resets — Phase 2 (Scheduler delays until parsed reset time + safety buffer)
- ✓ Automatically send "continue" to resume the paused session — Phase 2 (ProcessSupervisor sends ESC + "continue\r" via StdinWriter)

### Active

- [ ] Support multiple concurrent Claude Code instances (2-5)
- [ ] Provide visible feedback (countdown, status) while waiting

### Out of Scope

- Mobile notifications — desktop tool only
- GUI/web interface — CLI/terminal tool
- API key management — uses existing Claude Code auth
- Upgrading plans — just waits for reset

## Context

- Claude Code shows "Claude usage limit reached" with a reset timestamp when hitting rate limits
- It presents `/rate-limit-options` with options: stop and wait, or upgrade
- After reset, typing "continue" resumes the session
- An existing shell script ([claude-auto-resume](https://github.com/terryso/claude-auto-resume)) does something similar but user wants a custom Node.js solution
- User runs 2-5 Claude Code instances in parallel across terminals

## Constraints

- **Tech stack**: Node.js — fits existing workflow
- **Simplicity**: Should be a small, focused tool — not over-engineered
- **Reliability**: Must reliably detect the limit message and correctly resume

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node.js over shell script | Fits user's workflow, easier to extend | Confirmed — CJS project with TypeScript |
| Build custom vs use existing | User wants tailored solution | Confirmed — custom tool |
| node-pty for PTY spawning | Real TTY required for Claude Code; hangs without it | Confirmed — Phase 2 |
| Four-state machine (RUNNING/LIMIT_DETECTED/WAITING/RESUMING) | Clean separation of detection, waiting, and resume concerns | Confirmed — Phase 2 |
| Dependency injection over module mocking | spawnFn/onExit constructor options avoid vi.mock() ESM/CJS pitfalls | Confirmed — Phase 2 |
| CommonJS over ESM | node-pty native module interop friction with ESM | Confirmed — Phase 1 |

---
*Last updated: 2026-02-27 after Phase 2*
