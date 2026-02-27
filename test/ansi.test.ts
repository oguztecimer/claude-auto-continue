import { describe, it, expect } from 'vitest';
import {
  moveTo,
  saveCursor,
  restoreCursor,
  setScrollRegion,
  resetScrollRegion,
  clearLine,
  green,
  yellow,
  red,
  bold,
  inverse,
  showCursor,
  hideCursor,
  resetAttributes,
} from '../src/ansi.js';

describe('ansi helpers', () => {
  describe('cursor positioning', () => {
    it('moveTo(row, col) returns CSI row;col H', () => {
      expect(moveTo(1, 1)).toBe('\x1b[1;1H');
      expect(moveTo(10, 20)).toBe('\x1b[10;20H');
      expect(moveTo(2, 1)).toBe('\x1b[2;1H');
    });

    it('saveCursor is DECSC', () => {
      expect(saveCursor).toBe('\x1b7');
    });

    it('restoreCursor is DECRC', () => {
      expect(restoreCursor).toBe('\x1b8');
    });
  });

  describe('scroll region', () => {
    it('setScrollRegion(top, bottom) returns DECSTBM sequence', () => {
      expect(setScrollRegion(2, 24)).toBe('\x1b[2;24r');
      expect(setScrollRegion(1, 50)).toBe('\x1b[1;50r');
    });

    it('resetScrollRegion resets to full screen', () => {
      expect(resetScrollRegion).toBe('\x1b[r');
    });
  });

  describe('line operations', () => {
    it('clearLine clears entire current line', () => {
      expect(clearLine).toBe('\x1b[2K');
    });
  });

  describe('colors', () => {
    it('green wraps text in SGR 32m/0m', () => {
      expect(green('hello')).toBe('\x1b[32mhello\x1b[0m');
    });

    it('yellow wraps text in SGR 33m/0m', () => {
      expect(yellow('warning')).toBe('\x1b[33mwarning\x1b[0m');
    });

    it('red wraps text in SGR 31m/0m', () => {
      expect(red('error')).toBe('\x1b[31merror\x1b[0m');
    });
  });

  describe('text attributes', () => {
    it('bold wraps text in SGR 1m/0m', () => {
      expect(bold('strong')).toBe('\x1b[1mstrong\x1b[0m');
    });

    it('inverse wraps text in SGR 7m/0m', () => {
      expect(inverse('inverted')).toBe('\x1b[7minverted\x1b[0m');
    });
  });

  describe('cursor visibility', () => {
    it('showCursor makes cursor visible', () => {
      expect(showCursor).toBe('\x1b[?25h');
    });

    it('hideCursor hides cursor', () => {
      expect(hideCursor).toBe('\x1b[?25l');
    });
  });

  describe('reset', () => {
    it('resetAttributes clears all SGR attributes', () => {
      expect(resetAttributes).toBe('\x1b[0m');
    });
  });
});
