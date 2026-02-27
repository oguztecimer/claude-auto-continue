import { moveTo, clearLine, bold, yellow } from './ansi.js';
import { formatCountdown, formatResetTime } from './StatusBar.js';

export interface CountdownCardOptions {
  cols?: number;
  rows?: number;
}

/** Number of lines the card occupies (border + content + border) */
const CARD_HEIGHT = 9;

/**
 * CountdownCard — renders a centered countdown box during WAITING state.
 *
 * Pure renderer: produces strings, does NOT write to stdout directly.
 * The caller is responsible for writing the returned strings to the terminal.
 */
export class CountdownCard {
  cols: number;
  rows: number;

  constructor(options: CountdownCardOptions = {}) {
    this.cols = options.cols ?? 80;
    this.rows = options.rows ?? 24;
  }

  /**
   * Render the countdown card as a complete ANSI string.
   * Shows a centered box with session name, countdown, and absolute reset time.
   */
  render(opts: { resetTime: Date | null; cwd: string }): string {
    const { resetTime, cwd } = opts;

    const countdown = resetTime ? formatCountdown(resetTime) : 'Unknown';
    const resetAt = resetTime ? formatResetTime(resetTime) : 'Unknown';

    // Build card content lines (without borders)
    const header = 'Waiting for rate limit reset';
    const countdownLine = `${countdown} remaining`;
    const resetLine = `Resets at ${resetAt}`;
    const sessionLine = `Session: ${cwd}`;

    // Calculate box width — fit the longest content line + padding
    const contentLines = [header, countdownLine, resetLine, sessionLine];
    const maxContentWidth = Math.max(...contentLines.map((l) => l.length));
    const boxInnerWidth = Math.min(Math.max(maxContentWidth + 4, 40), this.cols - 4);
    const boxOuterWidth = boxInnerWidth + 2; // +2 for left/right border chars

    // Calculate centering positions
    const startCol = Math.max(1, Math.floor((this.cols - boxOuterWidth) / 2) + 1);
    // Vertical center: account for row 1 (status bar), so usable area is rows 2..this.rows
    const usableRows = this.rows - 1;
    const startRow = Math.max(2, Math.floor((usableRows - CARD_HEIGHT) / 2) + 2);

    // Build the box
    const topBorder = '+' + '-'.repeat(boxInnerWidth) + '+';
    const bottomBorder = topBorder;
    const emptyLine = '|' + ' '.repeat(boxInnerWidth) + '|';

    const centerInBox = (text: string, visibleLength?: number): string => {
      const len = visibleLength ?? text.length;
      const padding = Math.max(0, boxInnerWidth - len);
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return '|' + ' '.repeat(leftPad) + text + ' '.repeat(rightPad) + '|';
    };

    const lines: string[] = [
      topBorder,
      emptyLine,
      centerInBox(bold(header), header.length),
      emptyLine,
      centerInBox(yellow(countdownLine), countdownLine.length),
      centerInBox(resetLine),
      emptyLine,
      centerInBox(sessionLine),
      bottomBorder,
    ];

    // Render each line at the calculated position
    let output = '';
    for (let i = 0; i < lines.length; i++) {
      output += moveTo(startRow + i, startCol) + lines[i];
    }

    return output;
  }

  /**
   * Clear the card area by writing clearLine to each row the card occupied.
   */
  clear(): string {
    const boxInnerWidth = Math.min(44, this.cols - 4);
    const boxOuterWidth = boxInnerWidth + 2;
    const startCol = Math.max(1, Math.floor((this.cols - boxOuterWidth) / 2) + 1);
    const usableRows = this.rows - 1;
    const startRow = Math.max(2, Math.floor((usableRows - CARD_HEIGHT) / 2) + 2);

    let output = '';
    for (let i = 0; i < CARD_HEIGHT; i++) {
      output += moveTo(startRow + i, startCol) + clearLine;
    }
    return output;
  }
}
