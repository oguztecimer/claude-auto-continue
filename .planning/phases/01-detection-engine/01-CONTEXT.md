# Phase 1: Detection Engine - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Configurable rate-limit pattern detection with rolling buffer, ANSI stripping, and timestamp parsing. Fully unit-tested with no PTY dependency. This phase delivers a pure library module — PTY integration is Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Rate-limit message format
- Claude determines the default detection regex by researching actual Claude Code rate-limit output
- Rolling buffer handles messages split across multiple PTY data chunks
- Debug/verbose logging mode that shows buffer contents for diagnosing pattern mismatches when the message format changes

### Configuration surface
- Constructor options for programmatic use: `new PatternDetector({ pattern: /.../ })`
- JSON config file for CLI users at `~/.config/claude-auto-continue/config.json`
- Constructor options override config file values
- Only the detection pattern is configurable — buffer size and other internals are not exposed

### Detection output shape
- EventEmitter-based API: `detector.on('limit', (result) => ...)`
- Event payload: `{ resetTime: Date | null, rawMatch: string }`
- Emit with `resetTime: null` if timestamp cannot be parsed — caller decides fallback behavior
- Single event type (`limit`) — no additional error or debug events

### Scheduler timing
- Small safety buffer (a few seconds) past the parsed reset time before triggering resume
- Trust local system clock — no external clock comparison
- If reset time is already in the past when detected, trigger resume immediately
- Scheduler is cancelable via `scheduler.cancel()` for clean shutdown support

### Claude's Discretion
- Default regex pattern (based on actual Claude Code output research)
- Rolling buffer size
- Exact safety buffer duration
- ANSI stripping implementation approach
- Internal module structure and architecture

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-detection-engine*
*Context gathered: 2026-02-27*
