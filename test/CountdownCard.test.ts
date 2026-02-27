import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CountdownCard } from '../src/CountdownCard.js';

describe('CountdownCard', () => {
  let card: CountdownCard;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    card = new CountdownCard({ cols: 80, rows: 24 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('render() content', () => {
    it('contains the cwd path', () => {
      const resetTime = new Date('2026-01-01T12:05:00Z');
      const output = card.render({ resetTime, cwd: '/home/user/project' });
      expect(output).toContain('/home/user/project');
    });

    it('contains a countdown string', () => {
      const resetTime = new Date('2026-01-01T12:03:22Z');
      const output = card.render({ resetTime, cwd: '/test' });
      expect(output).toContain('3m 22s');
    });

    it('contains the absolute reset time', () => {
      const resetTime = new Date('2026-01-01T14:45:00Z');
      const output = card.render({ resetTime, cwd: '/test' });
      // Should contain formatted time (locale-dependent, but should have digits)
      expect(output).toMatch(/\d{1,2}:\d{2}/);
    });

    it('contains a header text about waiting', () => {
      const resetTime = new Date('2026-01-01T12:05:00Z');
      const output = card.render({ resetTime, cwd: '/test' });
      expect(output).toMatch(/[Ww]aiting/);
    });
  });

  describe('render() centering', () => {
    it('uses moveTo for vertical centering (approximately middle of terminal)', () => {
      const resetTime = new Date('2026-01-01T12:05:00Z');
      const output = card.render({ resetTime, cwd: '/test' });
      // With 24 rows, status bar at row 1, card ~7-9 lines tall
      // Vertical center should be around row 8-12
      // Check that moveTo escape sequences target rows in the middle range
      const moveToPattern = /\x1b\[(\d+);\d+H/g;
      const rows: number[] = [];
      let match;
      while ((match = moveToPattern.exec(output)) !== null) {
        rows.push(parseInt(match[1], 10));
      }
      expect(rows.length).toBeGreaterThan(0);
      // First row should be somewhere near the middle (between 5 and 15 for 24-row terminal)
      expect(rows[0]).toBeGreaterThanOrEqual(5);
      expect(rows[0]).toBeLessThanOrEqual(15);
    });

    it('uses moveTo for horizontal centering', () => {
      const resetTime = new Date('2026-01-01T12:05:00Z');
      const output = card.render({ resetTime, cwd: '/test' });
      // With 80 cols, box ~48-50 wide, start col should be ~15-20
      const moveToPattern = /\x1b\[(\d+);(\d+)H/g;
      const cols: number[] = [];
      let match;
      while ((match = moveToPattern.exec(output)) !== null) {
        cols.push(parseInt(match[2], 10));
      }
      expect(cols.length).toBeGreaterThan(0);
      // Start column should be offset from left (centered)
      expect(cols[0]).toBeGreaterThan(1);
    });
  });

  describe('render() box structure', () => {
    it('has border characters', () => {
      const resetTime = new Date('2026-01-01T12:05:00Z');
      const output = card.render({ resetTime, cwd: '/test' });
      // Should contain box-drawing characters or +/-/| borders
      const hasBorders = output.includes('+') || output.includes('|') ||
                         output.includes('\u2500') || output.includes('\u2502') ||
                         output.includes('\u250c') || output.includes('\u2510');
      expect(hasBorders).toBe(true);
    });
  });

  describe('render() with null resetTime', () => {
    it('shows "Unknown" instead of crashing', () => {
      const output = card.render({ resetTime: null, cwd: '/test' });
      expect(output).toContain('Unknown');
    });
  });

  describe('render() dimension adaptation', () => {
    it('adapts to smaller terminal width', () => {
      const smallCard = new CountdownCard({ cols: 40, rows: 24 });
      const resetTime = new Date('2026-01-01T12:05:00Z');
      const output = smallCard.render({ resetTime, cwd: '/test' });
      // Should still render without error
      expect(output).toContain('Waiting');
    });

    it('adapts to larger terminal width', () => {
      const largeCard = new CountdownCard({ cols: 120, rows: 40 });
      const resetTime = new Date('2026-01-01T12:05:00Z');
      const output = largeCard.render({ resetTime, cwd: '/test' });
      expect(output).toContain('Waiting');
    });
  });

  describe('clear()', () => {
    it('produces escape sequences that clear the card area', () => {
      const output = card.clear();
      // Should contain moveTo + clearLine sequences
      expect(output).toContain('\x1b[2K'); // clearLine
      expect(output).toMatch(/\x1b\[\d+;\d+H/); // moveTo
    });

    it('clears multiple rows', () => {
      const output = card.clear();
      // Count how many clearLine sequences there are — should match card height
      const clearCount = (output.match(/\x1b\[2K/g) || []).length;
      expect(clearCount).toBeGreaterThan(5); // Card is ~7-9 lines
    });
  });
});
