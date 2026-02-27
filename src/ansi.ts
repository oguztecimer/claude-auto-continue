/**
 * ANSI escape code helpers for terminal rendering.
 * Pure string functions — no I/O, no dependencies.
 */

const CSI = '\x1b[';

// --- Cursor positioning ---

export function moveTo(row: number, col: number): string {
  return `${CSI}${row};${col}H`;
}

export const saveCursor = '\x1b7';
export const restoreCursor = '\x1b8';

// --- Scroll region ---

export function setScrollRegion(top: number, bottom: number): string {
  return `${CSI}${top};${bottom}r`;
}

export const resetScrollRegion = `${CSI}r`;

// --- Line operations ---

export const clearLine = `${CSI}2K`;

// --- Colors (foreground) ---

export function green(text: string): string {
  return `${CSI}32m${text}${CSI}0m`;
}

export function yellow(text: string): string {
  return `${CSI}33m${text}${CSI}0m`;
}

export function red(text: string): string {
  return `${CSI}31m${text}${CSI}0m`;
}

// --- Text attributes ---

export function bold(text: string): string {
  return `${CSI}1m${text}${CSI}0m`;
}

export function inverse(text: string): string {
  return `${CSI}7m${text}${CSI}0m`;
}

// --- Cursor visibility ---

export const showCursor = `${CSI}?25h`;
export const hideCursor = `${CSI}?25l`;

// --- Alternate screen buffer ---

export const enterAltScreen = `${CSI}?1049h`;
export const leaveAltScreen = `${CSI}?1049l`;

// --- Reset ---

export const resetAttributes = `${CSI}0m`;
