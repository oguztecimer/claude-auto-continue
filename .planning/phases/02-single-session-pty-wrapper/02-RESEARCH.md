# Phase 2: Single-Session PTY Wrapper - Research

**Researched:** 2026-02-27
**Domain:** Node.js PTY spawning, transparent I/O passthrough, state machine, EPIPE error handling
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFR-01 | Tool spawns Claude Code via node-pty (required — Claude Code hangs without real TTY) | node-pty v1.1.0 `spawn()` API documented; `IPtyForkOptions` covers all required spawn options; native module install path confirmed |
| INFR-02 | Tool passes through Claude Code I/O transparently to the user's terminal | Transparent passthrough pattern documented: `onData` → `process.stdout.write`, `process.stdin.on('data')` → `pty.write()`; raw mode and resize (SIGWINCH) patterns confirmed |
| RESM-01 | Tool waits until the parsed reset time before attempting to resume | `Scheduler` from Phase 1 is the direct implementation — `scheduleAt(resetTime, callback)` handles all timing logic; integrates directly into `ProcessSupervisor` |
| RESM-02 | Tool sends "continue" to the paused Claude Code session at reset time | Resume sequence confirmed from autoclaude: `\x1b` (Escape) → `"continue"` → `\r`; `pty.write()` is the send mechanism |
| RESM-04 | Tool handles EPIPE errors gracefully if Claude Code process dies during wait | `try/catch` around `pty.write()` in `StdinWriter`; `onExit` listener to set a `#dead` flag before any write attempt; no EPIPE bubbles to unhandled exception |
</phase_requirements>

---

## Summary

Phase 2 assembles three pure-logic modules from Phase 1 (`PatternDetector`, `Scheduler`, config) into a single orchestrating class — `ProcessSupervisor` — that spawns Claude Code via node-pty, runs a four-state machine, and sends "continue" at the right moment. The technical challenge is not the I/O passthrough (that is a standard four-line pattern) but rather: the correct resume key sequence, the post-resume false-positive window, and EPIPE-safe writing.

The critical finding from prior-art research (autoclaude) is that the resume sequence is **`\x1b` (Escape) then `"continue"` then `\r`** — not bare `"continue\r"`. Claude Code's rate-limit UI intercepts keyboard input and requires an Escape keypress to return to the normal prompt before the "continue" text is accepted. This was the most uncertain point flagged in STATE.md ("Exact resume command sequence uncertain") and is now confirmed at MEDIUM confidence by one real-world tool demonstrating this pattern.

The post-resume false-positive risk (issue #14129) is real but scoped: the `/rate-limit-options` command can persist in compacted conversation history and re-trigger detection immediately after resume. The mitigation is a configurable cooldown period (default 30 seconds) during which `PatternDetector.feed()` output is still passed through but the `limit` event is ignored. This makes `detector.reset()` insufficient alone — a `#cooldownUntil` timestamp in `ProcessSupervisor` must gate re-entry into `LIMIT_DETECTED` state.

**Primary recommendation:** Build `ProcessSupervisor` as a class with `spawn(command, args)` and `shutdown()`. It owns one `IPty` instance, one `PatternDetector`, one `Scheduler`, and a four-value state enum. Transparent passthrough is four lines; the state machine is a simple switch. The EPIPE guard is a `try/catch` in a dedicated `StdinWriter.write()` helper with a `#dead` flag set in the `onExit` handler.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node-pty | 1.1.0 (stable) | Spawn Claude Code in a real PTY; `onData`/`write()`/`onExit` | Only option — Claude Code hangs with `child_process.spawn` (no real TTY); decision locked in roadmap; 721+ dependents, Microsoft-maintained |
| PatternDetector | Phase 1 (local) | Detect rate-limit message, emit `limit` event with `resetTime` | Built in Phase 1; tested with 30 passing tests; no additional dependency |
| Scheduler | Phase 1 (local) | Wait until `resetTime + safetyBuffer`, fire callback | Built in Phase 1; uses `setTimeout` anchored to wall-clock time |
| Node.js process | built-in | `process.stdin`, `process.stdout`, `process.stdin.setRawMode()`, resize via `process.stdout.on('resize')` | Built-in; provides current terminal dimensions for `cols`/`rows` on spawn |
| Node.js EventEmitter | built-in | `ProcessSupervisor` optionally extends for state-change notifications | Built-in; consistent with Phase 1 module pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript | 5.x (existing) | Type-safe state enum, `IPty` interface, `StdinWriter` | Already in project — no new dependency |
| vitest | 2.x (existing) | Unit tests for `StdinWriter` and `ProcessSupervisor` state transitions (with mocked IPty) | Already in project — no new dependency |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node-pty 1.1.0 stable | 1.2.0-beta.3 | Beta has unconfirmed stability; 1.1.0 is the current npm `latest`; no feature of 1.2.0-beta needed for this phase |
| Escape + "continue" + CR | bare "continue\r" | Bare "continue\r" would only work if Claude Code is already at an interactive prompt; the rate-limit UI intercepts input and requires Escape to dismiss first (confirmed by autoclaude implementation) |
| `process.stdout.on('resize')` for SIGWINCH | explicit `process.on('SIGWINCH', ...)` | Node.js fires `'resize'` on `process.stdout` for terminal size changes — no manual SIGWINCH handling needed in modern Node.js |

**Installation:**
```bash
npm install node-pty
```

node-pty is a native module. It ships prebuilt binaries for macOS and Linux (via `node-pre-gyp`). If prebuilts are unavailable for a platform/Node version, it falls back to `node-gyp rebuild`, which requires Xcode Command Line Tools on macOS (already present in any Node.js development environment).

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── PatternDetector.ts   # Phase 1 — unchanged
├── Scheduler.ts         # Phase 1 — unchanged
├── config.ts            # Phase 1 — unchanged
├── ProcessSupervisor.ts # Phase 2 — orchestrator (state machine + pty spawn)
└── StdinWriter.ts       # Phase 2 — EPIPE-safe write wrapper
test/
├── PatternDetector.test.ts  # Phase 1 — unchanged (30 tests passing)
├── Scheduler.test.ts        # Phase 1 — unchanged
├── config.test.ts           # Phase 1 — unchanged
├── StdinWriter.test.ts      # Phase 2 — unit tests for write guard
└── ProcessSupervisor.test.ts # Phase 2 — state machine tests with mocked IPty
```

### Pattern 1: Four-State Machine

**What:** A TypeScript enum with four values transitions linearly with one backward arc for re-arm:

```
RUNNING → LIMIT_DETECTED → WAITING → RESUMING → RUNNING (loop)
```

- `RUNNING`: PTY is spawned, I/O is flowing, `PatternDetector` is receiving output
- `LIMIT_DETECTED`: `'limit'` event fired; `Scheduler.scheduleAt()` called; cooldown timer started; state transitions immediately to `WAITING`
- `WAITING`: No stdin forwarded to PTY (suppressed during wait). Scheduler is ticking.
- `RESUMING`: Scheduler fires; `StdinWriter.write('\x1b')` + `StdinWriter.write('continue\r')` sent; `PatternDetector.reset()` called after cooldown; state transitions back to `RUNNING`

**When to use:** Every state check in `ProcessSupervisor` branches on this enum, not on ad-hoc boolean flags. This prevents state explosion with multiple overlapping flags.

**Example:**
```typescript
// Source: architecture based on node-pty v1.1.0 IPty interface + Phase 1 modules

export const enum SessionState {
  RUNNING        = 'RUNNING',
  LIMIT_DETECTED = 'LIMIT_DETECTED',
  WAITING        = 'WAITING',
  RESUMING       = 'RESUMING',
}
```

### Pattern 2: Transparent PTY Passthrough

**What:** Four lines of code that make the PTY session completely invisible to the user — all Claude Code output flows to `process.stdout`, all user keystrokes flow to the PTY. Raw mode suppresses the parent terminal's echo (otherwise characters appear twice — once from the parent TTY's echo and once from the PTY's echo).

**Critical:** `process.stdin.setRawMode(true)` MUST be called before listening to `process.stdin` data events. Raw mode is only available when `process.stdin.isTTY` is true (i.e., when the wrapper is run interactively, not piped).

**When to use:** `RUNNING` state only. During `WAITING` state, stdin must NOT be forwarded to the PTY — the user's keystrokes are discarded (or buffered). This prevents accidental interference with the paused Claude Code session.

**Example:**
```typescript
// Source: node-pty v1.1.0 IPty API + Node.js TTY documentation
// Reference: github.com/microsoft/node-pty/issues/413 (process.stdin.unref fix)
// Reference: github.com/microsoft/node-pty/issues/78 (setRawMode echo fix)

private attachPassthrough(pty: IPty): void {
  // Forward PTY output → user's terminal
  pty.onData((data) => {
    process.stdout.write(data);
    // Only feed to detector when RUNNING (not WAITING/RESUMING)
    if (this.#state === SessionState.RUNNING) {
      this.#detector.feed(data);
    }
  });

  // Forward user keystrokes → PTY (only when RUNNING)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.on('data', (data: Buffer) => {
    if (this.#state === SessionState.RUNNING) {
      this.#writer.write(data.toString());
    }
    // During WAITING/RESUMING: discard user input (Claude is paused)
  });

  // Keep PTY dimensions in sync with parent terminal
  process.stdout.on('resize', () => {
    pty.resize(process.stdout.columns, process.stdout.rows);
  });

  // On PTY exit: clean up
  pty.onExit(({ exitCode }) => {
    process.stdin.unref(); // Allow Node to exit — removes stdin from ref count
    this.#writer.markDead(); // EPIPE guard
    process.exit(exitCode ?? 0);
  });
}
```

### Pattern 3: EPIPE-Safe StdinWriter

**What:** A thin wrapper around `pty.write()` that catches EPIPE errors and ignores them. Two failure modes exist: (1) the write call itself throws synchronously with `EPIPE`, and (2) the write call succeeds but the PTY's underlying stream is already dead (race condition). The `#dead` flag, set in the `onExit` handler, prevents writes after the PTY has exited cleanly.

**Why it matters:** Without this guard, calling `pty.write('continue\r')` after Claude Code has exited (e.g., it crashed during the wait window) throws an unhandled exception and crashes the wrapper process — exactly what RESM-04 forbids.

**Example:**
```typescript
// Source: node-pty issues #457, #512 — EPIPE from write after process exit
// Reference: Node.js EPIPE error documentation

export class StdinWriter {
  readonly #pty: IPty;
  #dead = false;

  constructor(pty: IPty) {
    this.#pty = pty;
  }

  /**
   * Write data to the PTY stdin. No-ops silently if the PTY has already exited.
   * Catches EPIPE errors that can occur when the write races with process exit.
   */
  write(data: string): void {
    if (this.#dead) return;
    try {
      this.#pty.write(data);
    } catch (err: unknown) {
      // EPIPE = broken pipe = PTY process exited between dead-check and write
      // All other errors are also swallowed here — the PTY is gone, nothing to do
      // Log to stderr for diagnostics but do not rethrow
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EPIPE') {
        process.stderr.write(`[StdinWriter] unexpected write error: ${code}\n`);
      }
    }
  }

  /**
   * Mark the PTY as dead. Called from the onExit handler.
   * After this, all write() calls are no-ops.
   */
  markDead(): void {
    this.#dead = true;
  }
}
```

### Pattern 4: Resume Sequence

**What:** To resume a paused Claude Code session, the tool must send three things in order:
1. `\x1b` — Escape keypress, to dismiss the rate-limit UI and return to the interactive prompt
2. `"continue"` — the text to type
3. `\r` — carriage return (Enter key in raw mode / PTY context)

**Evidence:** Confirmed by autoclaude (Go-based tool, `henryaj/autoclaude`) which uses the sequence `Escape → continue → Enter` when sending to tmux panes monitoring Claude Code. This is the only external tool with a public implementation that has confirmed working resume behavior.

**When to use:** Transition from `WAITING` to `RESUMING` state. After the Scheduler callback fires, call `writer.write('\x1b')` then `writer.write('continue\r')`.

**Timing note:** A brief delay (e.g. 50–100ms) between Escape and "continue" may be needed to allow Claude Code's UI to process the Escape keystroke before receiving the text. This needs empirical verification — flag as open question.

### Pattern 5: Post-Resume Cooldown

**What:** After sending "continue", suppress re-detection for a configurable cooldown period (default 30 seconds). During cooldown, `PatternDetector.feed()` still receives PTY output (for passthrough), but the `'limit'` event is ignored by `ProcessSupervisor`.

**Why:** Claude Code issue #14129 documents that `/rate-limit-options` can persist in compacted conversation history and re-execute immediately on session resume, generating a second rate-limit detection. A 30-second cooldown absorbs this false positive.

**How:** Set `#cooldownUntil = Date.now() + COOLDOWN_MS` after the resume writes are sent. In the `'limit'` event handler, check `Date.now() >= this.#cooldownUntil` before transitioning state.

```typescript
private onLimitDetected(event: LimitEvent): void {
  // Ignore detections during post-resume cooldown
  if (Date.now() < this.#cooldownUntil) return;

  this.#state = SessionState.LIMIT_DETECTED;
  process.stderr.write(`[SessionState] → LIMIT_DETECTED (resets: ${event.resetTime?.toISOString()})\n`);

  this.#scheduler.scheduleAt(event.resetTime, () => this.onResumeReady());
  this.#state = SessionState.WAITING;
  process.stderr.write(`[SessionState] → WAITING\n`);
}

private onResumeReady(): void {
  this.#state = SessionState.RESUMING;
  process.stderr.write(`[SessionState] → RESUMING\n`);

  this.#writer.write('\x1b');       // Escape — dismiss rate-limit UI
  this.#writer.write('continue\r'); // "continue" + Enter

  this.#cooldownUntil = Date.now() + COOLDOWN_MS; // suppress false positives
  this.#detector.reset();           // re-arm for future detection

  this.#state = SessionState.RUNNING;
  process.stderr.write(`[SessionState] → RUNNING\n`);
}
```

### Anti-Patterns to Avoid

- **Forwarding stdin during WAITING state:** The PTY session is paused; user keystrokes sent during wait are unpredictable. Discard or buffer them.
- **Calling `PatternDetector.feed()` with PTY data during WAITING/RESUMING:** The rate-limit message is likely still in the output buffer when state transitions. Feed the detector only in RUNNING state to avoid re-triggering during transition.
- **Not calling `process.stdin.unref()`:** Without `unref()`, Node.js holds a reference to the stdin stream and the process hangs after the PTY exits. This is a documented node-pty gotcha (issue #413).
- **Not calling `process.stdin.setRawMode(true)`:** Without raw mode, the parent terminal echoes every keystroke before forwarding to the PTY, causing doubled output. Only set raw mode when `process.stdin.isTTY` is true.
- **Bare `"continue\r"` without Escape prefix:** The rate-limit UI intercepts input. Sending "continue\r" without Escape first will not type "continue" at the interactive prompt.
- **Using `setTimeout` for cooldown with a fixed 30s delay in Scheduler:** The cooldown is a `Date.now()` comparison in `ProcessSupervisor`, not a Scheduler event. The Scheduler is exclusively for the wait-to-resume timing.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PTY spawning | Custom `child_process.spawn` with manual TTY | `node-pty` | Claude Code detects whether it has a real TTY and hangs or degrades without one; node-pty creates a proper pseudoterminal pair |
| ANSI stripping | Custom regex | `strip-ansi@6.x` (Phase 1 — already installed) | Already in project; handles OSC sequences; no new dependency |
| Rate-limit detection | New detection logic | `PatternDetector` (Phase 1 — already built) | 30 unit tests covering all three rate-limit message formats |
| Timing/wait | Custom setTimeout wrapper | `Scheduler` (Phase 1 — already built) | Wall-clock anchored, cancellable, tested |
| EPIPE handling | Swallow all write errors in PTY itself | `StdinWriter` wrapper (thin, 20 lines) | node-pty's `write()` throws synchronously on EPIPE; wrapping in a dedicated class keeps EPIPE concern isolated |

**Key insight:** Phase 2 is almost entirely about assembly, not construction. The hard detection and scheduling logic is already tested. The only new code is: `ProcessSupervisor` (state machine + passthrough wiring) and `StdinWriter` (20-line EPIPE guard). The research surfaces this clearly — resist the urge to rebuild detection logic in the PTY layer.

---

## Common Pitfalls

### Pitfall 1: Claude Code Hangs Without Real PTY

**What goes wrong:** Spawning Claude Code via `child_process.spawn` (even with `{stdio: 'inherit'}`) causes Claude Code to detect the absence of a real TTY and either hang, run in a degraded non-interactive mode, or refuse to start interactive sessions.

**Why it happens:** Claude Code checks `process.stdin.isTTY` and underlying TTY ioctls to determine if it's running interactively. `child_process.spawn` with piped stdio does not create a PTY.

**How to avoid:** Always use `node-pty.spawn()`. This is the non-negotiable decision from the roadmap.

**Warning signs:** Claude Code starts but immediately exits, or hangs at a blank prompt, or outputs "not a tty" errors.

### Pitfall 2: Double Echo Without Raw Mode

**What goes wrong:** User types "ls" and sees "llss" (doubled) in the terminal — each character appears twice.

**Why it happens:** The parent terminal echoes keystrokes before forwarding them to node-pty; the PTY also has its own echo. Both echo the same character.

**How to avoid:** Call `process.stdin.setRawMode(true)` before attaching the stdin data listener. Only works when `process.stdin.isTTY` is true.

**Warning signs:** All user input appears doubled in the terminal.

### Pitfall 3: EPIPE Crashes Wrapper When PTY Exits During Wait

**What goes wrong:** The Scheduler fires after the wait window and calls `pty.write('continue\r')`, but Claude Code has already exited (crashed, user closed it, network issue). The `write()` call throws `EPIPE`. No error handler exists. Node.js crashes with `unhandledError: EPIPE`.

**Why it happens:** node-pty's `write()` method throws synchronously on a closed file descriptor. This is the exact scenario in RESM-04.

**How to avoid:** (1) Set `#dead = true` in the `onExit` handler before any write attempts; (2) Wrap `pty.write()` in `try/catch`; (3) Use `StdinWriter.write()` for all writes.

**Warning signs:** Uncaught `EPIPE` error in stderr when the wait window fires after PTY exit. The process dies instead of exiting cleanly.

### Pitfall 4: Node Process Hangs After PTY Exits

**What goes wrong:** The PTY exits (Claude Code session ends normally), but the wrapper process hangs and never returns control to the shell.

**Why it happens:** `process.stdin.on('data', ...)` holds a reference that prevents Node from exiting. stdin is an open file descriptor; if it has an event listener, Node waits for more data.

**How to avoid:** Call `process.stdin.unref()` in the `onExit` handler. This removes stdin from Node's reference count and allows natural process exit.

**Warning signs:** The terminal prompt doesn't return after Claude Code exits. `Ctrl+C` is needed to regain the shell.

### Pitfall 5: Post-Resume False Positive (Issue #14129)

**What goes wrong:** After sending "continue", Claude Code re-runs `/rate-limit-options` from compacted conversation history. This emits a new rate-limit message within seconds of the resume, immediately triggering `LIMIT_DETECTED` again. The tool enters an infinite resume loop.

**Why it happens:** `/rate-limit-options` can be embedded in the auto-compacted conversation context and re-executed on session resume — a known Claude Code bug.

**How to avoid:** `#cooldownUntil` gate in `ProcessSupervisor.onLimitDetected()`. Default cooldown of 30 seconds. The actual duration is uncertain — 30 seconds may be too short if the re-execution delay varies. Make cooldown configurable.

**Warning signs:** The tool sends "continue" then immediately enters `LIMIT_DETECTED` again within 1–10 seconds of resuming. Watch for rapid state cycling: `RUNNING → LIMIT_DETECTED → WAITING → RESUMING → RUNNING → LIMIT_DETECTED` with no user interaction.

### Pitfall 6: Feeding PTY Output to Detector in Wrong States

**What goes wrong:** `PatternDetector.feed()` is called in ALL states, including `WAITING` and `RESUMING`. When the PTY resumes, the first chunks of output may still contain the rate-limit message (it's in the PTY's output buffer). Detection fires immediately after resume, before the cooldown check.

**How to avoid:** Only call `detector.feed()` in `RUNNING` state. The cooldown window already guards against re-detection, but combining it with state-gated feeding provides defense in depth.

---

## Code Examples

### Complete ProcessSupervisor Skeleton

```typescript
// src/ProcessSupervisor.ts
// Source: node-pty v1.1.0 IPty interface; github.com/microsoft/node-pty issues #78, #413

import * as pty from 'node-pty';
import { PatternDetector, LimitEvent } from './PatternDetector.js';
import { Scheduler } from './Scheduler.js';
import { StdinWriter } from './StdinWriter.js';

export const enum SessionState {
  RUNNING        = 'RUNNING',
  LIMIT_DETECTED = 'LIMIT_DETECTED',
  WAITING        = 'WAITING',
  RESUMING       = 'RESUMING',
}

const COOLDOWN_MS = 30_000; // 30s post-resume false-positive suppression

export class ProcessSupervisor {
  #state: SessionState = SessionState.RUNNING;
  #pty: pty.IPty | null = null;
  #detector: PatternDetector;
  #scheduler: Scheduler;
  #writer: StdinWriter | null = null;
  #cooldownUntil = 0;

  constructor() {
    this.#detector = new PatternDetector();
    this.#scheduler = new Scheduler();

    this.#detector.on('limit', (event: LimitEvent) => this.#onLimitDetected(event));
  }

  spawn(command: string, args: string[]): void {
    const ptyProcess = pty.spawn(command, args, {
      name: process.env.TERM ?? 'xterm-256color',
      cols: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
      cwd: process.cwd(),
      env: process.env as { [key: string]: string },
    });

    this.#pty = ptyProcess;
    this.#writer = new StdinWriter(ptyProcess);

    // PTY output → passthrough + detection
    ptyProcess.onData((data) => {
      process.stdout.write(data);
      if (this.#state === SessionState.RUNNING) {
        this.#detector.feed(data);
      }
    });

    // User keyboard → PTY (only when RUNNING)
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.on('data', (data: Buffer) => {
      if (this.#state === SessionState.RUNNING) {
        this.#writer!.write(data.toString());
      }
    });

    // Terminal resize → PTY
    process.stdout.on('resize', () => {
      ptyProcess.resize(
        process.stdout.columns ?? 80,
        process.stdout.rows ?? 24
      );
    });

    // PTY exit → clean up
    ptyProcess.onExit(({ exitCode }) => {
      this.#writer!.markDead();
      this.#scheduler.cancel();
      process.stdin.unref(); // Allow Node to exit
      process.exit(exitCode ?? 0);
    });

    process.stderr.write(`[SessionState] RUNNING\n`);
  }

  #onLimitDetected(event: LimitEvent): void {
    if (Date.now() < this.#cooldownUntil) return; // post-resume suppression

    this.#state = SessionState.LIMIT_DETECTED;
    process.stderr.write(`[SessionState] LIMIT_DETECTED (resets: ${event.resetTime?.toISOString() ?? 'unknown'})\n`);

    this.#scheduler.scheduleAt(event.resetTime, () => this.#onResumeReady());
    this.#state = SessionState.WAITING;
    process.stderr.write(`[SessionState] WAITING\n`);
  }

  #onResumeReady(): void {
    if (!this.#writer) return;

    this.#state = SessionState.RESUMING;
    process.stderr.write(`[SessionState] RESUMING\n`);

    // Resume sequence: Escape (dismiss rate-limit UI) → "continue" → Enter
    this.#writer.write('\x1b');
    this.#writer.write('continue\r');

    // Set cooldown BEFORE reset to suppress any immediate re-detection
    this.#cooldownUntil = Date.now() + COOLDOWN_MS;
    this.#detector.reset(); // re-arm for next limit

    this.#state = SessionState.RUNNING;
    process.stderr.write(`[SessionState] RUNNING\n`);
  }

  shutdown(): void {
    this.#scheduler.cancel();
    if (this.#pty) {
      this.#writer?.markDead();
      this.#pty.kill();
    }
  }
}
```

### Complete StdinWriter

```typescript
// src/StdinWriter.ts
// Source: EPIPE handling pattern from node-pty issues #457, #512

import type * as pty from 'node-pty';

export class StdinWriter {
  readonly #pty: pty.IPty;
  #dead = false;

  constructor(ptyProcess: pty.IPty) {
    this.#pty = ptyProcess;
  }

  write(data: string): void {
    if (this.#dead) return;
    try {
      this.#pty.write(data);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EPIPE') {
        process.stderr.write(`[StdinWriter] write error: ${code ?? String(err)}\n`);
      }
      // EPIPE: PTY process exited; no action needed
    }
  }

  markDead(): void {
    this.#dead = true;
  }

  get isDead(): boolean {
    return this.#dead;
  }
}
```

### StdinWriter Unit Test

```typescript
// test/StdinWriter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { StdinWriter } from '../src/StdinWriter.js';
import type * as pty from 'node-pty';

function makeMockPty(overrides: Partial<pty.IPty> = {}): pty.IPty {
  return {
    write: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    clear: vi.fn(),
    pid: 1234,
    cols: 80,
    rows: 24,
    process: 'claude',
    handleFlowControl: false,
    ...overrides,
  } as unknown as pty.IPty;
}

describe('StdinWriter', () => {
  it('forwards writes to the PTY', () => {
    const mock = makeMockPty();
    const writer = new StdinWriter(mock);
    writer.write('hello');
    expect(mock.write).toHaveBeenCalledWith('hello');
  });

  it('is a no-op after markDead()', () => {
    const mock = makeMockPty();
    const writer = new StdinWriter(mock);
    writer.markDead();
    writer.write('hello');
    expect(mock.write).not.toHaveBeenCalled();
  });

  it('catches EPIPE errors without throwing', () => {
    const epipeError = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
    const mock = makeMockPty({ write: vi.fn().mockImplementation(() => { throw epipeError; }) });
    const writer = new StdinWriter(mock);
    expect(() => writer.write('hello')).not.toThrow();
  });

  it('logs non-EPIPE errors to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const unknownError = Object.assign(new Error('EBADF'), { code: 'EBADF' });
    const mock = makeMockPty({ write: vi.fn().mockImplementation(() => { throw unknownError; }) });
    const writer = new StdinWriter(mock);
    writer.write('hello');
    expect(stderrSpy).toHaveBeenCalled();
    stderrSpy.mockRestore();
  });

  it('exposes isDead getter', () => {
    const mock = makeMockPty();
    const writer = new StdinWriter(mock);
    expect(writer.isDead).toBe(false);
    writer.markDead();
    expect(writer.isDead).toBe(true);
  });
});
```

### ProcessSupervisor State Machine Test (Mocked IPty)

```typescript
// test/ProcessSupervisor.test.ts (excerpt)
// Tests state transitions without spawning a real PTY

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The key insight: don't import ProcessSupervisor directly if it side-effects on import.
// Instead, test the state machine logic through a testable subclass or by extracting
// state transition logic into a pure function.
//
// Alternative: Mock 'node-pty' module entirely so spawn() returns a mock IPty.

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    kill: vi.fn(),
    resize: vi.fn(),
    pid: 9999,
    cols: 80,
    rows: 24,
    process: 'claude',
    handleFlowControl: false,
    pause: vi.fn(),
    resume: vi.fn(),
    clear: vi.fn(),
  })),
}));

import { ProcessSupervisor, SessionState } from '../src/ProcessSupervisor.js';

describe('ProcessSupervisor state machine', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts in RUNNING state', () => {
    const supervisor = new ProcessSupervisor();
    expect(supervisor.state).toBe(SessionState.RUNNING);
  });

  // Additional tests: transition RUNNING → LIMIT_DETECTED → WAITING → RESUMING → RUNNING
  // Inject a mock PatternDetector, emit 'limit' event, advance timers, verify states
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `child_process.spawn` for CLI tools | `node-pty.spawn()` for interactive terminal apps | Always required for PTY | `child_process.spawn` cannot create a real PTY; tools like Claude Code hang without one |
| Manual SIGWINCH listener | `process.stdout.on('resize', ...)` | Node.js modernized TTY API | The `'resize'` event on `process.stdout` is the current idiomatic approach; no manual signal handling needed |
| Unconditional `setRawMode(true)` | Guard with `process.stdin.isTTY` check | Best practice | Without the guard, calling `setRawMode` on a non-TTY stdin throws `TypeError: setRawMode is not a function` |
| node-pty 0.x event-style API | node-pty 1.x IEvent-style API (`onData`, `onExit` return IDisposable) | node-pty 0.9.0 | The `.on('data', ...)` EventEmitter API still works in 1.x but IEvent pattern (`ptyProcess.onData(cb)`) is preferred |

**Deprecated/outdated:**
- `.on('data', fn)` EventEmitter pattern on IPty: Works in 1.x due to backward compat, but the IDisposable-returning `onData(fn)` is the typed API and preferred for new code.
- `node-pty 1.2.0-beta.3`: Do not use beta in production; stick to 1.1.0 stable.

---

## Open Questions

1. **Escape-then-"continue" timing**
   - What we know: autoclaude sends `Escape → continue → Enter` as a sequence. The exact delay between Escape and "continue" is not specified.
   - What's unclear: Whether Claude Code processes Escape synchronously (dismiss UI, then accept next input) or asynchronously (Escape enqueues a UI update, needs a tick before "continue" is accepted). If asynchronous, a bare `writer.write('\x1b'); writer.write('continue\r')` may fail.
   - Recommendation: Implement with a 100ms `setTimeout` between Escape and "continue" as a conservative first attempt. Verify empirically against a real rate-limited session. Make the inter-keystroke delay configurable.

2. **Cooldown duration for post-resume false positives**
   - What we know: Issue #14129 documents that `/rate-limit-options` re-executes after resume. The delay between resume and re-execution is unspecified in the issue — could be 1–5 seconds, could be longer.
   - What's unclear: Whether 30 seconds is sufficient. If `/rate-limit-options` re-executes mid-conversation after user starts working, a 30-second cooldown would correctly suppress it; if it fires 31+ seconds after resume, it would be treated as a real new limit.
   - Recommendation: Default 30 seconds. Make configurable via `~/.config/claude-auto-continue/config.json`. Document the tradeoff.

3. **stdin behavior during WAITING state**
   - What we know: User keystrokes are discarded during WAITING. This may frustrate users who want to type in preparation for the resume.
   - What's unclear: Whether buffering keystrokes and replaying after resume is worth the complexity. Buffering could send unexpected input to Claude Code.
   - Recommendation: Discard during WAITING for Phase 2. Phase 3 (status display) will include a visible indicator, reducing user frustration. Buffering is Phase 3+ scope.

4. **ProcessSupervisor testability with mocked node-pty**
   - What we know: `vi.mock('node-pty', ...)` works in vitest for mocking the spawn return value.
   - What's unclear: Whether `ProcessSupervisor`'s constructor options should accept a factory function for `pty.spawn` to enable dependency injection (more testable than module mocking).
   - Recommendation: Accept an optional `spawnFn` constructor parameter. Defaults to `require('node-pty').spawn`. Tests pass a mock factory. This avoids `vi.mock()` module-level magic and makes unit tests more explicit.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 2.1.9 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test` |
| Full suite command | `npm test` (same — no separate integration suite yet) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFR-01 | `spawn()` calls `pty.spawn` with correct options | unit (mock pty) | `npm test -- --reporter=verbose` | ❌ Wave 0 |
| INFR-02 | `onData` output appears in `process.stdout.write` | unit (mock pty + stdout spy) | `npm test -- --reporter=verbose` | ❌ Wave 0 |
| RESM-01 | `Scheduler.scheduleAt(resetTime)` called on limit detection | unit (mock Scheduler + fake timers) | `npm test -- --reporter=verbose` | ❌ Wave 0 |
| RESM-02 | `pty.write('\x1b')` then `pty.write('continue\r')` called on Scheduler callback | unit (mock pty + fake timers) | `npm test -- --reporter=verbose` | ❌ Wave 0 |
| RESM-04 | EPIPE in `pty.write()` does not propagate as unhandled exception | unit (mock pty throws EPIPE) | `npm test -- --reporter=verbose` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (all 30 Phase 1 + all Phase 2 tests) before verification

### Wave 0 Gaps

- [ ] `test/StdinWriter.test.ts` — covers RESM-04 (EPIPE handling)
- [ ] `test/ProcessSupervisor.test.ts` — covers INFR-01, INFR-02, RESM-01, RESM-02, state machine transitions
- [ ] `src/StdinWriter.ts` — needs to exist before tests can import it
- [ ] `src/ProcessSupervisor.ts` — needs to exist before tests can import it
- [ ] `node-pty` added to `package.json` dependencies: `npm install node-pty`

---

## Sources

### Primary (HIGH confidence)

- [node-pty typings/node-pty.d.ts](https://github.com/microsoft/node-pty/blob/main/typings/node-pty.d.ts) — Complete IPty interface, spawn() signature, IEvent, IDisposable, all option types
- [node-pty jsDocs.io v1.1.0](https://www.jsdocs.io/package/node-pty) — API reference confirming current interface shape
- [node-pty Issue #413](https://github.com/microsoft/node-pty/issues/413) — `process.stdin.unref()` required for clean exit; confirmed fix
- [node-pty Issue #78](https://github.com/microsoft/node-pty/issues/78) — `setRawMode(true)` required to prevent double echo; confirmed fix
- [node-pty Issue #512](https://github.com/microsoft/node-pty/issues/512) — EPIPE crash on write after PTY kill; fix via error catching
- [claude-code Issue #14129](https://github.com/anthropics/claude-code/issues/14129) — `/rate-limit-options` re-execution bug after resume; post-resume false positive
- Phase 1 PatternDetector.ts, Scheduler.ts — existing Phase 1 modules (direct code inspection)

### Secondary (MEDIUM confidence)

- [autoclaude henryaj/autoclaude](https://github.com/henryaj/autoclaude) — Resume sequence `Escape → continue → Enter` confirmed as working implementation; verified by site documentation
- [npm node-pty releases](https://github.com/microsoft/node-pty/releases) — v1.1.0 stable, v1.2.0-beta.3 beta; confirmed versions
- [Node.js TTY documentation](https://nodejs.org/api/tty.html) — `setRawMode`, `isTTY`, `resize` event; official docs
- [node-pty README](https://github.com/microsoft/node-pty/blob/main/README.md) — Core API overview, spawn options

### Tertiary (LOW confidence)

- WebSearch results for EPIPE handling patterns (multiple sources, consistent; verified against node-pty issue tracker)
- WebSearch results for node-pty version info (libraries.io + npm registry; consistent across sources)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — node-pty v1.1.0 API fully verified via official typings and jsDocs.io; Phase 1 modules are in-repo and inspected directly
- Architecture (state machine + passthrough): HIGH — patterns drawn from official node-pty issues with confirmed fixes; transparent passthrough is a documented pattern
- Resume sequence (`\x1b` + `continue\r`): MEDIUM — confirmed by one real-world tool (autoclaude); not in official Claude Code documentation; needs empirical verification against a real rate-limited session
- Post-resume cooldown: MEDIUM — issue #14129 confirms the problem exists; 30-second default is an informed estimate, not an empirically measured value
- EPIPE handling: HIGH — synchronous throw from `pty.write()` confirmed in node-pty issues; `try/catch` pattern is the standard mitigation

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (node-pty API is stable; Claude Code resume behavior should be empirically verified before StdinWriter is finalized)
