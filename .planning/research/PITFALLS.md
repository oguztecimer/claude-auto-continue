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

## npm Publishing Pitfalls

These pitfalls apply specifically to the v1.0.0 npm publishing milestone.

---

### Pitfall 7: node-pty Fails to Compile on Install — Breaks Global Install for Many Users

**What goes wrong:**
`npm install -g claude-auto-continue` triggers `node-gyp rebuild` to compile node-pty's native C++ addon. On machines lacking a C++ toolchain, this fails with cryptic errors. Affected platforms: Windows without Visual Studio Build Tools, macOS after OS upgrades that break Xcode Command Line Tools, Linux CI environments without build-essential. The user sees a wall of `gyp ERR!` output and concludes the package is broken.

**Why it happens:**
node-pty does not ship prebuilt binaries in its npm release. Every install compiles from source. Microsoft's node-pty team explicitly considered prebuilt binaries (issue #46) but declined due to maintenance burden. The compilation requires: Python >= 3.6, a C++ compiler (gcc/clang/MSVC), and `make`. These are developer tools rarely present on end-user machines. On macOS, any OS update (including minor ones) can silently invalidate the Xcode Command Line Tools, causing fresh gyp failures even on previously-working machines.

**How to avoid:**
Two strategies, pick one:

Option A (minimal change): Keep `node-pty` as the dependency but document prerequisites explicitly in README with copy-pasteable fix commands:
- macOS: `xcode-select --install`
- Windows: `npm install -g windows-build-tools` (requires admin terminal)
- Linux: `sudo apt-get install build-essential python3`

Option B (eliminate the problem): Switch dependency from `node-pty` to `@lydell/node-pty`. This fork ships prebuilt binaries for all supported platforms (macOS arm64/x64, Windows x64, Linux x64/arm64) and never calls node-gyp. Less than 1 MiB on macOS/Linux. Tradeoff: limited to platforms with prebuilt binaries, no fallback compilation.

The `@homebridge/node-pty-prebuilt-multiarch` package is a middle ground: downloads prebuilt binary if available, falls back to node-gyp if not. Maintained, supports Node.js 18+, macOS/Windows/Linux across arm and amd64.

For a tool targeting developers (who likely have build tools), Option A with good README documentation is acceptable. For maximum install reliability, Option B is safer.

**Warning signs:**
- `npm install` output contains `gyp ERR! build error`
- Users report install failures on fresh Windows machines or after macOS updates
- CI environments fail to install the package without extra setup steps

**Phase to address:**
npm Publishing phase — decide on prebuilt vs. compile-from-source strategy before publishing. Document prerequisites regardless of choice.

---

### Pitfall 8: The `cac` Bin Alias Conflicts with the Existing `cac` CLI Library Package

**What goes wrong:**
The package.json registers `"cac": "bin/claude-auto-continue.js"` as a bin alias. The npm package `cac` (version 6.7.14, the "Command And Conquer" CLI framework) also exists and is a popular dependency of build tools like Vite. If a user has another package that depends on `cac` installed globally, or if they later install `cac`, the bin aliases overwrite each other silently. The user types `cac` and gets the wrong tool.

**Why it happens:**
npm silently overwrites conflicting bin entries during global install — last install wins. The `cac` package itself does not register a `cac` bin (it is a library, not a CLI), but any future package named `cac` or registering a `cac` bin will conflict. More immediately: if the user runs `npm install -g cac` thinking they're installing a CLI tool, the `cac` bin for this wrapper gets replaced.

**How to avoid:**
Drop the `"cac"` bin alias or rename it to something more specific like `"claude-continue"` or `"cac-claude"`. The primary command `claude-auto-continue` is unambiguous and should be the only or primary alias. Shorter aliases should be unique enough to not collide — two or three letters is high collision risk on a global install where all packages share one `bin` directory.

**Warning signs:**
- User reports `cac: command not found` after installing another tool
- `which cac` points to the wrong binary
- A future npm search reveals a `cac` package that registers a `cac` bin

**Phase to address:**
npm Publishing phase — resolve before first publish. Changing a bin alias after publishing is a breaking change that requires a major version bump.

---

### Pitfall 9: Publishing Without Running `npm pack --dry-run` First — Missing or Wrong Files

**What goes wrong:**
The published package is missing the `dist/` directory (because `tsc` didn't run, or `prepublishOnly` failed silently), or it contains extra files (`.env`, `*.log`, `node_modules/` subtrees). Users install the package and get `Error: Cannot find module '../dist/cli.js'`.

**Why it happens:**
The `files` field in package.json whitelists what gets published, but npm does not warn if a listed file or directory is missing at publish time. If `npm run build` fails midway and leaves a partial `dist/`, the package publishes with corrupt output. The `prepublishOnly` script calls `npm run build`, but a TypeScript error that exits non-zero should block publish — except when developers use `--ignore-scripts` or the error is swallowed by the shell.

**How to avoid:**
Run `npm pack --dry-run` before every publish. This simulates the publish and prints exactly which files would be included. Verify:
1. `dist/` is present and non-empty
2. `bin/claude-auto-continue.js` is included
3. `node_modules/` is NOT included
4. `src/` and `test/` are NOT included (they bloat the package unnecessarily)
5. `README.md` is included (npm picks it up automatically from root, even without listing it in `files`)

Also run `node dist/cli.js --help` (or equivalent) locally after build to confirm the compiled output actually executes before publishing.

**Warning signs:**
- `npm pack` output shows only a few KB (suspiciously small for a compiled tool)
- `npm pack` output shows `node_modules/` entries
- Build emits TypeScript errors but exit code was ignored

**Phase to address:**
npm Publishing phase — make `npm pack --dry-run` a mandatory step in the publish checklist.

---

### Pitfall 10: Version Number Not Bumped from 0.1.0 to 1.0.0 Before First Real Publish

**What goes wrong:**
The package publishes at `0.1.0` instead of `1.0.0`. Under semver, `0.x.y` means "initial development, anything can change." Users see `0.1.0` and reasonably assume this is pre-release or unstable. More critically: once `0.1.0` is published, bumping to `1.0.0` is a major version change — this is the correct and intended signal, but it surprises users who installed `^0.1.0` and don't get automatic upgrades across the `0.x` to `1.x` boundary.

**Why it happens:**
The current `package.json` has `"version": "0.1.0"`. The milestone goal is to publish as `1.0.0`. If the developer forgets to bump the version and runs `npm publish`, npm will publish `0.1.0`. After that, publishing `1.0.0` works fine — but anyone who installed `^0.1.0` won't auto-update to `^1.0.0`, fragmenting the install base.

**How to avoid:**
Before publishing: run `npm version 1.0.0` (or manually edit `package.json`). This also creates a git tag (`v1.0.0`) automatically. Verify with `npm version` (no arguments) that the version reads `1.0.0` before running `npm publish`. Add version verification to the publish checklist.

**Warning signs:**
- `npm version` output shows `0.1.0`
- The git log shows no `v1.0.0` tag
- `npm publish` output shows `+ claude-auto-continue@0.1.0`

**Phase to address:**
npm Publishing phase — first step of the publish checklist, before anything else.

---

### Pitfall 11: Blank or Missing `author` Field Harms Registry Discoverability and Trust

**What goes wrong:**
The current `package.json` has `"author": ""`. The npm registry displays the author prominently on the package page. A blank author makes the package look abandoned or suspicious. npm does not block publishing with a blank author, so this silently ships.

**Why it happens:**
The field is initialized blank by `npm init` defaults and never filled in. It is non-required and easy to overlook.

**How to avoid:**
Set the author field before publishing:
```json
"author": "Your Name <your@email.com> (https://yoursite.com)"
```
At minimum, the name is required for the npm registry to show a proper attribution. Also fill in:
- `"repository"`: Points users to the GitHub repo for issues and source
- `"homepage"`: The package page or documentation link
- `"bugs"`: The issue tracker URL

These fields populate the npm registry sidebar and significantly affect whether users trust and install the package.

**Warning signs:**
- `npm pack` output shows empty author in the generated tarball's package.json
- The npm registry page shows no "Author" section
- GitHub repo link is absent from the registry sidebar

**Phase to address:**
npm Publishing phase — complete all metadata fields as a pre-publish checklist item.

---

### Pitfall 12: README Not Present at Root — npm Registry Shows "No README"

**What goes wrong:**
If `README.md` does not exist at the project root at publish time, the npm registry page shows a blank page with "No readme." This is the first thing users see and is a significant trust signal. The package may be ignored entirely.

**Why it happens:**
The `files` field controls what ships in the tarball, but npm always includes `README.md` from the root if it exists — it does not need to be listed in `files`. However, if the README doesn't exist yet (this milestone is writing it), and someone publishes early, the registry page will be empty.

**How to avoid:**
Write README.md before running `npm publish`. Verify its inclusion with `npm pack --dry-run`. The README should include at minimum:
- What the tool does (one-paragraph pitch)
- `npm install -g claude-auto-continue` install command
- Basic usage example (`claude-auto-continue` in place of `claude`)
- Prerequisites (Node.js version, build tools for node-pty)
- A note about what happens when Claude Code hits a rate limit (context for the problem it solves)

Do not update README after publishing without publishing a new version — the registry only updates the displayed README when a new version is published.

**Warning signs:**
- `npm pack --dry-run` output does not list `README.md`
- After publish, the npmjs.com package page shows "No readme"

**Phase to address:**
npm Publishing phase — README is the first deliverable, not an afterthought.

---

### Pitfall 13: 2FA OTP Required at Publish Time — Blocks Automated or Rushed Publish

**What goes wrong:**
If the npm account has 2FA enabled (which npm now requires for all packages), `npm publish` prompts for a TOTP code. If the developer doesn't have their authenticator app available, or runs `npm publish` in a CI context without the OTP, the publish fails with `npm ERR! code EOTP`.

**Why it happens:**
npm requires 2FA for publishing after a wave of supply chain attacks. The OTP prompt is interactive — it cannot be skipped. In a CI environment or when publishing for the first time in a hurry, this is unexpected.

**How to avoid:**
- Have the authenticator app ready when running `npm publish`
- Pass the OTP directly: `npm publish --otp=123456`
- For CI: use npm automation tokens (`npm token create --type=automation`) which bypass 2FA while maintaining security — automation tokens are scoped to publish-only

**Warning signs:**
- `npm ERR! code EOTP` during publish
- No authenticator app available
- Trying to publish from a terminal session where interactive prompts don't work

**Phase to address:**
npm Publishing phase — confirm 2FA setup and OTP method before starting the publish flow.

---

### Pitfall 14: CRLF Line Endings in the `bin/` Script Break Linux/macOS Install

**What goes wrong:**
If the bin script (`bin/claude-auto-continue.js`) has Windows-style CRLF line endings, the shebang line becomes `#!/usr/bin/env node\r` instead of `#!/usr/bin/env node`. On Linux and macOS, the shell looks for a binary named `node\r` (with a literal carriage return), fails to find it, and the CLI is completely broken for all Unix users after install.

**Why it happens:**
Git on Windows defaults `core.autocrlf=true`, which converts LF to CRLF on checkout. If the file is committed on Windows and published from Windows, all files have CRLF. The npm CLI does not normalize line endings during publish. macOS development typically uses LF already, so this is primarily a risk when the package is published from a Windows machine or if git autocrlf settings change.

**How to avoid:**
Add a `.gitattributes` file specifying `bin/* text eol=lf` to force LF endings in bin scripts regardless of platform. Before publishing, verify with a hex dump or `file` command that the bin script uses LF, not CRLF. On macOS (the current dev platform), this is not an active risk but should be documented for future contributors.

**Warning signs:**
- Users on Linux report `env: 'node\r': No such file or directory` after installing
- The `file` command on the bin script shows "CRLF line terminators"
- `xxd bin/claude-auto-continue.js | head` shows `0d 0a` instead of just `0a` at line endings

**Phase to address:**
npm Publishing phase — add `.gitattributes` as a preventive measure before first publish.

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
| Keeping node-pty as dependency without prebuilt binary strategy | No code changes required | Install failures for users without build tools; poor first-use experience | Acceptable if README documents prerequisites clearly |
| Publishing at 0.1.0 instead of 1.0.0 | No version bump work | Signals instability; fragments install base when bumping to 1.0.0 later | Never — bump to 1.0.0 before first real publish |

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
| npm registry | Publishing without dry-run | Always run `npm pack --dry-run` first; verify dist/ is present, node_modules/ is absent |
| npm bin aliases | Short aliases like `cac` that conflict with existing packages | Use descriptive, unique aliases; check npm registry for collisions before publishing |

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
| README with no prerequisites section | User installs, gets `gyp ERR!` wall of text, gives up | README must document build tool requirements prominently as the first potential failure point |
| README with no usage example | User doesn't know how to use the tool | Include a concrete one-liner: `claude-auto-continue -- claude -p "your prompt"` |

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
- [ ] **npm publish:** `npm pack --dry-run` shows `dist/` present, `README.md` present, `node_modules/` absent, version is `1.0.0`
- [ ] **npm publish:** `bin/claude-auto-continue.js` shebang is `#!/usr/bin/env node` with LF line endings (not CRLF)
- [ ] **npm publish:** `author`, `repository`, `homepage`, `bugs` fields all populated in package.json
- [ ] **npm publish:** `cac` bin alias verified not to conflict with any installed global package before first publish
- [ ] **npm publish:** OTP/2FA method confirmed available before starting publish flow

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
| Published wrong version (0.1.0 instead of 1.0.0) | MEDIUM | Cannot unpublish after 24 hours; publish 1.0.0 immediately; deprecate 0.1.0 with `npm deprecate claude-auto-continue@0.1.0 "Use 1.0.0"` |
| Published with missing dist/ (broken package) | MEDIUM | Publish fixed version immediately; users on broken version must manually update; cannot unpublish after 24h |
| Published with blank author / no README | LOW | Publish a patch version (1.0.1) with corrected metadata; registry updates on new version |
| `cac` bin alias conflicts with another user's global install | LOW (per user) / MEDIUM (reputation) | Publish new version removing the `cac` alias; users must reinstall; document the change |

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
| node-pty compile failure on install | npm Publishing: README prerequisites + consider prebuilt fork | Manual: test `npm install -g` in a fresh VM without build tools |
| `cac` bin alias collision | npm Publishing: rename or remove alias before first publish | Check `npm ls -g cac` on a typical developer machine |
| Missing dist/ on publish | npm Publishing: `npm pack --dry-run` in checklist | Verify `npm pack` output lists all expected files |
| Wrong version published | npm Publishing: version bump as first checklist item | `npm version` output matches target before `npm publish` |
| Blank author/missing metadata | npm Publishing: metadata audit before publish | `npm pack` tarball package.json has all fields populated |
| Missing README | npm Publishing: write README before publish | README.md present at root; `npm pack --dry-run` lists it |
| 2FA OTP blocks publish | npm Publishing: confirm OTP method before starting | Dry-run auth: `npm whoami` succeeds with same auth context |
| CRLF line endings in bin | npm Publishing: `.gitattributes` for bin/ | `file bin/claude-auto-continue.js` shows LF not CRLF |

---

## Sources

- [microsoft/node-pty — GitHub](https://github.com/microsoft/node-pty) — PTY pitfalls, thread safety, process.on('exit') listener override issue
- [microsoft/node-pty issue #46 — Prebuilt binaries](https://github.com/microsoft/node-pty/issues/46) — maintainer declined prebuilt binary support; context for why users must compile
- [microsoft/node-pty issue #190 — process.on('exit') disabled after spawn](https://github.com/Microsoft/node-pty/issues/190) — known event listener pitfall
- [homebridge/node-pty-prebuilt-multiarch — GitHub](https://github.com/homebridge/node-pty-prebuilt-multiarch) — prebuilt binary fork supporting Node.js 18+, macOS/Windows/Linux
- [@lydell/node-pty — npm](https://www.npmjs.com/package/@lydell/node-pty) — prebuilt-only fork, never calls node-gyp, less than 1 MiB on macOS/Linux
- [nodejs/node-gyp — npm](https://www.npmjs.com/package/node-gyp) — authoritative prerequisites documentation
- [nodejs/node issue #40085 — EPIPE writing to child process stdin](https://github.com/nodejs/node/issues/40085) — EPIPE behavior documented
- [nodejs/node issue #19218 — child_process stdout truncation](https://github.com/nodejs/node/issues/19218) — chunk boundary issues
- [chalk/strip-ansi — GitHub](https://github.com/chalk/strip-ansi) — authoritative ANSI stripping library
- [chalk/ansi-regex issue #21 — OSC sequences not matched by simple regex](https://github.com/chalk/ansi-regex/issues/21) — OSC escape sequence pitfall
- [anthropics/claude-code issue #14129 — /rate-limit-options repeated auto-execution](https://github.com/anthropics/claude-code/issues/14129) — Claude Code-specific bug when resuming with -c flag
- [npm/npm issue #4607 — CRLF in bin-scripts breaks Unix usage](https://github.com/npm/npm/issues/4607) — CRLF line ending pitfall for bin scripts
- [npm/npm issue #12371 — bin scripts should always have Unix line endings](https://github.com/npm/npm/issues/12371) — confirmed CRLF is a known npm publish pitfall
- [npm/feedback discussion #724 — package.json bin conflicts](https://github.com/npm/feedback/discussions/724) — bin alias collision behavior
- [cacjs/cac — GitHub](https://github.com/cacjs/cac) — confirmed `cac` library does not register a `cac` bin, but collision risk remains
- [npm Docs — Requiring 2FA for package publishing](https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/) — OTP requirements for publish
- [npm Docs — About semantic versioning](https://docs.npmjs.com/about-semantic-versioning/) — 0.x.y vs 1.0.0 implications
- [npm Docs — About package README files](https://docs.npmjs.com/about-package-readme-files/) — README handling at publish time
- [npm Docs — npm-publish](https://docs.npmjs.com/cli/v8/commands/npm-publish/) — authoritative publish behavior documentation
- [Sentry Engineering — How to publish binaries on npm](https://sentry.engineering/blog/publishing-binaries-on-npm) — prebuilt binary strategies and postinstall pitfalls
- [terryso/claude-auto-resume — GitHub](https://github.com/terryso/claude-auto-resume) — prior art; format-fragility and --dangerously-skip-permissions pitfall documented
- [nodejs/node issue #21822 — setInterval drift over time](https://github.com/nodejs/node/issues/21822) — timer drift confirmed in Node.js
- [Node.js child_process documentation](https://nodejs.org/api/child_process.html) — authoritative source for spawn/pipe behavior

---
*Pitfalls research for: CLI process wrapper / Claude Code auto-continue tool — npm publishing focus*
*Researched: 2026-02-27*
