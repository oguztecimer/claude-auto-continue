# Project Research Summary

**Project:** claude-auto-continue
**Domain:** Node.js CLI process wrapper — rate-limit auto-resume for Claude Code
**Researched:** 2026-02-27
**Confidence:** HIGH

## Executive Summary

Claude-auto-continue is a Node.js CLI tool that wraps Claude Code sessions inside a pseudo-terminal, monitors stdout for rate-limit messages, waits until the reset window, and sends "continue" back to the live session — keeping the conversation context intact across rate-limit pauses. The dominant insight from research is architectural: Claude Code requires a real PTY (pseudo-terminal) and hangs indefinitely when spawned via `child_process.spawn()` without one. This single constraint drives the entire stack decision toward `node-pty`, which is the same library powering VS Code's integrated terminal and is maintained by Microsoft. Everything else — pattern detection, scheduling, status display — is straightforward Node.js event-loop work once the PTY foundation is correct.

The recommended approach is a layered, single-process architecture: one `ProcessSupervisor` instance per Claude Code session, each owning its own PTY, a rolling output buffer, an explicit four-state machine (RUNNING → LIMIT\_DETECTED → WAITING → RESUMING), and a shared status display. This design supports 2-5 concurrent sessions on the Node.js event loop without worker threads, is testable bottom-up (PatternDetector and Scheduler are pure logic modules), and avoids the two gaps in existing tools: `autoclaude` requires tmux as a hard dependency, while `claude-auto-resume` (shell script) loses session context by launching a new `claude -p` invocation rather than resuming the paused conversation.

The primary risks are all well-understood and preventable in Phase 1. Output chunk boundaries and ANSI escape codes will silently break naive pattern matching; both are solved by standard libraries (`strip-ansi`) and a rolling buffer. Claude Code's rate-limit message format is an undocumented internal detail that Anthropic can change; making the detection regex configurable from day one is the hedge. EPIPE errors when writing to a process that exited during the wait must be handled from the first implementation, not retrofitted. All six critical pitfalls can be addressed in the initial build with disciplined use of established patterns.

## Key Findings

### Recommended Stack

The core stack decision is driven entirely by Claude Code's PTY requirement. `node-pty@1.1.0` is non-negotiable for the Claude Code process — this is confirmed by multiple GitHub issues (#9026, #771) showing that Claude Code hangs indefinitely without a TTY. For the rest of the stack, CommonJS is recommended over ESM to avoid interop friction with node-pty's native module. TypeScript 5.x provides type safety on stream data and pattern matching. For CLI UX, `commander@14`, `chalk@4`, and `ora@8` are all CJS-compatible and zero-hassle. For build tooling, `tsx` for development and `tsup` for distribution, with `node-pty` marked as external in the tsup config (native addons cannot be bundled).

**Core technologies:**
- `node-pty@1.1.0`: Spawn Claude Code with a real PTY — **required**, not optional; Claude Code hangs without it
- `TypeScript 5.x`: Type safety on async IO, pattern matching, and state machine logic
- `commander@14`: Zero-dependency CLI argument parsing; CJS+ESM exports; supported until May 2027
- `chalk@4` / `ora@8`: Terminal color and spinner; CJS-compatible versions required for CommonJS project
- `strip-ansi@6.x` (CJS): ANSI escape code stripping before pattern matching; 290M+ weekly downloads
- `tsx` / `tsup`: Development runner and distribution bundler; `external: ['node-pty']` required in tsup config
- `vitest`: Unit testing for pattern detection regexes and scheduler logic without spawning real processes

### Expected Features

The feature set is clearly divided: the core detection-wait-resume loop is all P1 with low implementation cost, while enhancements like desktop notifications and per-terminal session identity are P2 with low-to-medium cost. The key competitive gap is that no existing tool provides both session-context preservation AND multi-session support without tmux.

**Must have (table stakes):**
- Detect "Claude AI usage limit reached" message in live PTY output — the triggering event
- Parse reset timestamp from detected message (pipe-delimited unix timestamp OR human-readable time)
- Wait until reset time, then send "continue\r" to the PTY — the core value proposition
- Visible countdown timer while waiting — users must know the tool is alive and working
- Support 2-5 concurrent Claude Code sessions — the user's explicit requirement; single-session is insufficient
- Status display per session showing current state — critical for multi-session use
- Graceful handling when Claude Code exits unexpectedly during the wait (EPIPE safety)

**Should have (competitive differentiators):**
- Desktop notification on resume (macOS `osascript` or `node-notifier`) — users step away during multi-hour waits
- Log of resume events to file — helps understand usage patterns
- Configurable resume prompt text — some users want more than bare "continue"
- Per-terminal session identity tracking via `$ITERM_SESSION_ID` / `$TMUX_PANE` / tty — prevents wrong-session resume
- Human-readable smart time formatting ("~47 minutes" not "2820 seconds")

**Defer to v2+:**
- Non-tmux direct PTY wrapping as an explicitly marketed feature (it will work, but validate the tmux-free UX first)
- Plugin/hook system for custom on-resume actions
- `--dry-run` mode for detection verification after Claude Code updates (useful but not launch-blocking)

**Never implement (anti-features):**
- `--dangerously-skip-permissions` passthrough — arbitrary code execution risk in an unattended tool
- GUI/web dashboard — defeats the terminal-native purpose
- Cross-tool session migration to other AI providers — context loss, different product

### Architecture Approach

The architecture is a hub-and-spoke design where a thin CLI entry point instantiates N independent `ProcessSupervisor` instances that each own one Claude Code PTY process. Each supervisor runs a four-state machine (RUNNING, LIMIT\_DETECTED, WAITING, RESUMING) and emits status events to a shared `StatusDisplay`. The key insight is that all supervisors live on the Node.js main thread — node-pty is not thread-safe and must not be used across worker threads, but the event loop handles 2-5 concurrent I/O sources without any threads. The architecture decomposes cleanly into testable layers: PatternDetector and Scheduler are pure logic with no I/O dependencies and can be unit-tested first, before any PTY spawning complexity is introduced.

**Major components:**
1. `bin/cli.js` (Entry Point) — Parses CLI args, instantiates N ProcessSupervisor instances, handles SIGINT/SIGTERM, keeps process alive while any supervisor is running
2. `ProcessSupervisor` — Owns one Claude Code PTY: spawn, monitor, state machine, schedule resume, write stdin; one instance per terminal session
3. `PatternDetector` — Accumulates PTY output chunks in a rolling 4KB buffer, strips ANSI codes via `strip-ansi`, matches rate-limit regex; stateless between resume cycles (reset after each successful detection)
4. `Scheduler` — Converts parsed reset timestamp to a `setTimeout` duration (clock-anchored, not decrementing counter); drives 1-second countdown tick to StatusDisplay
5. `StdinWriter` — Wraps `ptyProcess.write('continue\r')` with EPIPE handling and processAlive guard
6. `StatusDisplay` — Subscribes to status events from all supervisors; redraws per-instance status lines using ANSI cursor movement; read-only (no commands back to supervisors)

### Critical Pitfalls

1. **Output chunk boundaries split the detection pattern** — PTY data events fire in arbitrary OS-buffer-sized chunks, not line-by-line. A rate-limit message can arrive split across 2-3 chunks. Fix: maintain a rolling string buffer, run the regex against the full buffer after each append, not against individual chunks. Must be designed in from the start — cannot be retrofitted.

2. **ANSI escape codes contaminate pattern matching** — Claude Code's output contains color codes, cursor movement sequences, and OSC title sequences embedded inline. The string `/usage limit reached/` will not match `\x1b[31musage\x1b[0m limit reached`. Fix: apply `strip-ansi` to every chunk before buffering; never match raw PTY output. Use `strip-ansi@6.x` for CJS compatibility.

3. **Fragile coupling to Claude Code's undocumented output format** — Anthropic has changed the rate-limit message format before and treats terminal output as a UI concern, not an API contract. Fix: make the detection regex configurable via env var or config file from day one; document the expected format and version it; implement multi-signal detection (keyword + timestamp pattern together).

4. **EPIPE crash when writing to a dead process** — Claude Code may exit during the wait window (user closed terminal, OOM kill). Writing `continue\r` to a closed PTY throws EPIPE. If unhandled, this kills the wrapper. Fix: attach an error listener before writing, check a `processAlive` flag, listen for the pty's `onExit` event and update state accordingly.

5. **node-pty native addon build friction** — node-pty requires a C++ build toolchain. On macOS this means Xcode CLT. Ships prebuilds for common platforms, but will fall back to compilation on unsupported architectures. Fix: document prerequisites clearly; if native build is a hard blocker, `@lydell/node-pty` uses only prebuilts (same API, narrower platform support).

6. **Resume triggers the `/rate-limit-options` loop bug** — Claude Code issue #14129 documents that resuming with `claude -c` can re-execute the `/rate-limit-options` command, potentially causing an immediate false positive re-detection. Fix: implement a post-resume detection dead zone (cooldown period of 30-60 seconds after sending "continue") to ignore transient output after resume.

## Implications for Roadmap

Based on the research, the architecture decomposes naturally into four phases that match the dependency chain: pure logic first, PTY integration second, multi-session coordination third, quality-of-life enhancements fourth.

### Phase 1: Core Detection Engine
**Rationale:** PatternDetector and Scheduler have zero I/O dependencies — they are pure logic that can be built and fully unit-tested before any PTY spawning complexity is introduced. This validates the most fragile part of the system (format detection) in isolation, with fast feedback.
**Delivers:** A tested, configurable rate-limit detection engine and timer scheduler that can be imported by ProcessSupervisor in Phase 2.
**Addresses:** FEATURES — detect message, parse timestamp, configurable detection pattern.
**Avoids:** Pitfalls 1 (chunk boundary buffer), 2 (ANSI stripping), 3 (hardcoded detection pattern), 6 (timer drift with clock-anchored calculation).

### Phase 2: Single-Session PTY Wrapper
**Rationale:** With the detection engine validated, introduce node-pty and build ProcessSupervisor for a single Claude Code session. This is where the PTY complexity and state machine live. Integration tests can use a mock script that prints the rate-limit message on demand.
**Delivers:** A working single-session wrapper — spawn Claude Code in a PTY, detect the limit, wait, send "continue", handle process exit. Functionally complete for one-session use.
**Uses:** `node-pty@1.1.0`, `strip-ansi@6.x`, PatternDetector and Scheduler from Phase 1.
**Implements:** ProcessSupervisor state machine (RUNNING → LIMIT\_DETECTED → WAITING → RESUMING), StdinWriter with EPIPE handling, processAlive guard.
**Avoids:** Pitfalls 4 (EPIPE), 5 (node-pty native build), anti-pattern of all-pipe spawn.

### Phase 3: Multi-Session Support and Status Display
**Rationale:** Only add multi-session complexity after single-session works reliably. StatusDisplay is kept separate from ProcessSupervisor so display concerns can be tested and modified without touching core logic.
**Delivers:** Support for 2-5 concurrent Claude Code sessions with per-instance status display showing session ID, current state, and countdown. CLI entry point instantiating N supervisors.
**Implements:** StatusDisplay with ANSI cursor movement, EventEmitter status events from each supervisor, CLI argument parsing with `commander@14` for `--instances` flag.
**Avoids:** Pitfall 6 (multi-instance state conflicts via isolated per-instance state).

### Phase 4: Polish and Enhancements
**Rationale:** Once the core is working and validated in real use, layer on the P2 features that depend on confirmed user behavior (stepping away during waits, needing notifications, wanting custom prompts).
**Delivers:** Desktop notifications on resume, configurable resume prompt text, resume event logging, per-terminal session identity tracking, graceful `--help` and error messages, `ora` spinner while waiting.
**Uses:** `chalk@4`, `ora@8` for terminal UX, `osascript` or `node-notifier` for desktop notifications.

### Phase Ordering Rationale

- PatternDetector before PTY: The detection regex is the highest-risk, most fragile component. Testing it in isolation (fast, no native addon) validates the core logic before integration complexity is introduced.
- Single-session before multi-session: node-pty's state management and EPIPE handling are complex enough on their own. Multi-session adds display coordination on top — do not combine these.
- StatusDisplay in Phase 3 (not Phase 2): A stub that just logs to console is sufficient for Phase 2 development. The real StatusDisplay requires multi-supervisor event coordination, which only exists in Phase 3.
- Enhancements in Phase 4: Desktop notifications and custom prompts depend on knowing that users actually step away during waits. Validate this with real use before investing in the notification path.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** The exact resume sequence matters — autoclaude sends Escape then "continue" then Enter; the tool should send `continue\r` directly. Verify the correct sequence against real Claude Code behavior before finalizing StdinWriter.
- **Phase 2:** The `/rate-limit-options` re-execution bug (issue #14129) needs hands-on investigation to determine the correct cooldown duration and how to detect "just resumed" vs "hit limit again immediately."
- **Phase 3:** Per-terminal session identity ($ITERM_SESSION_ID, $TMUX_PANE, tty) — the priority order of these identifiers needs validation across macOS Terminal, iTerm2, and tmux environments.

Phases with standard patterns (research-phase not required):
- **Phase 1:** Pattern detection with rolling buffers and ANSI stripping is a thoroughly documented Node.js pattern. `strip-ansi` and regex testing with vitest are both well-understood.
- **Phase 4:** Desktop notifications via `osascript` and file logging are trivial, well-documented patterns. Skip research phase; implement directly.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core finding (PTY requirement) verified via multiple GitHub issues with COMPLETED status; node-pty API and version confirmed via npm registry and Microsoft GitHub; ESM/CJS compatibility constraints verified against package documentation |
| Features | HIGH | Feature set derived from real user pain points in GitHub issues (#18980, #26789), two existing competitor tools (inspected source), and explicit user requirement for 2-5 concurrent sessions |
| Architecture | HIGH | Component boundaries follow well-established Node.js CLI patterns; PTY pattern confirmed in official node-pty docs and VS Code source; state machine pattern is textbook for process lifecycle management |
| Pitfalls | MEDIUM | Core pitfalls (ANSI codes, chunk boundaries, EPIPE) are well-documented in Node.js ecosystem with official issue references; Claude Code-specific pitfalls (format fragility, /rate-limit-options bug) are based on real GitHub issues but not personally reproduced |

**Overall confidence:** HIGH

### Gaps to Address

- **Exact resume command sequence:** Research found two approaches — send `continue\r` directly vs. send Escape first then `continue\r` (as autoclaude does). Needs hands-on testing against real Claude Code to determine which is correct and whether the Escape is necessary to exit any active prompt mode.
- **Rate-limit message format variants:** Two formats are documented: `"Claude AI usage limit reached|<unix_timestamp>"` (pipe-delimited) and `"Your limit will reset at Xpm (Timezone)"` (human-readable). Research confirms both exist, but which format appears under which conditions (TTY vs non-TTY, Claude Code version) needs direct verification.
- **node-pty thread safety on macOS ARM64:** All instances must stay on the main thread. The architecture handles this by design (single-process event loop), but the prebuilt binary availability for ARM64 macOS should be verified before publishing installation instructions.
- **Post-resume false positive rate:** The `/rate-limit-options` re-execution bug (issue #14129) may cause the tool to immediately re-detect a rate limit after resuming. The appropriate cooldown duration (30s? 60s? 5 minutes?) needs empirical measurement.

## Sources

### Primary (HIGH confidence)
- [anthropics/claude-code#9026](https://github.com/anthropics/claude-code/issues/9026) — Claude Code requires TTY; hangs without PTY
- [anthropics/claude-code#771](https://github.com/anthropics/claude-code/issues/771) — all-pipe stdio causes indefinite hang (COMPLETED)
- [anthropics/claude-code#2087](https://github.com/anthropics/claude-code/issues/2087) — rate-limit message format with pipe-delimited unix timestamp
- [anthropics/claude-code#9046](https://github.com/anthropics/claude-code/issues/9046) — additional rate-limit message format samples
- [anthropics/claude-code#9236](https://github.com/anthropics/claude-code/issues/9236) — human-readable reset time format confirmation
- [anthropics/claude-code#18980](https://github.com/anthropics/claude-code/issues/18980) — user pain: 5+ tabs, manual continue, five-hour sessions
- [anthropics/claude-code#26789](https://github.com/anthropics/claude-code/issues/26789) — feature request: auto-continue as built-in option
- [anthropics/claude-code#21731](https://github.com/anthropics/claude-code/issues/21731) — per-terminal session affinity problem; terminal ID hierarchy
- [anthropics/claude-code#14129](https://github.com/anthropics/claude-code/issues/14129) — /rate-limit-options re-execution bug on -c resume
- [microsoft/node-pty GitHub](https://github.com/microsoft/node-pty) — API, platform requirements, version 1.1.0, thread safety
- [Node.js Child Process Documentation](https://nodejs.org/api/child_process.html) — spawn behavior and EPIPE handling
- [chalk/strip-ansi GitHub](https://github.com/chalk/strip-ansi) — ANSI stripping; handles OSC + CSI sequences

### Secondary (MEDIUM confidence)
- [henryaj/autoclaude GitHub](https://github.com/henryaj/autoclaude) — Go TUI competitor; multi-session monitoring patterns, resume sequence (Escape → continue → Enter)
- [autoclaude.blmc.dev](http://autoclaude.blmc.dev/) — polling interval (3s), color-coded status, send sequence confirmation
- [terryso/claude-auto-resume GitHub](https://github.com/terryso/claude-auto-resume) — shell script competitor; format fragility acknowledged; `--dangerously-skip-permissions` anti-pattern
- [nodejs/node#40085](https://github.com/nodejs/node/issues/40085) — EPIPE behavior on child process stdin write
- [nodejs/node#19218](https://github.com/nodejs/node/issues/19218) — stdout chunk boundary issues
- [chalk/ansi-regex#21](https://github.com/chalk/ansi-regex/issues/21) — OSC sequences not matched by simple regex
- [commander.js releases](https://github.com/tj/commander.js/releases) — v14 CJS+ESM, v15 ESM-only (May 2026)

### Tertiary (LOW confidence)
- [Dicklesworthstone/claude_code_agent_farm](https://github.com/Dicklesworthstone/claude_code_agent_farm) — anti-feature reference: what over-engineering looks like for this domain
- [Hacker News: npx continues](https://news.ycombinator.com/item?id=47075089) — user feedback on desired UX ("Unix fg" mental model)

---
*Research completed: 2026-02-27*
*Ready for roadmap: yes*
