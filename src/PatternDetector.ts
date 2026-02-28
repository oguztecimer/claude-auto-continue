import { EventEmitter } from 'events';
import stripAnsi from 'strip-ansi';
import { loadConfig } from './config.js';

/**
 * Payload emitted with the 'limit' event.
 */
export interface LimitEvent {
  /** Parsed reset time as a Date, or null when unparseable */
  resetTime: Date | null;
  /** Last ~500 chars of the buffer at the time of detection */
  rawMatch: string;
}

/**
 * Default regex that matches all known Claude rate-limit message formats:
 *   Format A (legacy): "Claude AI usage limit reached|1760000400"
 *   Format B (mid-era): "Claude usage limit reached. Your limit will reset at 3pm (America/Santiago)."
 *   Format C: "You've hit your limit · resets 4pm (Europe/Berlin)"
 *   Format D (current): "You're out of extra usage · resets 4am (Europe/Istanbul)"
 *   Format E (menu): "Stop and wait for limit to reset" (the interactive menu itself)
 */
const DEFAULT_PATTERN =
  /(?:Claude(?:\s+AI)?\s+usage\s+limit\s+reached[|.]|you(?:'ve| have)\s+hit\s+your\s+limit|you(?:'re| are)\s+out\s+of\s+extra\s+usage|Stop\s+and\s+wait\s+for\s+limit\s+to\s+reset)/i;

/** Matches a 10+ digit unix timestamp after a pipe: |1760000400 */
const UNIX_TS_PATTERN = /\|(\d{10,})/;

/**
 * Matches human-readable reset time in multiple forms:
 *   "resets Feb 20, 5pm (Africa/Libreville)"
 *   "reset at 3pm (America/Santiago)"
 *   "resets 4pm (Europe/Berlin)"
 */
const HUMAN_TIME_PATTERN =
  /reset(?:s)?\s+(?:at\s+)?(?:\w+\s+\d{1,2},?\s*)?(\d{1,2}(?::\d{2})?\s*[ap]m)/i;

/** Maximum rolling buffer size in characters */
const MAX_BUFFER = 4096;

export interface PatternDetectorOptions {
  /** Override default detection pattern */
  pattern?: RegExp;
  /** If true, write buffer snapshots to stderr on each feed() call */
  debug?: boolean;
}

/**
 * EventEmitter subclass that detects Claude rate-limit messages in a stream of
 * PTY output chunks. Emits a 'limit' event with a LimitEvent payload.
 */
export class PatternDetector extends EventEmitter {
  readonly #pattern: RegExp;
  readonly #debug: boolean;
  #buffer: string = '';
  #detected: boolean = false;

  constructor(options: PatternDetectorOptions = {}) {
    super();

    // Priority: constructor option > config file > default
    const config = loadConfig();
    this.#pattern = options.pattern ?? config.pattern ?? DEFAULT_PATTERN;
    this.#debug = options.debug ?? false;
  }

  /**
   * Feed a raw PTY output chunk into the detector.
   * Strips ANSI codes, appends to rolling buffer, trims if >4KB, then checks pattern.
   */
  feed(rawChunk: string): void {
    // Already detected — ignore further input until reset()
    if (this.#detected) return;

    // Strip ANSI escape codes and append to rolling buffer
    const clean = stripAnsi(rawChunk);
    this.#buffer += clean;

    // Trim buffer to last MAX_BUFFER characters to avoid unbounded growth
    if (this.#buffer.length > MAX_BUFFER) {
      this.#buffer = this.#buffer.slice(this.#buffer.length - MAX_BUFFER);
    }

    if (this.#debug) {
      process.stderr.write(`[PatternDetector] buffer(${this.#buffer.length}): ${this.#buffer}\n`);
    }

    // Test the pattern against the current buffer
    if (this.#pattern.test(this.#buffer)) {
      this.#detected = true;
      const rawMatch = this.#buffer.slice(-500);
      const resetTime = this.#parseResetTime(this.#buffer);
      this.emit('limit', { resetTime, rawMatch } satisfies LimitEvent);
    }
  }

  /**
   * Clear the buffer and re-arm detection (allow the next match to fire again).
   */
  reset(): void {
    this.#buffer = '';
    this.#detected = false;
  }

  /**
   * Parse a reset timestamp from the buffer text.
   * Tries unix epoch first, then human-readable time expression.
   * Returns null if neither can be parsed.
   */
  #parseResetTime(text: string): Date | null {
    // Try unix timestamp (Format A): |1760000400
    const unixMatch = UNIX_TS_PATTERN.exec(text);
    if (unixMatch) {
      const seconds = parseInt(unixMatch[1], 10);
      return new Date(seconds * 1000);
    }

    // Try human-readable time (Formats B & C)
    return this.#parseHumanTime(text);
  }

  /**
   * Parse a human-readable time expression like "3pm", "4pm", "5:30am"
   * into an absolute Date. Rolls to tomorrow if the time is already past.
   * Returns null if the pattern doesn't match.
   *
   * Note: Does not perform IANA timezone lookup — uses local clock per user decision.
   */
  #parseHumanTime(text: string): Date | null {
    const match = HUMAN_TIME_PATTERN.exec(text);
    if (!match) return null;

    const timeStr = match[1].trim(); // e.g. "3pm", "4pm", "5:30am"
    const timeMatch = /^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i.exec(timeStr);
    if (!timeMatch) return null;

    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3].toLowerCase();

    if (meridiem === 'am') {
      if (hours === 12) hours = 0;
    } else {
      if (hours !== 12) hours += 12;
    }

    const now = new Date();
    const candidate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours,
      minutes,
      0,
      0
    );

    // If the time is in the past (or right now), roll to tomorrow
    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }

    return candidate;
  }
}
