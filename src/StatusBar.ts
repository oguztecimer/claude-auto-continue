import {
  saveCursor,
  restoreCursor,
  moveTo,
  clearLine,
  setScrollRegion,
  resetScrollRegion,
  showCursor,
  resetAttributes,
  green,
  yellow,
  red,
  inverse,
} from './ansi.js';

export interface StatusBarOptions {
  cols?: number;
}

/**
 * Format a countdown from now until resetTime as a human-readable string.
 * Returns "Xh Xm Xs" for durations over an hour, "Xm Xs" otherwise.
 * Returns "0m 00s" for past or null dates.
 */
export function formatCountdown(resetTime: Date): string {
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

/**
 * Format a Date as a human-readable absolute time (e.g., "2:45 PM").
 */
export function formatResetTime(resetTime: Date): string {
  return resetTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * StatusBar — renders a fixed top-row status bar with color-coded session state.
 *
 * Pure renderer: produces strings, does NOT write to stdout directly.
 * The caller is responsible for writing the returned strings to the terminal.
 */
export class StatusBar {
  cols: number;

  constructor(options: StatusBarOptions = {}) {
    this.cols = options.cols ?? 80;
  }

  /**
   * Render the status bar string for the given state.
   * Returns a complete ANSI sequence: save cursor, move to row 1, render bar, restore cursor.
   */
  render(state: string, opts: { resetTime?: Date; cwd?: string } = {}): string {
    const { resetTime, cwd = '' } = opts;

    let stateText: string;
    let colorFn: (text: string) => string;

    switch (state) {
      case 'RUNNING':
        stateText = 'Running';
        colorFn = green;
        break;
      case 'WAITING':
        stateText = 'Waiting';
        colorFn = yellow;
        break;
      case 'RESUMING':
        stateText = 'Resuming';
        colorFn = green;
        break;
      case 'DEAD':
        stateText = 'Dead';
        colorFn = red;
        break;
      default:
        stateText = state;
        colorFn = green;
    }

    // Build bar content
    const parts: string[] = [colorFn(stateText)];

    if (state === 'WAITING' && resetTime) {
      const countdown = formatCountdown(resetTime);
      const resetAt = formatResetTime(resetTime);
      parts.push(`${countdown} (resets ${resetAt})`);
    }

    if (cwd) {
      parts.push(cwd);
    }

    const content = ` ${parts.join(' | ')} `;
    const barContent = inverse(content);

    return `${saveCursor}${moveTo(1, 1)}${clearLine}${barContent}${restoreCursor}`;
  }

  /**
   * Produce the ANSI sequence to initialize the scroll region.
   * Confines scrolling to rows 2..termRows, leaving row 1 for the status bar.
   */
  initScrollRegion(rows: number): string {
    return `${setScrollRegion(2, rows)}${moveTo(2, 1)}`;
  }

  /**
   * Produce the ANSI cleanup sequence.
   * Resets scroll region, shows cursor, and resets all attributes.
   */
  cleanup(): string {
    return `${resetScrollRegion}${showCursor}${resetAttributes}`;
  }
}
