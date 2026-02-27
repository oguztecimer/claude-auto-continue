# Architecture Research

**Domain:** CLI process wrapper / monitor tool (Node.js)
**Researched:** 2026-02-27
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Entry Point (bin/cli.js)                    │
│              Parses args, spawns ProcessSupervisor instances         │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ creates N instances (1 per terminal)
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ ProcessSupervisor│  │ ProcessSupervisor│  │ ProcessSupervisor│
│   (instance 1)   │  │   (instance 2)   │  │   (instance N)   │
│                  │  │                  │  │                  │
│  ┌────────────┐  │  │  ┌────────────┐  │  │  ┌────────────┐  │
│  │  PTY/Child │  │  │  │  PTY/Child │  │  │  │  PTY/Child │  │
│  │  Process   │  │  │  │  Process   │  │  │  │  Process   │  │
│  │ (claude)   │  │  │  │ (claude)   │  │  │  │ (claude)   │  │
│  └─────┬──────┘  │  │  └────────────┘  │  │  └────────────┘  │
│        │ stdout  │  │                  │  │                  │
│  ┌─────▼──────┐  │  │                  │  │                  │
│  │ OutputBuf  │  │  │                  │  │                  │
│  │  + Pattern │  │  │                  │  │                  │
│  │  Detector  │  │  │                  │  │                  │
│  └─────┬──────┘  │  │                  │  │                  │
│        │ match?  │  │                  │  │                  │
│  ┌─────▼──────┐  │  │                  │  │                  │
│  │  Scheduler │  │  │                  │  │                  │
│  │ (setTimer) │  │  │                  │  │                  │
│  └─────┬──────┘  │  │                  │  │                  │
│        │ fired   │  │                  │  │                  │
│  ┌─────▼──────┐  │  │                  │  │                  │
│  │  stdin     │  │  │                  │  │                  │
│  │  Writer    │  │  │                  │  │                  │
│  └────────────┘  │  │                  │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │ status updates
                                 ▼
                    ┌────────────────────────┐
                    │   StatusDisplay        │
                    │   (terminal output,    │
                    │    countdown timers)   │
                    └────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Entry Point (cli.js) | Parse CLI args, instantiate supervisors, handle signals (SIGINT/SIGTERM) | Node.js `process.argv`, commander or yargs |
| ProcessSupervisor | Own one Claude Code process: spawn it, detect limits, schedule resume | Class with state machine (running / limited / waiting / resuming) |
| PTY/Child Process layer | Spawn `claude` with a PTY so Claude Code behaves like it is in a real terminal | `node-pty` (preferred) or `child_process.spawn` with `stdio: ['inherit','pipe','pipe']` |
| OutputBuffer + PatternDetector | Accumulate stdout chunks, strip ANSI codes, match rate-limit strings | Rolling string buffer + regex; `strip-ansi` package |
| Scheduler | Convert parsed reset timestamp to a `setTimeout` duration; drive countdown | `Date`, `setTimeout`, `setInterval` for countdown ticks |
| StdinWriter | Write `\n` (or the resume text) to the child process stdin at the right moment | `ptyProcess.write()` or `child.stdin.write()` |
| StatusDisplay | Show per-instance state and countdown across all N supervisors | `readline`/`process.stdout` with cursor control, or `ink` |

## Recommended Project Structure

```
claude-auto-continue/
├── bin/
│   └── claude-auto-continue.js   # CLI entry point, shebang, arg parsing
├── src/
│   ├── ProcessSupervisor.js      # Core class: spawn + monitor + resume
│   ├── PatternDetector.js        # Output buffer + regex matching
│   ├── Scheduler.js              # Reset time parsing + setTimeout wrapper
│   ├── StdinWriter.js            # Write to child stdin safely
│   └── StatusDisplay.js          # Terminal output / countdown UI
├── test/
│   ├── PatternDetector.test.js
│   └── Scheduler.test.js
├── package.json
└── .planning/
```

### Structure Rationale

- **bin/:** Standard npm convention for executables; keeps entry point thin.
- **src/ProcessSupervisor.js:** The heart of the tool. All other modules are utilities it calls. One class owns one `claude` process — makes multiple instances trivial (just instantiate N times).
- **src/PatternDetector.js:** Isolated so it can be unit-tested without spawning real processes. Pure input/output: chunk in, match result out.
- **src/Scheduler.js:** Isolated so timer logic and timestamp parsing can be tested with fake clocks.
- **src/StatusDisplay.js:** Kept separate because display concerns are orthogonal to process management. Can be swapped or disabled without touching core logic.

## Architectural Patterns

### Pattern 1: PTY Spawning via node-pty

**What:** Use `node-pty` to spawn Claude Code inside a pseudo-terminal so Claude Code behaves as if running in a real user terminal. Without a PTY, Claude Code detects it is in a pipe and either hangs waiting for stdin or changes its output format.

**When to use:** When the target program checks `isatty()` or uses readline — which Claude Code does in interactive mode.

**Trade-offs:** Adds a native addon dependency (node-pty) that requires compilation. However, node-pty is maintained by Microsoft, has ~1.3M weekly downloads, and is used by VS Code itself — it is a safe dependency.

**Example:**
```javascript
import * as pty from 'node-pty';

const proc = pty.spawn('claude', [], {
  name: 'xterm-256color',
  cols: process.stdout.columns || 220,
  rows: process.stdout.rows || 50,
  cwd: process.cwd(),
  env: process.env,
});

proc.onData((data) => {
  // data includes ANSI escape codes — strip before pattern matching
  patternDetector.feed(data);
  // also forward to user's terminal so they can watch
  process.stdout.write(data);
});

// Send "continue\n" when rate limit resets
proc.write('continue\r');
```

**Critical finding (HIGH confidence):** Issue #771 on the anthropics/claude-code repo confirms that spawning Claude Code with `child_process` using all-pipe stdio causes it to hang indefinitely. The workaround is `stdio: ['inherit', 'pipe', 'pipe']` — which gives stdin to the parent terminal but captures stdout/stderr. For a wrapper that also needs to write to stdin programmatically, a full PTY via `node-pty` is the correct solution.

### Pattern 2: Chunk Accumulation Buffer with ANSI Stripping

**What:** PTY output arrives in variable-size chunks that do not align with line boundaries. Before pattern matching, accumulate chunks into a rolling buffer, strip ANSI escape codes, then search for the rate-limit string.

**When to use:** Always — never match raw PTY data directly because ANSI codes split across chunks will break naive string search.

**Trade-offs:** Small memory overhead for the buffer. The only risk is forgetting to drain the buffer on process close.

**Example:**
```javascript
import stripAnsi from 'strip-ansi';

class PatternDetector {
  #buffer = '';
  #LIMIT_RE = /Claude(?:\s+AI)?\s+usage\s+limit\s+reached[.\s|]*(\d+)?/i;
  #TIME_RE  = /Your\s+limit\s+will\s+reset\s+at\s+(\d{1,2}(?::\d{2})?\s*[ap]m)\s+\(([^)]+)\)/i;

  feed(rawChunk) {
    // Strip ANSI then append; keep last 4KB to avoid unbounded growth
    this.#buffer += stripAnsi(rawChunk);
    if (this.#buffer.length > 4096) {
      this.#buffer = this.#buffer.slice(-4096);
    }

    const limitMatch = this.#LIMIT_RE.exec(this.#buffer);
    if (limitMatch) {
      const unixTs   = limitMatch[1] ? Number(limitMatch[1]) : null;
      const timeMatch = this.#TIME_RE.exec(this.#buffer);
      return { detected: true, unixTimestamp: unixTs, timeMatch };
    }
    return { detected: false };
  }

  reset() { this.#buffer = ''; }
}
```

### Pattern 3: State Machine Per Process Instance

**What:** Each ProcessSupervisor has an explicit state machine with four states: `RUNNING`, `LIMIT_DETECTED`, `WAITING`, `RESUMING`. State transitions are the only place that triggers actions (spawning, writing stdin, scheduling timers).

**When to use:** Any time a long-running process goes through distinct lifecycle phases. Prevents "spaghetti flag" bugs where multiple boolean variables get out of sync.

**Trade-offs:** Slightly more ceremony upfront; prevents an entire class of race condition bugs.

**Example:**
```javascript
const State = Object.freeze({
  RUNNING:        'RUNNING',
  LIMIT_DETECTED: 'LIMIT_DETECTED',
  WAITING:        'WAITING',
  RESUMING:       'RESUMING',
});

class ProcessSupervisor {
  #state = State.RUNNING;

  #transition(next, context = {}) {
    const prev = this.#state;
    this.#state = next;
    this.#onTransition(prev, next, context);
  }

  #onTransition(from, to, ctx) {
    if (to === State.LIMIT_DETECTED) {
      this.#scheduleResume(ctx.resetAt);
      this.#transition(State.WAITING);
    }
    if (to === State.RESUMING) {
      this.#proc.write('continue\r');
      this.#transition(State.RUNNING);
    }
  }
}
```

## Data Flow

### Rate Limit Detection and Resume Flow

```
Claude Code stdout (raw PTY data)
    │
    ▼
OutputBuffer.feed(rawChunk)
    │  strip ANSI, append to rolling buffer
    ▼
PatternDetector.match()
    │  regex: "Claude usage limit reached" + timestamp
    │
    ├── no match → continue buffering
    │
    └── MATCH → { unixTimestamp, humanTime }
        │
        ▼
   ProcessSupervisor.onLimitDetected(resetAt)
        │  transition: RUNNING → LIMIT_DETECTED → WAITING
        │
        ▼
   Scheduler.scheduleAt(resetAt)
        │  setTimeout(duration) — duration = resetAt - Date.now() + buffer
        │  setInterval(1000) — countdown tick → StatusDisplay.update()
        │
        └── timer fires
            │
            ▼
       clearInterval(countdown)
       ProcessSupervisor transition: WAITING → RESUMING
            │
            ▼
       StdinWriter: proc.write('continue\r')
            │
            ▼
       ProcessSupervisor transition: RESUMING → RUNNING
            │
            ▼
       PatternDetector.reset()   (clear buffer)
```

### Multiple Instance Flow

```
cli.js reads args (e.g. --instances 3, or --watch-dirs dir1 dir2 dir3)
    │
    ├── new ProcessSupervisor({ id: 1, ... })
    ├── new ProcessSupervisor({ id: 2, ... })
    └── new ProcessSupervisor({ id: 3, ... })
         │           │           │
         │           │           └── all run independently on the event loop
         │           │               (no shared state; no worker threads needed)
         │           │
         └───────────┴── each emits 'status' events
                              │
                              ▼
                        StatusDisplay.render()
                        (redraws all N instance rows)
```

### Key Data Flows

1. **PTY data → pattern detection:** Raw PTY bytes arrive via `proc.onData()` callback, are ANSI-stripped and buffered, then scanned. Matching is synchronous and cheap (string scan on ~4KB buffer).
2. **Timestamp → timer:** The reset timestamp (unix epoch integer or human-readable time string) is parsed into a `Date`, a setTimeout duration is computed, and a `setTimeout` is set. Nothing blocking occurs.
3. **Timer expiry → stdin write:** On timer fire, the supervisor writes `'continue\r'` to the PTY stdin — Claude Code receives it as if a user typed it.
4. **All supervisors → display:** Each supervisor emits status events; the display module subscribes and redraws a single multi-line status block using ANSI cursor movement.

## Scaling Considerations

This is a local developer tool, not a server. "Scaling" means handling 2-5 concurrent Claude Code instances cleanly on one machine.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 instance | Single ProcessSupervisor, simplest path; useful for development |
| 2-5 instances | Multiple ProcessSupervisors on Node.js event loop — no threads needed; event loop handles I/O concurrently |
| 5+ instances | node-pty is not thread-safe; all instances must stay on main thread — acceptable since I/O is async; no changes needed |
| Server/daemon use | Out of scope for this tool; would require daemon architecture like PM2 |

### Scaling Priorities

1. **First bottleneck (display):** StatusDisplay gets complex with many instances. Simple solution: one status line per instance, updated in-place with `\r` or `readline.moveCursor`.
2. **Second bottleneck (PTY overhead):** Each node-pty instance maintains a kernel PTY pair. For 2-5 instances, this is trivial. For 20+ it could be significant — not a concern for this tool's scope.

## Anti-Patterns

### Anti-Pattern 1: All-Pipe stdio Without PTY

**What people do:** Spawn Claude Code with `child_process.spawn('claude', [], { stdio: 'pipe' })` thinking it is the simple path.

**Why it's wrong:** Claude Code detects it is not in a TTY and hangs waiting for stdin input that never comes. Confirmed in anthropics/claude-code issue #771 (closed COMPLETED). The process deadlocks.

**Do this instead:** Use `node-pty` to spawn inside a pseudo-terminal. If you want to avoid node-pty, use `stdio: ['inherit', 'pipe', 'pipe']` — but this means stdin is the parent's stdin, so you cannot programmatically write to it. For a tool that must send `continue`, node-pty is required.

### Anti-Pattern 2: Matching Raw PTY Output Directly

**What people do:** Apply regex to the raw bytes from `proc.onData()` without stripping ANSI codes or buffering.

**Why it's wrong:** ANSI escape sequences (color codes, cursor movement) are embedded in the text and can split a word like "usage" across multiple sequences. A pattern like `/usage limit reached/` will miss the match even though the visible text says "usage limit reached."

**Do this instead:** Strip ANSI codes with the `strip-ansi` package before matching. Accumulate chunks in a rolling buffer so multi-chunk messages are matched even when split across data events.

### Anti-Pattern 3: Using `exec()` Instead of `spawn()` / node-pty

**What people do:** Use `child_process.exec('claude ...')` which buffers all output and waits for exit.

**Why it's wrong:** `exec()` buffers stdout/stderr in memory and only delivers it on process exit. You cannot detect the rate-limit message in real-time. Worse, Claude Code in interactive mode never exits on its own — it blocks forever.

**Do this instead:** Use `node-pty` (streaming data events) or at minimum `child_process.spawn()` with stdout data events. Never `exec()` for long-running interactive processes.

### Anti-Pattern 4: Multiple Boolean Flags Instead of State Machine

**What people do:** Track state with booleans like `isLimitHit`, `isWaiting`, `hasResumed` that each get set/cleared in different event handlers.

**Why it's wrong:** With 3 booleans you have 8 possible states, most of which are invalid. Race conditions emerge when events arrive out of order (e.g., Claude Code exits while the scheduler is running).

**Do this instead:** Use an explicit state enum (`RUNNING`, `LIMIT_DETECTED`, `WAITING`, `RESUMING`) and transition it in one place. Log transitions for debugging.

### Anti-Pattern 5: Polling stdout Instead of Event-Driven Detection

**What people do:** Use `setInterval` to check if output has changed.

**Why it's wrong:** Node.js streams are already event-driven. Polling adds latency and wastes CPU, and it introduces a gap where a message could be missed if it arrives and clears between polls.

**Do this instead:** Use `proc.onData()` (node-pty) or `child.stdout.on('data', ...)` (child_process) — these fire immediately when data arrives.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Claude Code CLI | PTY spawn via node-pty; write `continue\r` to stdin | Claude Code must be installed and on PATH; tool inherits the user's auth |
| User's terminal | Forward PTY output to `process.stdout` so user can watch progress | Use `process.stdout.write(data)` from the `onData` callback |
| System clock | `Date.now()` and `setTimeout` for reset scheduling | No external service; just Node.js timers |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| cli.js ↔ ProcessSupervisor | Direct method calls; EventEmitter for status updates | Keep cli.js thin — no business logic |
| ProcessSupervisor ↔ PatternDetector | Synchronous method call: `detector.feed(chunk)` returns result | PatternDetector is stateful (buffer); reset it after a successful resume |
| ProcessSupervisor ↔ Scheduler | Synchronous call: `scheduler.scheduleAt(resetAt, callback)` | Scheduler owns the timer; calling `cancel()` on state transition to exit |
| ProcessSupervisor ↔ StdinWriter | Direct call: `writer.send(proc, text)` | Thin wrapper; handles the `\r` vs `\n` PTY quirk |
| All Supervisors ↔ StatusDisplay | EventEmitter pattern: each supervisor emits `'status'`; display subscribes | Display is read-only (no commands back to supervisors) |

## Suggested Build Order (Phase Dependencies)

The architecture decomposes cleanly into layers where each depends on the previous:

```
Phase 1: PatternDetector (no dependencies — pure logic, testable immediately)
    └── Unit test: feed mock chunks, assert match/no-match

Phase 2: Scheduler (depends on: nothing external — just Date/setTimeout)
    └── Unit test with fake timers (sinon/vitest fake timers)

Phase 3: ProcessSupervisor — single instance (depends on: node-pty, PatternDetector, Scheduler)
    └── Integration test: spawn a mock script that prints the limit message

Phase 4: StdinWriter + resume logic (depends on: ProcessSupervisor being able to run)
    └── Integration test: verify "continue\r" is received by child

Phase 5: StatusDisplay (depends on: ProcessSupervisor emitting status events)
    └── Can be stubbed in Phase 3; full implementation here

Phase 6: Multiple instances + cli.js wiring (depends on: all above)
    └── End-to-end test with N mock processes
```

**Rationale:** PatternDetector and Scheduler are pure logic with no I/O — build and test them first to validate the core detection algorithm before any process spawning complexity is introduced.

---

## npm Publishing Integration (v1.0.0 Milestone)

**Domain:** npm package publishing with native addon dependency
**Researched:** 2026-02-27
**Confidence:** HIGH

This section covers how publishing integrates with the existing CJS + TypeScript + node-pty architecture. It does not replace the runtime architecture above — it documents the publish-time layer on top of it.

### How node-pty Behaves for Downstream Installers

node-pty v1.1.0 ships **prebuilt binaries** for four platforms inside its own npm package:

```
node_modules/node-pty/prebuilds/
├── darwin-arm64/   ← macOS Apple Silicon
├── darwin-x64/     ← macOS Intel
├── win32-arm64/    ← Windows ARM
└── win32-x64/      ← Windows x64
```

Its `scripts.install` is `node scripts/prebuild.js || node-gyp rebuild`. The script:
1. Checks whether a prebuilt binary directory exists for the current `${platform}-${arch}`.
2. If found: exits 0 — no compilation needed. Install completes silently.
3. If not found (e.g. Linux, or an unsupported architecture): falls back to `node-gyp rebuild`, which requires build tools (Python, C++ compiler, make).

**Implication for claude-auto-continue:** Installing `claude-auto-continue` on macOS and Windows will succeed silently for the vast majority of users because node-pty ships matching prebuilts. Linux users need build tools (`sudo apt install -y make python build-essential` or equivalent). This is the same requirement as VS Code on Linux — not unusual for developer tools. The README must document this clearly.

**This project does NOT need to ship its own prebuilts.** node-pty handles that. claude-auto-continue only ships compiled TypeScript (dist/) and the thin bin wrapper.

### Package Contents: What Gets Published

`npm pack --dry-run` confirms the current package tarball contains exactly the right files:

```
claude-auto-continue-0.1.0.tgz (17.4 kB packed, 61.3 kB unpacked)
├── bin/claude-auto-continue.js        ← shebang wrapper, requires dist/cli.js
├── dist/cli.js + cli.js.map           ← entry point
├── dist/cli.d.ts                      ← type declarations
├── dist/[all other modules].js        ← compiled CJS
├── dist/[all other modules].js.map    ← source maps
├── dist/[all other modules].d.ts      ← type declarations
└── package.json                       ← always included by npm
```

**README.md is not yet present** — it needs to be created. Once created at the project root, npm automatically includes it regardless of the `files` field. This is npm's built-in behavior: `package.json`, `README` (any case, any extension), `LICENSE`, and `CHANGELOG` are always included even when a `files` whitelist exists.

### files Field Assessment

The current `files` field is correct and needs no changes:

```json
"files": [
  "dist/",
  "bin/"
]
```

What this correctly includes:
- `dist/` — all compiled JS, source maps, and `.d.ts` declarations
- `bin/` — the shebang wrapper

What this correctly excludes (not in `files` and not auto-included):
- `src/` — TypeScript source files (not needed by installers)
- `test/` — test files
- `tsconfig.json`, `vitest.config.ts` — dev tooling
- `node_modules/` — always excluded by npm
- `.planning/` — internal project management

**Source maps (.js.map):** Including them is the right call for a CLI tool. They are small (the entire dist/ is 61 kB unpacked), enable meaningful stack traces in bug reports, and follow TypeScript publishing best practice. No reason to exclude.

**Type declarations (.d.ts):** Including them is the right call. If anyone requires this module programmatically (not the primary use case but possible), they get full TypeScript types. The `"main": "dist/index.js"` field should have a corresponding `"types": "dist/index.d.ts"` added to package.json for completeness.

### .npmignore: Not Needed

The `files` whitelist approach already correctly scopes the package. Adding a `.npmignore` would create a parallel system to maintain. The npm docs recommend: if you have a `files` field, do not also maintain `.npmignore`. The current approach is idiomatic.

**One exception:** If `.gitignore` exists at the root and no `.npmignore` exists, npm falls back to `.gitignore` as the exclude list. Since `files` is set, `.gitignore` fallback is irrelevant — the `files` whitelist takes full precedence.

### package.json Modifications Required

The following fields need updating before publish:

| Field | Current Value | Required Value | Why |
|-------|--------------|----------------|-----|
| `version` | `"0.1.0"` | `"1.0.0"` | Milestone goal; signals stable public API |
| `author` | `""` | `"Your Name <email>"` | Required for npm registry listing; blank looks abandoned |
| `types` | missing | `"dist/index.d.ts"` | Points TypeScript consumers to type declarations |
| `repository` | missing | `{ "type": "git", "url": "..." }` | Displays on npm page; enables `npm repo` command |
| `homepage` | missing | GitHub repo URL | Optional but improves npm page discoverability |

Fields that are already correct and need no changes:
- `name`: `"claude-auto-continue"` — unique on npm registry
- `description`: accurate
- `main`: `"dist/index.js"` — correct CJS entry
- `bin`: both `claude-auto-continue` and `cac` aliases — correct
- `files`: `["dist/", "bin/"]` — correct whitelist
- `engines`: `"node": ">=18"` — correct minimum
- `keywords`: appropriate for discoverability
- `license`: `"ISC"` — fine
- `scripts.prepublishOnly`: runs `npm run build` before publish — correct safeguard
- `dependencies`: `node-pty` and `strip-ansi` — both runtime dependencies, correct

### README.md Integration

README.md is a **new file** at the project root. It is not inside `dist/` or `bin/`. npm automatically includes any file named `README` (case-insensitive, any extension) regardless of the `files` field — so it will be published without any changes to `files`.

The README must exist before running `npm publish`. npm warns and may error if it is missing.

Recommended sections for this tool's README:
1. One-line description + badge (npm version)
2. Install (`npm install -g claude-auto-continue`)
3. Usage (how to run it, what `cac` alias is)
4. How it works (brief — what it detects, what it does)
5. Requirements (Node >= 18; Linux build tools for Linux users)
6. License

### Pre-publish Build Flow

The `prepublishOnly` script already handles build ordering:

```
npm publish
    │
    └── triggers prepublishOnly
            │
            └── npm run build (tsc)
                    │
                    └── compiles src/*.ts → dist/*.js + dist/*.d.ts + dist/*.js.map
                            │
                            └── pack tarball from files field
                                    │
                                    └── upload to registry
```

No manual build step required. The TypeScript compiler must succeed or publish is aborted.

**Verification before publish:** Run `npm pack` (without `--dry-run`) to create the actual tarball locally and inspect it. This catches issues like missing dist/ (if build failed) or accidentally excluded files.

### New Files Required for This Milestone

| File | Status | Action |
|------|--------|--------|
| `README.md` | Does not exist | Create at project root |
| `package.json` | Exists, needs edits | Bump `version`, fill `author`, add `types` + `repository` |

No other files need to be created or modified.

### File Structure After Milestone Completion

```
claude-auto-continue/          ← project root
├── README.md                  ← NEW: required for npm page and auto-included in tarball
├── bin/
│   └── claude-auto-continue.js   ← unchanged shebang wrapper
├── dist/                          ← unchanged compiled output
│   ├── cli.js
│   ├── cli.d.ts
│   ├── cli.js.map
│   └── [other modules...]
├── src/                           ← unchanged TypeScript source (not published)
├── test/                          ← unchanged tests (not published)
├── package.json                   ← MODIFIED: version, author, types, repository
├── tsconfig.json                  ← unchanged
└── vitest.config.ts               ← unchanged
```

### Build Order for This Milestone

Dependencies flow in this order:

```
1. package.json metadata edits
   (version, author, types, repository — no build step needed)
        │
        ▼
2. README.md creation
   (content depends on understanding what the tool does — already known)
        │
        ▼
3. npm run build  (tsc)
   (produces dist/ from src/; .d.ts and .js.map included automatically)
        │
        ▼
4. npm pack  (verify tarball contents)
   (confirm README.md + dist/ + bin/ all present; check total size)
        │
        ▼
5. npm publish
   (prepublishOnly re-runs build as a safeguard; uploads to registry)
```

**Rationale for this order:** Metadata and README are pure text edits — no dependencies. Build must come before pack/publish. Verification with `npm pack` before `npm publish` catches any surprises without actually publishing.

### Anti-Patterns for npm Publishing

**Anti-Pattern: Publishing before building.** The `prepublishOnly` script guards against this, but if someone bypasses it with `--ignore-scripts`, they will publish the previous build's dist/. Never use `--ignore-scripts` during publish.

**Anti-Pattern: Adding .npmignore alongside files field.** Creates two competing exclude systems. The `files` whitelist already does the job precisely. A .npmignore adds maintenance burden and can accidentally suppress files listed in `files` (npm applies both).

**Anti-Pattern: Omitting the `author` field.** npm displays packages with a blank author field as looking abandoned or suspicious. Fill it in — it takes 10 seconds.

**Anti-Pattern: Using `npm version patch` without checking the current state.** Since we are jumping from 0.1.0 to 1.0.0 (not a simple bump), use `npm version 1.0.0` or edit package.json directly. Do not use `patch` or `minor` for this specific jump.

## Sources

- [Node.js Child Process Documentation](https://nodejs.org/api/child_process.html) — official, HIGH confidence
- [microsoft/node-pty GitHub](https://github.com/microsoft/node-pty) — official, HIGH confidence; ~1.3M weekly downloads, actively maintained by Microsoft, used by VS Code
- [Claude Code issue #771: Cannot spawn from Node.js](https://github.com/anthropics/claude-code/issues/771) — HIGH confidence; documents the PTY requirement
- [Claude Code issue #9236: Usage limit message format](https://github.com/anthropics/claude-code/issues/9236) — HIGH confidence; confirms exact message text: "Claude usage limit reached. Your limit will reset at [TIME] ([TIMEZONE])"
- [Claude Code headless/programmatic docs](https://code.claude.com/docs/en/headless) — official, HIGH confidence; confirms `-p` mode and `--continue` flag
- [Claude AI usage limit issue #2087](https://github.com/anthropics/claude-code/issues/2087) — MEDIUM confidence; shows pipe-delimited unix timestamp format `Claude AI usage limit reached|<unix_timestamp>` in issue titles (may be internal format)
- [terryso/claude-auto-resume architecture](https://github.com/terryso/claude-auto-resume) — MEDIUM confidence; shell script reference implementation using `--dangerously-skip-permissions` and `-c` flag
- [strip-ansi npm package](https://www.npmjs.com/package/strip-ansi) — HIGH confidence; 290M+ weekly downloads; standard tool for cleaning PTY output before pattern matching
- [Node.js stdout buffering issue discussion](https://github.com/nodejs/node/issues/6379) — MEDIUM confidence; confirms chunk-based delivery and need for buffer accumulation
- [Node.js child_process spawn with node-pty comparison, Snyk](https://snyk.io/advisor/npm-package/node-pty/example) — MEDIUM confidence
- [node-pty v1.1.0 package.json + prebuild.js — inspected locally](https://github.com/microsoft/node-pty) — HIGH confidence; confirms prebuilt binary strategy for darwin-arm64, darwin-x64, win32-arm64, win32-x64
- [npm files field and README auto-inclusion behavior](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#files) — HIGH confidence; README always included regardless of files field
- [npm pack --dry-run output — verified locally](https://docs.npmjs.com/cli/v10/commands/npm-pack) — HIGH confidence; tarball is 17.4 kB packed, 61.3 kB unpacked, 29 files

---
*Architecture research for: CLI process wrapper / Claude Code auto-continue tool*
*Researched: 2026-02-27*
