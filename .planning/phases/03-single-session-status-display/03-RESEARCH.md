# Phase 3: Single-Session Status Display - Research

**Researched:** 2026-02-27
**Domain:** Terminal UI — status bar, countdown timer, ANSI escape codes
**Confidence:** HIGH

## Summary

Phase 3 adds a persistent status bar at the top of the terminal and a centered countdown card when waiting for rate-limit reset. The existing ProcessSupervisor already maintains a four-state machine (RUNNING, LIMIT_DETECTED, WAITING, RESUMING) and exposes `state` as a public getter — the status display layer needs to observe state transitions and render accordingly.

The key technical challenge is rendering a fixed status bar at terminal row 1 while allowing PTY output to flow in a scrollable region below it. This is achievable with raw ANSI escape codes (CSI sequences for cursor positioning, scroll region, and colors) without any TUI framework dependency. The project is CommonJS, has zero runtime dependencies beyond node-pty and strip-ansi, and the user's CONTEXT.md leaves TUI library choice at Claude's discretion — raw ANSI is the right call given the project's minimalist philosophy.

**Primary recommendation:** Use raw ANSI escape sequences to create a fixed top-row status bar with a scroll region for PTY output. Add an EventEmitter-based state notification system to ProcessSupervisor so the display layer can react to state changes and countdown ticks.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Status bar at the **top** of the terminal, always visible
- Session output flows below the status bar — full PTY experience preserved
- Status bar shows: session state (Running/Waiting/Resuming), countdown timer when waiting, working directory
- **Color-coded** states: green for running, yellow for waiting, red for dead
- Countdown timer updates **every second** while waiting — feels responsive and confirms the tool is working
- When the session is waiting, show a **centered countdown card** with: session name/working directory, live countdown to reset time, absolute reset time (e.g., "at 2:45 PM")
- When the session dies, show "Dead" in red briefly (~5 seconds), then the tool exits automatically
- Default (no args) = **single session** in current directory — backward compatible with Phase 2
- Claude Code arguments passed through after `--` separator (e.g., `claude-auto-continue -- --continue`)
- Auto-exit when the session exits, with a brief summary

### Claude's Discretion
- Status bar exact styling and border characters
- Countdown card layout details
- How to handle terminal resize with the status bar
- Whether to use a TUI library (blessed, ink) or raw ANSI escape codes

### Deferred Ideas (OUT OF SCOPE)
- Multi-session orchestration within one process (MULT-01 through MULT-04) — moved to Out of Scope. User prefers separate terminal windows.
- Dynamic session adding/removing — not needed with single-session model
- Session scrollback management — not needed with single-session (PTY scrollback handled by terminal emulator)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RESM-03 | Tool displays a visible countdown timer while waiting for reset | StatusBar renders countdown in WAITING state; 1-second setInterval tick; centered countdown card when all output is waiting |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Raw ANSI escape codes | N/A | Terminal cursor positioning, colors, scroll regions | Zero dependencies, full control, project already uses minimal deps |
| node-pty | ^1.1.0 | Already in project — PTY spawning | Already installed, Phase 2 dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | - |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw ANSI | blessed / blessed-contrib | Full TUI framework — massive dependency, overkill for a single status bar |
| Raw ANSI | ink (React for CLI) | Requires React runtime, ESM-first, incompatible with CJS project philosophy |
| Raw ANSI | terminal-kit | Large dependency tree, more than needed |

**Installation:**
```bash
# No new dependencies needed — raw ANSI codes are built-in to any terminal
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── config.ts              # (existing) Configuration loader
├── PatternDetector.ts     # (existing) Rate-limit detection
├── Scheduler.ts           # (existing) Timer scheduling
├── StdinWriter.ts         # (existing) EPIPE-safe PTY writing
├── ProcessSupervisor.ts   # (modified) Add state change events, countdown data
├── StatusBar.ts           # (NEW) Fixed top-row status bar renderer
├── CountdownCard.ts       # (NEW) Centered countdown card for WAITING state
└── cli.ts                 # (NEW) Entry point with -- argument parsing
```

### Pattern 1: ANSI Scroll Region for Fixed Status Bar
**What:** Use ANSI escape `\x1b[{top};{bottom}r` (DECSTBM — Set Top and Bottom Margins) to confine PTY scrolling to rows 2..N, leaving row 1 as a fixed status bar.
**When to use:** Whenever you need a fixed header/footer in a terminal without a TUI framework.
**Example:**
```typescript
// Set scroll region to rows 2 through terminal height
const rows = process.stdout.rows ?? 24;
process.stdout.write(`\x1b[2;${rows}r`);  // Scroll region: row 2 to bottom
process.stdout.write(`\x1b[2;1H`);         // Move cursor to row 2, col 1
// Now all output scrolls within rows 2..N; row 1 stays fixed
```

### Pattern 2: Cursor Save/Restore for Status Bar Updates
**What:** Save cursor position, jump to row 1, render status bar, restore cursor. This avoids disrupting the PTY output stream.
**When to use:** Every time the status bar content changes (state transition, countdown tick).
**Example:**
```typescript
function renderStatusBar(content: string): void {
  const cols = process.stdout.columns ?? 80;
  process.stdout.write('\x1b7');           // Save cursor position
  process.stdout.write('\x1b[1;1H');       // Move to row 1, col 1
  process.stdout.write('\x1b[2K');         // Clear entire line
  process.stdout.write(content.padEnd(cols).slice(0, cols)); // Render padded
  process.stdout.write('\x1b8');           // Restore cursor position
}
```

### Pattern 3: State Change Observer via EventEmitter
**What:** ProcessSupervisor emits state-change events that StatusBar listens to. Decouples display from state machine logic.
**When to use:** When display needs to react to state transitions without tight coupling.
**Example:**
```typescript
// In ProcessSupervisor — emit on every state change
this.#state = SessionState.WAITING;
this.emit('stateChange', { state: this.#state, resetTime: event.resetTime });

// In StatusBar — listen and render
supervisor.on('stateChange', ({ state, resetTime }) => {
  if (state === 'WAITING') {
    this.startCountdown(resetTime);
  }
  this.render();
});
```

### Pattern 4: Centered Countdown Card
**What:** When in WAITING state, render a centered box in the scroll region showing countdown details.
**When to use:** When the session has no active output and is just waiting.
**Example:**
```typescript
function renderCountdownCard(cols: number, rows: number, countdown: string, resetAt: string, cwd: string): void {
  const boxWidth = Math.min(50, cols - 4);
  const startRow = Math.floor(rows / 2) - 3;
  const startCol = Math.floor((cols - boxWidth) / 2);
  // Draw centered box with countdown info using cursor positioning
  process.stdout.write(`\x1b[${startRow};${startCol}H`);
  // ... render box lines
}
```

### Anti-Patterns to Avoid
- **Writing directly to stdout from StatusBar without cursor save/restore:** Will corrupt PTY output positioning
- **Using setInterval for countdown without cleanup:** Timer leak if session dies during WAITING
- **Hardcoding terminal dimensions:** Must handle resize events (SIGWINCH) and re-render
- **Modifying ProcessSupervisor's state machine logic:** Status display is a read-only observer — never change state transitions

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ANSI color codes | String concatenation with escape codes | Small helper functions (3-5 lines each) | DRY, readable, but keep them simple — no library needed |
| Time formatting | Manual date arithmetic | Intl.DateTimeFormat or simple math | Division/modulo for countdown is straightforward |

**Key insight:** The ANSI escape code vocabulary needed here is small (cursor position, scroll region, colors, clear line). A helper module with 5-6 functions covers everything. No library needed.

## Common Pitfalls

### Pitfall 1: Scroll Region Reset on Exit
**What goes wrong:** If the tool exits without resetting the scroll region (`\x1b[r`), the user's terminal stays in the restricted scroll region — subsequent output only appears in part of the screen.
**Why it happens:** Unhandled exit, SIGINT, or crash.
**How to avoid:** Register cleanup handlers on `process.on('exit')`, `process.on('SIGINT')`, `process.on('SIGTERM')`. Reset scroll region and restore cursor in all handlers.
**Warning signs:** After the tool exits, `ls` or other commands only render in the bottom half of the terminal.

### Pitfall 2: PTY Resize Without Scroll Region Update
**What goes wrong:** User resizes terminal, but scroll region still uses old dimensions. Status bar overlaps with scroll area, or scroll area is too small.
**Why it happens:** DECSTBM is set once at startup but not updated on resize.
**How to avoid:** Listen for `resize` event on `process.stdout`, re-issue `\x1b[{2};{newRows}r`, re-render status bar and countdown card. ProcessSupervisor already forwards resize to the PTY — need to also notify the display.
**Warning signs:** After terminal resize, output appears in wrong positions or overflows the status bar.

### Pitfall 3: Countdown Timer Drift
**What goes wrong:** setInterval-based countdown shows wrong time remaining because intervals can drift.
**Why it happens:** setInterval has no guarantee of exact timing, especially under load.
**How to avoid:** Each tick, recalculate remaining time from `resetTime - Date.now()`. Never accumulate or decrement a counter.
**Warning signs:** Countdown shows 0:00 but reset hasn't fired yet, or jumps when the system is busy.

### Pitfall 4: Race Between Countdown Tick and State Change
**What goes wrong:** Countdown timer fires after state has already moved to RESUMING, causing a render of "0:00 remaining" or negative time.
**Why it happens:** setInterval callback queued before state change but executes after.
**How to avoid:** Check current state in the tick callback. If not WAITING, skip render and clear the interval.
**Warning signs:** Brief flash of "0:00" or "-0:01" in the countdown.

### Pitfall 5: ANSI Escape Codes in PTY Output Conflicting with Status Bar
**What goes wrong:** Claude Code's own output contains cursor positioning escape codes that move outside the scroll region and overwrite the status bar.
**Why it happens:** Claude Code doesn't know about our scroll region boundaries.
**How to avoid:** This is largely handled by the scroll region itself (DECSTBM) — terminals clip output to the scroll region when it's active. However, some applications use absolute cursor positioning (CSI H). The risk is low since Claude Code is a line-oriented TUI, but monitor for edge cases.
**Warning signs:** Status bar gets overwritten or garbled during Claude Code output.

## Code Examples

### ANSI Escape Code Reference (Used in This Phase)
```typescript
// Cursor positioning
const CSI = '\x1b[';
const moveTo = (row: number, col: number) => `${CSI}${row};${col}H`;
const saveCursor = '\x1b7';    // DECSC
const restoreCursor = '\x1b8'; // DECRC

// Scroll region
const setScrollRegion = (top: number, bottom: number) => `${CSI}${top};${bottom}r`;
const resetScrollRegion = `${CSI}r`; // Reset to full screen

// Line operations
const clearLine = `${CSI}2K`;   // Clear entire current line
const clearScreen = `${CSI}2J`; // Clear entire screen

// Colors (foreground)
const green = (text: string) => `${CSI}32m${text}${CSI}0m`;
const yellow = (text: string) => `${CSI}33m${text}${CSI}0m`;
const red = (text: string) => `${CSI}31m${text}${CSI}0m`;

// Bold
const bold = (text: string) => `${CSI}1m${text}${CSI}0m`;

// Inverse (for status bar background)
const inverse = (text: string) => `${CSI}7m${text}${CSI}0m`;
```

### Countdown Time Formatting
```typescript
function formatCountdown(resetTime: Date): string {
  const remaining = Math.max(0, resetTime.getTime() - Date.now());
  const totalSec = Math.ceil(remaining / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatResetTime(resetTime: Date): string {
  return resetTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  // e.g., "2:45 PM"
}
```

### Terminal Cleanup Handler
```typescript
function setupCleanup(): void {
  const cleanup = () => {
    process.stdout.write('\x1b[r');     // Reset scroll region
    process.stdout.write('\x1b[?25h');  // Show cursor (in case hidden)
    process.stdout.write('\x1b[0m');    // Reset all attributes
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });
}
```

### CLI Argument Parsing (-- separator)
```typescript
function parseArgs(argv: string[]): { claudeArgs: string[] } {
  const separatorIdx = argv.indexOf('--');
  if (separatorIdx === -1) {
    return { claudeArgs: [] };
  }
  return { claudeArgs: argv.slice(separatorIdx + 1) };
}
// Usage: claude-auto-continue -- --continue
// argv = ['node', 'cli.js', '--', '--continue']
// result = { claudeArgs: ['--continue'] }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| blessed/ncurses TUI | Raw ANSI for simple layouts | Ongoing | blessed is unmaintained since 2020; raw ANSI is the norm for single-bar status displays |
| process.stdout.write for all output | Scroll regions + cursor save/restore | Always available | Enables fixed headers/footers without a framework |

**Deprecated/outdated:**
- blessed: Last npm release was 2017 (0.1.81). Community fork `neo-blessed` exists but is also low-activity. Not recommended for new projects.

## Open Questions

1. **Claude Code's own terminal UI behavior**
   - What we know: Claude Code is a line-oriented TUI that uses ANSI formatting
   - What's unclear: Whether Claude Code ever uses absolute cursor positioning (CSI H) that could escape our scroll region
   - Recommendation: Use scroll region (DECSTBM) which provides hardware-level scroll confinement in most terminals. Monitor for edge cases during manual testing.

2. **Exact dead-session UX timing**
   - What we know: User wants "Dead" in red briefly (~5 seconds), then auto-exit
   - What's unclear: Whether 5 seconds is enough to read the message
   - Recommendation: Use 5 seconds as specified, can be easily adjusted later

## Sources

### Primary (HIGH confidence)
- Node.js process.stdout documentation — columns, rows, resize event, write()
- ECMA-48 / VT100 / xterm CSI sequences — DECSTBM, cursor save/restore, SGR colors
- Existing codebase: ProcessSupervisor.ts exposes `state` getter and already handles resize

### Secondary (MEDIUM confidence)
- Terminal emulator behavior with scroll regions tested across iTerm2, Terminal.app, Alacritty, kitty — consistent DECSTBM support

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Raw ANSI escape codes are well-documented and universally supported
- Architecture: HIGH - Observer pattern for state changes is clean and proven; scroll regions are well-understood
- Pitfalls: HIGH - Scroll region cleanup and resize handling are well-known challenges with known solutions

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable domain, no rapid changes expected)
