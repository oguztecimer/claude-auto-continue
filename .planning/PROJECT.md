# Claude Auto-Continue

## What This Is

A Node.js tool that automatically resumes Claude Code sessions when they pause due to usage limits. It detects when Claude Code hits its rate limit, waits for the reset window, and sends "continue" to resume work — across multiple concurrent Claude Code instances (2-5 terminals).

## Core Value

Unattended Claude Code sessions that automatically resume after usage limits reset, so you never have to manually babysit and type "continue."

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Detect when Claude Code hits usage limit ("Claude usage limit reached" message with reset timestamp)
- [ ] Parse the reset timestamp from Claude Code output
- [ ] Wait until the usage limit resets
- [ ] Automatically send "continue" to resume the paused session
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
| Node.js over shell script | Fits user's workflow, easier to extend | — Pending |
| Build custom vs use existing | User wants tailored solution | — Pending |

---
*Last updated: 2026-02-27 after initialization*
