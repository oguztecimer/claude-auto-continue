# Pitfalls Research

**Domain:** CLI process wrapper / interactive terminal automation (Claude Code auto-continue)
**Researched:** 2026-02-27
**Confidence:** MEDIUM — Core pitfalls are well-documented in Node.js ecosystem; Claude Code-specific behavior based on real GitHub issues and existing tools

---

## Critical Pitfalls

### Pitfall 1: Output Chunk Boundary Splits the Detection Pattern

**What goes wrong:**
The stdout `data` event in Node.js fires in arbitrary chunks — not line-by-line. A message like `"Claude usage limit reached, reset at 3:45 PM"` can arrive in two or more separate `data` events: one chunk ending mid-word and the next completing it. A naive regex check on each individual chunk will silently miss the pattern and never trigger the auto-resume logic.

**Why it happens:**
Developers test with small or fast I/O where chunks happen to land cleanly. The PTY or pipe layer splits output at an OS-level buffer boundary, not at logical line endings. Claude Code's output includes ANSI escape sequences interspersed with text, which further fragments what appears to be a single "line."

**How to avoid:**
Maintain a rolling string buffer. Append each incoming chunk to the buffer. After each append, run detection regex against the *entire buffer*, not just the new chunk. Trim the buffer when a definitive "reset" occurs (e.g., after successfully sending "continue"). Use Node.js `readline` interface as an alternative — it buffers until `\n` and emits complete lines.

**Warning signs:**
- Detection works in manual testing (slow I/O) but fails silently in real usage (fast Claude Code output)
- Adding a small `setTimeout` delay "fixes" the detection intermittently — classic race condition smell
- Detection triggers only when the rate-limit message happens to arrive in one chunk (e.g., short terminal widths)

**Phase to address:**
Phase 1 (Core detection engine) — buffer management must be designed into the initial architecture, not retrofitted.

---

### Pitfall 2: ANSI Escape Code Contamination in Pattern Matching

**What goes wrong:**
Claude Code's terminal output contains ANSI escape sequences for color, cursor movement, and formatting embedded inline with the text. The actual string on the wire is something like `\x1b[31mClaude usage limit reached\x1b[0m`, not the clean text visible in a terminal. A regex against the clean string `"usage limit reached"` will fail to match.

**Why it happens:**
Developers look at what the terminal *renders* rather than what the underlying process *emits*. The difference is invisible to the eye but fatal for string matching. OSC sequences (used for terminal title setting) and CSI sequences (color/cursor) both embed themselves between visible characters. A simple `\x1b\[[0-?9;]*[mG]` pattern catches common CSI sequences but misses OSC sequences (`\x1b]...ST`) which are also common in Claude Code's output.

**How to avoid:**
Strip ANSI codes before pattern matching using the `strip-ansi` npm library (maintained by the Chalk team, handles OSC + CSI + all variant sequences). Do not write your own ANSI stripping regex — the edge cases are numerous and non-obvious. Strip on each buffered line before applying detection logic.

**Warning signs:**
- Pattern matching works when piping Claude Code output through `cat` (which may strip some codes) but not when wrapping directly
- Detection regex works in unit tests with plain strings but fails in integration tests against the real process
- Some rate-limit messages are detected and some aren't, with no obvious pattern

**Phase to address:**
Phase 1 (Core detection engine) — strip ANSI before any regex application. Lock to `strip-ansi@^7.1.0` (ESM) or `strip-ansi@^6.0.1` (CommonJS).

---

### Pitfall 3: Fragile Coupling to Claude Code Output Format

**What goes wrong:**
The detection logic parses a specific text format like `"Claude usage limit reached, [X]"` or a specific timestamp format. Claude Code has changed its rate-limit messaging format at least once (as evidenced by the `/rate-limit-options` behavior changes in v2.0.67+). When Anthropic updates the CLI, the tool silently stops working — it simply never detects the limit and never resumes.

**Why it happens:**
The tool depends on an undocumented, internal CLI output format. Anthropic treats Claude Code's terminal output as a UI concern, not an API contract. The `terryso/claude-auto-resume` project explicitly acknowledges this: "if Claude CLI updates change the output format, the script may need to be updated." There is no stability guarantee.

**How to avoid:**
- Make the detection pattern configurable (env var or config file) so users can update it without code changes
- Log every line of Claude Code output to a file during development to build an accurate corpus of what the real output looks like across versions
- Write detection as a multi-signal check: timestamp pattern + known keyword + `/rate-limit-options` trigger — requiring multiple signals reduces false negatives on partial format changes
- Expose a `--dry-run` mode that logs what would be detected without taking action, so users can verify detection is working after a Claude Code update
- Pin the expected Claude Code version in documentation and alert users when Claude Code updates are detected

**Warning signs:**
- Detection that worked last week suddenly stops working
- Claude Code version was updated recently
- The tool shows "waiting" but never resumes even after the rate limit window has passed

**Phase to address:**
Phase 1 (Core detection) — configurable pattern from day one. Phase 2 (Resilience) — version detection and update notifications.

---

### Pitfall 4: Sending "continue" to a Dead or Crashed Process

**What goes wrong:**
The wrapper detects the rate limit, waits, and then attempts to write `"continue\n"` to the Claude Code process's stdin. But the Claude Code process may have exited during the wait (user closed the terminal, process crashed, OOM killed). Writing to a closed stdin pipe throws an `EPIPE` error. If unhandled, this crashes the wrapper process itself.

**Why it happens:**
Node.js delivers `EPIPE` as an error event on the stdin stream. If no `error` listener is attached, Node.js treats it as an uncaught exception and exits the wrapper with a non-zero code. The race between "process exited" and "wrapper timer fired" is real and happens routinely.

**How to avoid:**
- Always attach an `error` listener to the child process's stdin stream before writing: `childProcess.stdin.on('error', (err) => { if (err.code !== 'EPIPE') throw err; })`
- Check `childProcess.exitCode` (non-null means it has exited) before writing
- Listen for the `close` event on the child process and update a `processAlive` flag
- With `node-pty`, check the pty's `onExit` callback state before writing

**Warning signs:**
- The wrapper crashes with `Error: write EPIPE` or `Error: This socket has been ended by the other party`
- The wrapper exits silently (uncaught `EPIPE`) without logging any failure
- The process monitoring shows child exit but wrapper doesn't acknowledge it

**Phase to address:**
Phase 1 (Core send logic) — EPIPE handling must be in the initial stdin write implementation.

---

### Pitfall 5: node-pty Required for PTY Mode, child_process Insufficient for Interactive Use

**What goes wrong:**
If the tool uses `child_process.spawn()` with pipes, Claude Code detects it is not attached to a real TTY and may alter its behavior: disabling color output, changing buffering modes, or behaving differently on rate limits. Programs check `isatty()` internally, and a piped stdin/stdout fails that check. Claude Code is an interactive tool designed to run attached to a terminal — non-TTY behavior is untested and may differ from what users see.

**Why it happens:**
`child_process.spawn()` creates OS-level pipes, not pseudoterminals. The spawned process sees `isatty(0) == false`. Interactive programs frequently branch on this: they use block buffering (not line buffering) in non-TTY mode, may suppress color output, and may disable interactive prompts.

**How to avoid:**
Use `node-pty` to spawn Claude Code in a PTY. The PTY presents Claude Code with a real terminal file descriptor, so it behaves exactly as it does when a human runs it. This is why VS Code's terminal, ssh sessions, and screen/tmux all use PTY — not pipes.

**Caveats:** `node-pty` is a native addon (requires `node-gyp` compilation), is not thread-safe (do not use across worker threads), and all child processes inherit the parent's permission level.

**Warning signs:**
- Claude Code output looks different when wrapped vs. run directly (no colors, different prompt format)
- Rate limit messages have a different format when wrapped (non-TTY mode)
- The tool works in manual testing (direct execution) but fails in CI or scripted environments

**Phase to address:**
Phase 1 (Process spawning decision) — evaluate PTY vs. pipe mode as the first architectural decision.

---

### Pitfall 6: Multiple Instance Coordination Without Shared State

**What goes wrong:**
The project requires supporting 2-5 concurrent Claude Code instances. A naive implementation runs one wrapper-per-terminal with no coordination. This creates conflicts: multiple wrappers may all detect limits and all try to resume at the same time, or a shared config file gets corrupted when two wrappers write to it simultaneously, or the "waiting" countdown display conflicts in a shared terminal.

**Why it happens:**
Multi-process coordination looks easy ("just run the same script multiple times") but silently breaks when processes share resources without synchronization. File system writes from multiple Node.js processes are not atomic by default. The problem is invisible in single-instance testing.

**How to avoid:**
- Use separate, numbered instance IDs (e.g., `--instance 1`) so each wrapper instance operates on a fully isolated state directory (e.g., `.claude-continue/instance-1/`)
- If a shared config is needed, use file locking (e.g., the `proper-lockfile` npm package) for any write operations
- Consider a hub-and-spoke architecture for Phase 2: one coordinator process that manages all instances and a lightweight client-side script per terminal
- Display per-instance status with clear instance labeling so users can distinguish which terminal is waiting

**Warning signs:**
- Countdown timers show different times for the same instance when running multiple wrappers
- State files are occasionally empty or contain partial JSON
- Resume triggers happen unexpectedly early or twice

**Phase to address:**
Phase 1 should design isolated per-instance state. Phase 2 (multi-instance support) adds coordination if needed.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoding the rate-limit regex pattern | Ships faster | Breaks silently on Claude Code update, requires code release to fix | Never — make it configurable from day one |
| Using `child_process.spawn()` with pipes instead of node-pty | Avoids native addon compilation | Claude Code may behave differently in non-TTY mode; undiscovered bugs in production | Only for initial feasibility spike, not production |
| Polling stdout with `setInterval` instead of event-driven detection | Simpler mental model | Misses events between polls; adds unnecessary CPU load | Never — event-driven is not meaningfully harder |
| `setTimeout` for the wait period without clock compensation | Simple to write | Timer drift over hours-long waits can miss the reset window by minutes | Acceptable for waits under 5 minutes; use clock-anchored calculation for longer waits |
| No EPIPE error handling on stdin writes | Fewer lines of code | Crashes the wrapper on any Claude Code exit during wait | Never — one line fix with significant reliability impact |
| Logging to console only (no file log) | Simple | Impossible to debug failures that occurred overnight unattended | Acceptable for MVP; add file logging before first real use |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Claude Code CLI (stdout) | Matching raw terminal output with plain-string regex | Strip ANSI codes first with `strip-ansi`, then match on clean text |
| Claude Code CLI (stdin) | Writing "continue" immediately when timer fires | Check `processAlive` flag, handle EPIPE, verify process is still running |
| Claude Code CLI (format) | Assuming the rate-limit message format is stable | Make the detection pattern configurable; log all Claude Code output during dev |
| Claude Code CLI (`-c` flag) | Resuming with `claude -c` blindly | Be aware the previous `/rate-limit-options` command can re-execute on resume (GitHub issue #14129) — this is a Claude Code bug to work around |
| node-pty (native addon) | Expecting it to work in all Node.js environments without compilation | Require `node-gyp` and platform tools as documented prerequisites; test on macOS and Linux |
| node-pty (thread safety) | Using node-pty across worker threads for multiple instances | Each pty instance must run on the same thread; use separate processes not worker threads for isolation |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Accumulating the full stdout buffer without trimming | Memory grows linearly with session length | Trim buffer after successful detection; keep only last N lines | Long-running sessions (hours), high-verbosity Claude Code output |
| Creating a new pty spawn for each "check" instead of persistent monitoring | Works fine for a single short session | Each spawn is expensive; use a single persistent pty wrapper per Claude Code instance | At 5 concurrent instances, spawning overhead is measurable |
| `setInterval`-based "alive" polling of child process | Appears to work in testing | Wastes CPU; misses exact exit time; `close`/`exit` events are more precise | Always wasteful — use events instead |
| Writing all instance state to a single JSON file | Works with 1 instance | File lock contention with 3+ instances | At 3+ concurrent instances with frequent state updates |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Using `--dangerously-skip-permissions` in the wrapper (as terryso/claude-auto-resume does) | Claude Code executes file changes and shell commands without user confirmation — arbitrary code execution risk | Do not use `--dangerously-skip-permissions`; the tool only needs to send "continue", not execute new prompts |
| Logging Claude Code's full stdout to a file with no access control | Stdout may contain API keys, secrets, code snippets from user's codebase | If logging, write to a temp directory with restrictive permissions (`0600`); offer opt-out |
| Sending arbitrary input to Claude Code's stdin based on parsed stdout | A maliciously crafted output from a subprocess could inject commands | Only ever send the literal string `"continue\n"` — never construct the stdin payload from parsed output |
| Spawning Claude Code with elevated privileges "just in case" | Privilege escalation surface | Run wrapper at the same privilege level as the user; never `sudo` or `setuid` |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Displaying a countdown with seconds-level precision for multi-hour waits | Creates false urgency; clock drift means displayed time diverges from actual | Show approximate time remaining (e.g., "~47 minutes") anchored to system clock, not decrementing timer |
| Silently failing to detect the rate limit (no feedback) | User assumes tool is working; discovers nothing happened hours later | Show a heartbeat / "monitoring..." message and log the last N lines received for debugging |
| Resuming too early (before reset actually occurs) | Claude Code immediately shows rate limit again; infinite retry loop | Add a 30-60 second grace period after the calculated reset time before sending "continue" |
| No indication which Claude Code instance is which | Users can't tell which terminal the status corresponds to | Label each instance with a terminal title or numbered prefix (e.g., "[Instance 2] Waiting 47m...") |
| Hard exiting the wrapper when Claude Code exits normally | User loses monitoring for a completed session | On Claude Code exit (code 0), cleanly exit the wrapper with a "session completed" message |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Rate limit detection:** Works in unit tests with mock strings — verify against real Claude Code output with actual ANSI sequences, including OSC title sequences
- [ ] **"continue" sending:** Works when tested manually — verify behavior when Claude Code exits unexpectedly during the wait (EPIPE handling)
- [ ] **Timer wait:** Countdown reaches zero and triggers — verify the reset time calculation handles timezone edge cases (Claude Code may display local time; system may be in different timezone)
- [ ] **Multi-instance mode:** Two wrappers run simultaneously without conflict — verify no state corruption when both detect limits and both resume at the same time
- [ ] **PTY mode:** Claude Code output looks correct — verify ANSI stripping captures all sequence types (CSI + OSC), not just the common ones
- [ ] **Resume detection:** Tool resumes correctly — verify that on `claude -c` resume, the `/rate-limit-options` re-execution bug (GitHub issue #14129) doesn't cause an immediate false positive re-detection
- [ ] **Graceful shutdown:** Ctrl+C on the wrapper — verify the Claude Code child process is also terminated (no orphan processes) and the terminal is left in a clean state

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| ANSI regex misses new escape sequence format | LOW | Update `strip-ansi` dependency; if that fails, log raw output and identify new sequence type |
| Claude Code output format changed and breaks detection | MEDIUM | Check Claude Code changelog; update configurable detection pattern; release patch |
| EPIPE crash corrupted terminal state | LOW | Run `reset` in terminal; restart the wrapper |
| Multiple instance state file corrupted | LOW | Delete the state directory (`.claude-continue/`); restart wrappers |
| Resume sent too early, Claude Code shows limit again | LOW | Wrapper should detect the re-occurrence and re-enter wait state (requires idempotent detection loop) |
| Timer fires but Claude Code process had died silently | LOW | Wrapper logs "process not alive, skipping resume"; user manually restarts Claude Code |
| node-pty fails to compile on target platform | HIGH | Fall back to `child_process.spawn()` with pipes and document the behavioral differences; evaluate `@lydell/node-pty` fork for better pre-built binaries |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Chunk boundary splits detection pattern | Phase 1: Core detection — rolling buffer with readline | Integration test: feed rate-limit message split across 3 chunks |
| ANSI escape contamination | Phase 1: Core detection — `strip-ansi` applied before matching | Unit test: apply regex to raw pty output captured from real Claude Code |
| Fragile coupling to Claude Code output format | Phase 1: Configurable pattern; Phase 2: version detection | Manual: verify detection still works after intentional Claude Code update |
| Writing to dead process (EPIPE) | Phase 1: stdin write safety — EPIPE handler + processAlive check | Integration test: kill Claude Code mid-wait and verify wrapper logs cleanly |
| PTY vs pipe behavior difference | Phase 1: Architecture decision on node-pty vs spawn | Manual: compare Claude Code output format in PTY vs pipe mode |
| Multi-instance state conflicts | Phase 2: Isolated state per instance | Integration test: run 3 instances simultaneously, verify no file corruption |
| Resume re-triggers `/rate-limit-options` loop | Phase 2: Post-resume detection dead zone | Manual: observe behavior after `claude -c` resume in real session |
| Timer drift on long waits | Phase 1: Clock-anchored wait calculation | Unit test: simulate 3-hour wait, verify actual wake time matches calculated reset time |

---

## Sources

- [microsoft/node-pty — GitHub](https://github.com/microsoft/node-pty) — PTY pitfalls, thread safety, process.on('exit') listener override issue
- [node-pty issue #190 — process.on('exit') disabled after spawn](https://github.com/Microsoft/node-pty/issues/190) — known event listener pitfall
- [nodejs/node issue #40085 — EPIPE writing to child process stdin](https://github.com/nodejs/node/issues/40085) — EPIPE behavior documented
- [nodejs/node issue #19218 — child_process stdout truncation](https://github.com/nodejs/node/issues/19218) — chunk boundary issues
- [chalk/strip-ansi — GitHub](https://github.com/chalk/strip-ansi) — authoritative ANSI stripping library
- [chalk/ansi-regex issue #21 — OSC sequences not matched by simple regex](https://github.com/chalk/ansi-regex/issues/21) — OSC escape sequence pitfall
- [anthropics/claude-code issue #14129 — /rate-limit-options repeated auto-execution](https://github.com/anthropics/claude-code/issues/14129) — Claude Code-specific bug when resuming with -c flag
- [anthropics/claude-code issue #26789 — Feature: auto-continue after limit resets](https://github.com/anthropics/claude-code/issues/26789) — confirms manual "continue" is the expected mechanism
- [terryso/claude-auto-resume — GitHub](https://github.com/terryso/claude-auto-resume) — prior art; format-fragility and --dangerously-skip-permissions pitfall documented
- [nodejs/node issue #21822 — setInterval drift over time](https://github.com/nodejs/node/issues/21822) — timer drift confirmed in Node.js
- [Node.js child_process documentation](https://nodejs.org/api/child_process.html) — authoritative source for spawn/pipe behavior
- [truefoundry.com — Claude Code Limits Explained](https://www.truefoundry.com/blog/claude-code-limits-explained) — rate limit structure context

---
*Pitfalls research for: CLI process wrapper / Claude Code auto-continue tool*
*Researched: 2026-02-27*
