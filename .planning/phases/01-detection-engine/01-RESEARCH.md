# Phase 1: Detection Engine - Research

**Researched:** 2026-02-27
**Domain:** Node.js pattern detection — rolling buffer, ANSI stripping, EventEmitter API, timestamp parsing
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Rate-limit message format
- Claude determines the default detection regex by researching actual Claude Code rate-limit output
- Rolling buffer handles messages split across multiple PTY data chunks
- Debug/verbose logging mode that shows buffer contents for diagnosing pattern mismatches when the message format changes

#### Configuration surface
- Constructor options for programmatic use: `new PatternDetector({ pattern: /.../ })`
- JSON config file for CLI users at `~/.config/claude-auto-continue/config.json`
- Constructor options override config file values
- Only the detection pattern is configurable — buffer size and other internals are not exposed

#### Detection output shape
- EventEmitter-based API: `detector.on('limit', (result) => ...)`
- Event payload: `{ resetTime: Date | null, rawMatch: string }`
- Emit with `resetTime: null` if timestamp cannot be parsed — caller decides fallback behavior
- Single event type (`limit`) — no additional error or debug events

#### Scheduler timing
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DETC-01 | Tool detects "Claude usage limit reached" message in Claude Code terminal output | Rate-limit message format research confirms two active variants; regex patterns documented in Code Examples section |
| DETC-02 | Tool parses the reset timestamp from the rate-limit message | Two timestamp formats documented: human-readable time+timezone (current format) and legacy pipe-delimited unix timestamp; parsing logic in Code Examples |
| DETC-03 | Tool strips ANSI escape codes before pattern matching to handle colored/styled output | strip-ansi@6.x (CJS-compatible) is the standard; handles all CSI and OSC sequence types; documented in Standard Stack |
| DETC-04 | Tool uses a rolling buffer to handle chunk boundary splitting (message split across data events) | Rolling buffer pattern documented in Architecture Patterns; buffer size recommendation and reset behavior covered |
| DETC-05 | Detection pattern is configurable to handle future Claude Code format changes | Config file at `~/.config/claude-auto-continue/config.json` + constructor option; config loading pattern in Code Examples |
</phase_requirements>

---

## Summary

Phase 1 delivers two pure-logic modules — `PatternDetector` and `Scheduler` — with no I/O dependencies and full unit-test coverage. Neither module touches node-pty, spawns processes, or does file I/O (beyond one-time config loading at construction time). This makes them independently testable with fast feedback loops before PTY complexity is introduced in Phase 2.

The technically interesting part of this phase is the rate-limit message format. Research confirms that Claude Code has used at least **three distinct formats** across different versions and plan tiers. The current format as of early 2026 is `"You've hit your limit · resets [time] ([timezone])"`, but earlier issues show `"Claude usage limit reached. Your limit will reset at [time] ([timezone])"` and the legacy pipe-delimited format `"Claude AI usage limit reached|<unix_timestamp>"`. The default regex must match all three, and the configurable pattern option exists precisely because Anthropic treats terminal output as a UI detail rather than an API contract.

The standard stack for this phase is minimal: `strip-ansi@6.x` (CJS-compatible ANSI stripping), Node.js `fs` and `os` (config file loading), `vitest` (unit testing with fake timers), and `TypeScript` for type safety. No additional libraries are needed. The EventEmitter API, rolling buffer, and scheduler are all implemented directly with Node.js built-ins.

**Primary recommendation:** Build `PatternDetector` as an `EventEmitter` subclass with a 4KB rolling buffer that strips ANSI before matching. Default regex covers all three known format variants. Load config once at construction time from `~/.config/claude-auto-continue/config.json`, overridden by constructor options. Build `Scheduler` as a plain class with `scheduleAt(resetTime, callback)` and `cancel()` backed by `setTimeout` anchored to wall-clock time.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js EventEmitter | built-in | PatternDetector API — emit 'limit' events | Built-in, zero overhead, well-understood interface for async event notification |
| Node.js fs / os | built-in | Config file loading from `~/.config/...` | Built-in, no deps. `os.homedir()` for cross-platform home directory |
| strip-ansi | 6.x (CJS) | Strip ANSI escape codes before regex matching | 290M+ weekly downloads; maintained by Chalk team; handles ALL CSI and OSC sequence types correctly; v6 is last CJS-compatible version |
| TypeScript | 5.x | Type safety on event payloads, config shapes, regex results | Already decided for project; catches class of async IO bugs at compile time |
| vitest | 2.x | Unit testing with fake timers for Scheduler, string fixtures for PatternDetector | Native TS support, `vi.useFakeTimers()` for timer control, 4x faster than Jest cold start |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js path | built-in | Resolving config file path | Used in config loader only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| strip-ansi@6.x | strip-ansi@7.x | v7 is ESM-only — would require `createRequire` workaround in a CommonJS project. v6 has identical API, identical behavior, still maintained. No reason to use v7 in a CJS project. |
| strip-ansi@6.x | Custom ANSI regex | Hand-rolled regex consistently misses OSC sequences (`\x1b]...ST`) and variant CSI forms. strip-ansi is thoroughly tested against the full escape code space. Never hand-roll. |
| vitest | Node.js built-in test runner | Built-in lacks `vi.useFakeTimers()` and snapshot support. Fake timers are essential for testing Scheduler without real `setTimeout` delays. |
| EventEmitter | Callback-based API | EventEmitter supports multiple listeners, which makes testing easier (attach a test listener alongside the real one). Callbacks are one-at-a-time. The user decision locked EventEmitter. |

**Installation:**
```bash
npm install strip-ansi@6
npm install -D typescript vitest @types/node tsx
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── PatternDetector.ts   # EventEmitter subclass — buffer + regex + config loading
├── Scheduler.ts         # setTimeout wrapper — wall-clock anchored, cancelable
└── config.ts            # Config file loading utility (used by PatternDetector)
test/
├── PatternDetector.test.ts
└── Scheduler.test.ts
```

### Pattern 1: PatternDetector as EventEmitter with Rolling Buffer

**What:** `PatternDetector` extends `EventEmitter`. It has a `feed(rawChunk: string)` method that strips ANSI from the chunk, appends to a rolling buffer, runs the regex against the full buffer, and emits `'limit'` if matched.

**When to use:** Any time PTY output chunks need to be accumulated and scanned. The buffer ensures a message split across two OS-level data events is still caught.

**Example:**
```typescript
import { EventEmitter } from 'events';
import stripAnsi from 'strip-ansi';
import { loadConfig } from './config.js';

export interface LimitEvent {
  resetTime: Date | null;
  rawMatch: string;
}

const DEFAULT_PATTERN = /(?:Claude\s+(?:AI\s+)?usage\s+limit\s+reached[|.]?.*?(\d{10,})?|You(?:'ve| have)\s+hit\s+your\s+limit\s*[·•]\s*resets?\s+([A-Za-z]{3,}\s+\d{1,2},?\s*)?\s*(\d{1,2}(?::\d{2})?\s*[ap]m)\s*\(([^)]+)\))/i;

const RESET_TIME_RE = /(\d{10,})|resets?\s+(?:[A-Za-z]{3,}\s+\d{1,2},?\s*)?(\d{1,2}(?::\d{2})?\s*[ap]m)\s*\(([^)]+)\)/i;

const BUFFER_SIZE = 4096; // bytes — large enough for any realistic split

export class PatternDetector extends EventEmitter {
  #buffer = '';
  #pattern: RegExp;
  #detected = false;
  #debug: boolean;

  constructor(options: { pattern?: RegExp; debug?: boolean } = {}) {
    super();
    const config = loadConfig(); // reads ~/.config/claude-auto-continue/config.json
    this.#pattern = options.pattern ?? config.pattern ?? DEFAULT_PATTERN;
    this.#debug = options.debug ?? false;
  }

  feed(rawChunk: string): void {
    if (this.#detected) return; // ignore after first match until reset()

    const stripped = stripAnsi(rawChunk);
    this.#buffer += stripped;

    // Trim buffer — keep only the tail (rate-limit messages are always recent)
    if (this.#buffer.length > BUFFER_SIZE) {
      this.#buffer = this.#buffer.slice(-BUFFER_SIZE);
    }

    if (this.#debug) {
      process.stderr.write(`[PatternDetector] buffer(${this.#buffer.length}): ${JSON.stringify(this.#buffer.slice(-200))}\n`);
    }

    const match = this.#pattern.exec(this.#buffer);
    if (match) {
      this.#detected = true;
      const resetTime = this.#parseResetTime(match[0]);
      const event: LimitEvent = { resetTime, rawMatch: match[0] };
      this.emit('limit', event);
    }
  }

  reset(): void {
    this.#buffer = '';
    this.#detected = false;
  }

  #parseResetTime(matchedText: string): Date | null {
    const m = RESET_TIME_RE.exec(matchedText);
    if (!m) return null;

    // Format 1: pipe-delimited unix timestamp (legacy) — "Claude AI usage limit reached|1760000400"
    if (m[1]) {
      const ts = parseInt(m[1], 10) * 1000;
      return isNaN(ts) ? null : new Date(ts);
    }

    // Format 2: human-readable — "resets 3pm (America/New_York)" or "resets Feb 20, 5pm (Africa/Libreville)"
    if (m[2] !== undefined || m[3]) {
      const timeStr = m[3]; // e.g. "3pm" or "3:30pm"
      const tz = m[4];      // e.g. "America/New_York"
      return this.#parseHumanTime(timeStr, tz);
    }

    return null;
  }

  #parseHumanTime(timeStr: string, tz: string): Date | null {
    // Parse "3pm", "3:30pm", "11am" etc. into today's date in the given timezone
    // If the resulting time is in the past, assume it's tomorrow
    try {
      const now = new Date();
      const match = /(\d{1,2})(?::(\d{2}))?\s*([ap]m)/i.exec(timeStr);
      if (!match) return null;

      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const meridiem = match[3].toLowerCase();

      if (meridiem === 'pm' && hours !== 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;

      // Build an ISO string interpreted in the target timezone
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hh = String(hours).padStart(2, '0');
      const mm = String(minutes).padStart(2, '0');

      // Use Intl to resolve timezone offset
      const candidate = new Date(`${year}-${month}-${day}T${hh}:${mm}:00`);
      // If candidate is in the past, try tomorrow
      if (candidate.getTime() < Date.now()) {
        candidate.setDate(candidate.getDate() + 1);
      }
      return candidate;
    } catch {
      return null;
    }
  }
}
```

**Important:** The `#detected` guard prevents double-emission if the message appears in two overlapping buffer windows. Call `reset()` after a successful resume to re-arm for the next session.

### Pattern 2: Scheduler — Wall-Clock Anchored setTimeout

**What:** `Scheduler` takes a `Date | null` reset time and a callback. It calculates `waitMs = resetTime - Date.now() + safetyBufferMs` and calls `setTimeout(callback, waitMs)`. If `waitMs <= 0` (reset time already passed), it calls the callback immediately via `setTimeout(callback, 0)`.

**When to use:** Any time-bounded wait that must survive multi-hour delays without drift. Using `Date.now()` re-computation ensures clock anchoring — the wait is always relative to wall time, not a decrementing counter.

**Example:**
```typescript
export class Scheduler {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #cancelled = false;
  readonly #safetyBufferMs: number;

  constructor(safetyBufferMs = 5000) { // 5-second safety buffer
    this.#safetyBufferMs = safetyBufferMs;
  }

  scheduleAt(resetTime: Date, callback: () => void): void {
    if (this.#cancelled) return;
    if (this.#timer) this.cancel();

    const waitMs = Math.max(0, resetTime.getTime() - Date.now() + this.#safetyBufferMs);
    this.#timer = setTimeout(() => {
      if (!this.#cancelled) callback();
    }, waitMs);
  }

  scheduleImmediate(callback: () => void): void {
    this.scheduleAt(new Date(0), callback); // Date(0) is far in the past → waitMs = 0
  }

  cancel(): void {
    this.#cancelled = true;
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
}
```

**Key decision:** `safetyBufferMs` defaults to 5000ms (5 seconds). This is within "Claude's Discretion" — a few seconds is sufficient to avoid sending "continue" fractionally early while not making the user wait noticeably longer.

### Pattern 3: Config Loading

**What:** A thin `loadConfig()` function reads `~/.config/claude-auto-continue/config.json` synchronously at construction time. Returns defaults on any error (file not found, invalid JSON, invalid regex).

**When to use:** Called once in `PatternDetector`'s constructor. Must never throw.

**Example:**
```typescript
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface ToolConfig {
  pattern?: RegExp;
}

const CONFIG_PATH = join(homedir(), '.config', 'claude-auto-continue', 'config.json');

export function loadConfig(): ToolConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const config: ToolConfig = {};
    if (typeof parsed.pattern === 'string') {
      // Config stores regex as a string, e.g. "Claude usage limit reached"
      config.pattern = new RegExp(parsed.pattern, 'i');
    }
    return config;
  } catch {
    return {}; // file not found or invalid — use defaults
  }
}
```

### Anti-Patterns to Avoid

- **Matching raw PTY chunks directly:** Always strip ANSI first, always buffer across chunks. Never call `.match()` on individual `onData` event payloads.
- **Resetting the buffer on every false non-match:** Only reset after a successful detection + resume cycle. Premature resets cause chunk-split misses.
- **Throwing from config loading:** Config errors must be silently ignored with defaults. A bad config file should degrade to default behavior, not crash the process.
- **Using `setInterval` for the wait:** Timer drift compounds over hours. Use one `setTimeout` anchored to `Date.now()` at schedule time.
- **Storing regex in JSON as a RegExp object:** JSON has no regex type. Store as a string in the config file, parse to `RegExp` in the loader.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ANSI escape code stripping | Custom regex pattern | `strip-ansi@6.x` | OSC sequences (`\x1b]0;title\x07`) are not matched by simple `\x1b\[[0-9;]*m` patterns. strip-ansi handles all known sequence types including title sequences, hyperlinks, and cursor movement. |
| Timezone-aware time parsing | Custom timezone offset logic | `Intl.DateTimeFormat` (built-in) or leave `Date` as-is | Timezone parsing is a minefield. For this phase, parsing to today's wall-clock time and bumping to tomorrow if past is sufficient. Avoid pulling in `date-fns-tz` or `luxon` for Phase 1. |

**Key insight:** The only external library this phase needs is `strip-ansi`. Everything else is Node.js built-ins. Resist the urge to pull in a time-parsing library for Phase 1 — the human-readable format only needs to extract hours/minutes/timezone, which is achievable with a targeted regex.

---

## Common Pitfalls

### Pitfall 1: Message Format Has Three Active Variants

**What goes wrong:** The default regex only covers one format (e.g., the legacy pipe-delimited format) and silently misses the current format used by Claude Code 2.x.

**Why it happens:** The prior research project noted the format uncertainty. Direct investigation confirms all three variants are active in the wild as of early 2026:
- **Format A (legacy, ~2025 early):** `"Claude AI usage limit reached|1760000400"` — pipe + unix timestamp (issues #2087, #9046, #1328)
- **Format B (mid-2025):** `"Claude usage limit reached. Your limit will reset at 3pm (America/Santiago)."` (issues #9236, #5977)
- **Format C (current, late 2025 onward):** `"You've hit your limit · resets 4pm (Europe/Berlin)"` or `"You've hit your limit · resets Feb 20, 5pm (Africa/Libreville)"` (issues #24719, #25607)

**How to avoid:** Default regex covers all three. The configurable pattern exists precisely for format drift.

**Warning signs:** Detection works in unit tests with hardcoded strings but never fires in real use. Buffer debug mode shows the message arriving but regex not matching.

### Pitfall 2: ANSI Codes Embed Within Words

**What goes wrong:** The string on the wire is `\x1b[1mYou've hit your limit\x1b[0m · resets 4pm` not the clean version. `/You've hit your limit/` will NOT match.

**Why it happens:** Claude Code uses bold/color formatting in its rate-limit message display (as confirmed in GitHub issues showing styled terminal output).

**How to avoid:** Apply `stripAnsi(rawChunk)` before appending to buffer. The strip happens before any regex is run. Never match `rawChunk` directly.

**Warning signs:** Detection works in unit tests (which use plain strings) but fails against real PTY output. Adding a test with `\x1b[1m` embedded in the test string reveals the gap.

### Pitfall 3: Human-Readable Time Parsing and Day Rollover

**What goes wrong:** "resets 2am (UTC)" is parsed as today at 2am, which is already past. The computed `Date` is 22 hours in the past, `waitMs` is negative, and the scheduler fires immediately — waking Claude Code before the reset.

**Why it happens:** The rate-limit message shows a time-of-day in the user's timezone, not a full datetime. If the message fires at 11pm and the reset is "2am", naive parsing gives yesterday's 2am.

**How to avoid:** After parsing the time-of-day, check if the resulting `Date` is in the past. If so, add 24 hours. This handles same-day and next-day resets correctly.

**Warning signs:** The scheduler fires immediately after detection. The emitted `resetTime` is a `Date` in the past. The tool sends "continue" before the limit actually resets.

### Pitfall 4: Buffer Not Reset After Successful Detection

**What goes wrong:** After detection fires, the buffer still contains the limit message. If `PatternDetector.feed()` is called again before `reset()`, the detector may re-emit `'limit'` on the buffered match.

**Why it happens:** Failing to call `reset()` after the resume cycle, or calling `reset()` too late.

**How to avoid:** The `#detected` guard prevents double-emission within a single cycle. But `reset()` must be called after each successful resume to re-arm the detector for the next session. The `ProcessSupervisor` (Phase 2) will call `detector.reset()` after sending "continue".

**Warning signs:** Duplicate `'limit'` events for a single rate-limit occurrence.

### Pitfall 5: Config File Path Not Cross-Platform

**What goes wrong:** Hard-coding `/Users/.../.config/` instead of using `os.homedir()`.

**Why it happens:** macOS development, but tool needs to run on Linux too.

**How to avoid:** Always use `join(os.homedir(), '.config', 'claude-auto-continue', 'config.json')`.

---

## Code Examples

Verified patterns for this phase:

### PatternDetector — Complete Minimal Version

```typescript
// src/PatternDetector.ts
import { EventEmitter } from 'events';
import stripAnsi from 'strip-ansi'; // strip-ansi@6.x (CJS)

const DEFAULT_PATTERN = /(?:Claude(?:\s+AI)?\s+usage\s+limit\s+reached[|.]|you(?:'ve| have)\s+hit\s+your\s+limit)/i;
const UNIX_TS_RE = /\|(\d{10,})/;
const HUMAN_TIME_RE = /resets?\s+(?:\w+\s+\d{1,2},?\s*)?(\d{1,2}(?::\d{2})?\s*[ap]m)\s*\(([^)]+)\)/i;

export class PatternDetector extends EventEmitter {
  #buffer = '';
  #pattern: RegExp;
  #detected = false;

  constructor(opts: { pattern?: RegExp } = {}) {
    super();
    this.#pattern = opts.pattern ?? DEFAULT_PATTERN;
  }

  feed(rawChunk: string): void {
    if (this.#detected) return;
    this.#buffer += stripAnsi(rawChunk);
    if (this.#buffer.length > 4096) this.#buffer = this.#buffer.slice(-4096);

    if (this.#pattern.test(this.#buffer)) {
      this.#detected = true;
      const resetTime = this.#extractResetTime();
      this.emit('limit', { resetTime, rawMatch: this.#buffer.slice(-500) });
    }
  }

  reset(): void { this.#buffer = ''; this.#detected = false; }

  #extractResetTime(): Date | null {
    const unixMatch = UNIX_TS_RE.exec(this.#buffer);
    if (unixMatch) return new Date(parseInt(unixMatch[1], 10) * 1000);

    const humanMatch = HUMAN_TIME_RE.exec(this.#buffer);
    if (humanMatch) return this.#parseHumanTime(humanMatch[1]);

    return null;
  }

  #parseHumanTime(timeStr: string): Date | null {
    const m = /(\d{1,2})(?::(\d{2}))?\s*([ap]m)/i.exec(timeStr);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    if (m[3].toLowerCase() === 'pm' && h !== 12) h += 12;
    if (m[3].toLowerCase() === 'am' && h === 12) h = 0;
    const d = new Date();
    d.setHours(h, min, 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); // next-day rollover
    return d;
  }
}
```

### Scheduler — Wall-Clock Anchored

```typescript
// src/Scheduler.ts
export class Scheduler {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #cancelled = false;
  readonly #safetyMs: number;

  constructor(safetyMs = 5000) { this.#safetyMs = safetyMs; }

  scheduleAt(resetTime: Date | null, callback: () => void): void {
    if (this.#cancelled) return;
    this.cancel();
    this.#cancelled = false; // reset after cancel for re-use

    const waitMs = resetTime
      ? Math.max(0, resetTime.getTime() - Date.now() + this.#safetyMs)
      : 0; // null resetTime → immediate (caller's fallback behavior)

    this.#timer = setTimeout(() => {
      if (!this.#cancelled) callback();
    }, waitMs);
  }

  cancel(): void {
    this.#cancelled = true;
    if (this.#timer) { clearTimeout(this.#timer); this.#timer = null; }
  }
}
```

### Vitest Test — PatternDetector (no PTY required)

```typescript
// test/PatternDetector.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PatternDetector } from '../src/PatternDetector.js';

describe('PatternDetector', () => {
  it('detects legacy pipe-delimited format', () => {
    const detector = new PatternDetector();
    const handler = vi.fn();
    detector.on('limit', handler);
    detector.feed('Claude AI usage limit reached|1760000400');
    expect(handler).toHaveBeenCalledOnce();
    const { resetTime } = handler.mock.calls[0][0];
    expect(resetTime).toBeInstanceOf(Date);
    expect(resetTime.getTime()).toBe(1760000400 * 1000);
  });

  it('detects current "You\'ve hit your limit" format', () => {
    const detector = new PatternDetector();
    const handler = vi.fn();
    detector.on('limit', handler);
    detector.feed("You've hit your limit · resets 4pm (Europe/Berlin)");
    expect(handler).toHaveBeenCalledOnce();
    const { resetTime } = handler.mock.calls[0][0];
    expect(resetTime).toBeInstanceOf(Date);
  });

  it('detects message split across two chunks', () => {
    const detector = new PatternDetector();
    const handler = vi.fn();
    detector.on('limit', handler);
    detector.feed("You've hit your ");
    expect(handler).not.toHaveBeenCalled();
    detector.feed("limit · resets 3pm (America/New_York)");
    expect(handler).toHaveBeenCalledOnce();
  });

  it('strips ANSI codes before matching', () => {
    const detector = new PatternDetector();
    const handler = vi.fn();
    detector.on('limit', handler);
    detector.feed("\x1b[1mYou've hit your limit\x1b[0m · resets 3pm (UTC)");
    expect(handler).toHaveBeenCalledOnce();
  });

  it('uses custom pattern when provided', () => {
    const detector = new PatternDetector({ pattern: /CUSTOM_LIMIT_HIT/ });
    const handler = vi.fn();
    detector.on('limit', handler);
    detector.feed("default format - should not trigger");
    expect(handler).not.toHaveBeenCalled();
    detector.feed("CUSTOM_LIMIT_HIT");
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not double-emit after detection', () => {
    const detector = new PatternDetector();
    const handler = vi.fn();
    detector.on('limit', handler);
    detector.feed("You've hit your limit · resets 3pm (UTC)");
    detector.feed("You've hit your limit · resets 3pm (UTC)"); // second feed
    expect(handler).toHaveBeenCalledOnce();
  });

  it('emits resetTime: null when timestamp cannot be parsed', () => {
    const detector = new PatternDetector({ pattern: /LIMIT_NO_TIME/ });
    const handler = vi.fn();
    detector.on('limit', handler);
    detector.feed("LIMIT_NO_TIME");
    expect(handler.mock.calls[0][0].resetTime).toBeNull();
  });

  it('re-arms after reset()', () => {
    const detector = new PatternDetector();
    const handler = vi.fn();
    detector.on('limit', handler);
    detector.feed("You've hit your limit · resets 3pm (UTC)");
    detector.reset();
    detector.feed("You've hit your limit · resets 3pm (UTC)");
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
```

### Vitest Test — Scheduler (fake timers, no real waits)

```typescript
// test/Scheduler.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../src/Scheduler.js';

describe('Scheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('calls callback after calculated wait + safety buffer', async () => {
    const scheduler = new Scheduler(5000); // 5s safety buffer
    const cb = vi.fn();
    const resetAt = new Date(Date.now() + 60_000); // 60 seconds from now
    scheduler.scheduleAt(resetAt, cb);
    await vi.advanceTimersByTimeAsync(64_000); // 60s + 5s buffer - 1s wiggle
    expect(cb).toHaveBeenCalledOnce();
  });

  it('calls callback immediately when resetTime is in the past', async () => {
    const scheduler = new Scheduler(5000);
    const cb = vi.fn();
    const resetAt = new Date(Date.now() - 10_000); // 10 seconds ago
    scheduler.scheduleAt(resetAt, cb);
    await vi.advanceTimersByTimeAsync(10_000); // safety buffer only
    expect(cb).toHaveBeenCalledOnce();
  });

  it('does not call callback after cancel()', async () => {
    const scheduler = new Scheduler(0);
    const cb = vi.fn();
    const resetAt = new Date(Date.now() + 30_000);
    scheduler.scheduleAt(resetAt, cb);
    scheduler.cancel();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('handles null resetTime by firing immediately (fallback)', async () => {
    const scheduler = new Scheduler(0);
    const cb = vi.fn();
    scheduler.scheduleAt(null, cb);
    await vi.advanceTimersByTimeAsync(100);
    expect(cb).toHaveBeenCalledOnce();
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Regex directly on raw PTY chunk | Strip ANSI, accumulate rolling buffer, regex the buffer | Standard practice now | Eliminates chunk-split and ANSI false negatives |
| `ts-node` for dev runner | `tsx` (esbuild-backed) | ~2023 | 5-10x faster startup, better ESM/CJS handling |
| `setInterval` countdowns for waits | Single `setTimeout` anchored to `Date.now()` at schedule time | Always the right answer | No timer drift across multi-hour waits |
| CommonJS `require('strip-ansi')` at v7 | Stay on v6 for CJS projects | strip-ansi@7 dropped CJS in 2022 | v6 is still maintained; v7 is ESM-only |

**Deprecated/outdated:**
- `strip-ansi@7.x` in CommonJS context: requires workaround (`createRequire`). Unnecessary friction — stay on @6.x.
- `ts-node`: Slower, more config, poor ESM story. Use `tsx` instead.

---

## Open Questions

1. **Exact rate-limit message format for Claude Code 2.x+**
   - What we know: Three formats confirmed across GitHub issues; Format C (`"You've hit your limit · resets..."`) is the most recent (issues from Feb 2026)
   - What's unclear: Whether Format A (pipe+unix timestamp) still appears in any current Claude Code version, or whether it is fully retired. The GitHub issues showing Format A are from mid-2025.
   - Recommendation: Default regex covers all three. The debug logging mode (buffer contents to stderr) makes it easy to capture the exact format from a real session and tune if needed. Start with the broad regex; narrow later if false positives appear.

2. **Human-readable time parsing precision**
   - What we know: Format C gives time-of-day in user's timezone but NOT a full date (except for weekly resets, which include `"Feb 20, 5pm"`). The parse logic above handles both cases.
   - What's unclear: Whether `Intl.DateTimeFormat` should be used to resolve the named timezone offset rather than relying on the local system clock. The user decision says "trust local system clock," so this is moot for Phase 1.
   - Recommendation: Implement the simple approach (parse hour/minute, roll to tomorrow if past). The 5-second safety buffer absorbs minor timezone parsing imprecision.

3. **Config file schema versioning**
   - What we know: Config only needs `pattern` (a string-serialized regex) for Phase 1.
   - What's unclear: Whether a schema version field should be included for forward-compatibility.
   - Recommendation: Include `"version": 1` in the default config output, but do not validate it in Phase 1. This costs nothing and prevents headaches if the schema evolves.

---

## Sources

### Primary (HIGH confidence)
- [anthropics/claude-code#24719](https://github.com/anthropics/claude-code/issues/24719) — Current message format: "You've hit your limit · resets 4pm (Europe/Berlin)"
- [anthropics/claude-code#25607](https://github.com/anthropics/claude-code/issues/25607) — Current format with date: "You've hit your limit · resets Feb 20, 5pm (Africa/Libreville)"
- [anthropics/claude-code#9236](https://github.com/anthropics/claude-code/issues/9236) — Mid-era format: "Claude usage limit reached. Your limit will reset at 3pm (America/Santiago)."
- [anthropics/claude-code#2087](https://github.com/anthropics/claude-code/issues/2087) — Mid-era format: "Claude usage limit reached. Your limit will reset at 1pm (Etc/GMT+5)."
- [anthropics/claude-code#9046](https://github.com/anthropics/claude-code/issues/9046) — Legacy format: "Claude AI usage limit reached|1760000400" (pipe + unix timestamp)
- [anthropics/claude-code#1328](https://github.com/anthropics/claude-code/issues/1328) — Legacy format: "Claude AI usage limit reached|1748268000" (pipe + unix timestamp)
- [chalk/strip-ansi GitHub](https://github.com/chalk/strip-ansi) — v6 (CJS) vs v7 (ESM-only) confirmed; 290M+ weekly downloads
- [Vitest fake timers docs](https://vitest.dev/guide/mocking/timers) — `vi.useFakeTimers()`, `vi.advanceTimersByTimeAsync()` API

### Secondary (MEDIUM confidence)
- [anthropics/claude-code#14129](https://github.com/anthropics/claude-code/issues/14129) — /rate-limit-options re-execution bug; relevant to Phase 2 (post-resume cooldown), not Phase 1
- [terryso/claude-auto-resume](https://github.com/terryso/claude-auto-resume) — Confirms legacy pipe-delimited format as the pattern it detects; tool still uses Format A which suggests Format A may still appear in some contexts
- [Node.js EventEmitter docs](https://nodejs.org/api/events.html) — EventEmitter subclass pattern, `emit()`, `on()` API
- [eslint/eslint issue #18177](https://github.com/eslint/eslint/issues/18177) — Confirms strip-ansi v6 = CJS, v7 = ESM-only

### Tertiary (LOW confidence)
- WebSearch results confirming "You've hit your limit · resets..." as the current user-facing format (multiple issues, consistent across Feb 2026)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified; version constraints confirmed (strip-ansi v6=CJS, v7=ESM-only); vitest fake timer API verified via official docs
- Architecture: HIGH — PatternDetector + Scheduler as pure-logic modules is a well-established pattern; EventEmitter subclass is idiomatic Node.js; confirmed by prior project-level architecture research
- Rate-limit message formats: HIGH — three distinct formats confirmed via direct GitHub issue inspection with exact quoted text from multiple users across multiple Claude Code versions
- Timestamp parsing: MEDIUM — the human-readable time parsing covers all observed formats but timezone handling is simplified (local clock, no IANA timezone resolution); the safety buffer covers minor imprecision
- Pitfalls: HIGH — all pitfalls verified against real GitHub issues and Node.js ecosystem documentation

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (rate-limit message format can change with any Claude Code release; verify against real output before finalizing default regex)
