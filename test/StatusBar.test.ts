import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatusBar, formatCountdown, formatResetTime } from '../src/StatusBar.js';

describe('StatusBar', () => {
  let bar: StatusBar;

  beforeEach(() => {
    bar = new StatusBar({ cols: 80 });
  });

  describe('render() state display', () => {
    it('renders RUNNING with green-colored text', () => {
      const output = bar.render('RUNNING', { cwd: '/home/user' });
      // Should contain green SGR codes around "Running"
      expect(output).toContain('\x1b[32m');
      expect(output).toContain('Running');
    });

    it('renders WAITING with yellow-colored text and countdown', () => {
      const resetTime = new Date(Date.now() + 120_000); // 2 minutes from now
      const output = bar.render('WAITING', { resetTime, cwd: '/home/user' });
      expect(output).toContain('\x1b[33m');
      expect(output).toContain('Waiting');
      // Should contain countdown info
      expect(output).toMatch(/\d+m \d+s/);
    });

    it('renders RESUMING with green-colored text', () => {
      const output = bar.render('RESUMING', { cwd: '/home/user' });
      expect(output).toContain('\x1b[32m');
      expect(output).toContain('Resuming');
    });

    it('renders DEAD with red-colored text', () => {
      const output = bar.render('DEAD', { cwd: '/home/user' });
      expect(output).toContain('\x1b[31m');
      expect(output).toContain('Dead');
    });
  });

  describe('render() ANSI structure', () => {
    it('starts with saveCursor + moveTo(1,1) + clearLine', () => {
      const output = bar.render('RUNNING', { cwd: '/test' });
      // saveCursor = \x1b7, moveTo(1,1) = \x1b[1;1H, clearLine = \x1b[2K
      expect(output.startsWith('\x1b7\x1b[1;1H\x1b[2K')).toBe(true);
    });

    it('ends with restoreCursor', () => {
      const output = bar.render('RUNNING', { cwd: '/test' });
      // restoreCursor = \x1b8
      expect(output.endsWith('\x1b8')).toBe(true);
    });
  });

  describe('render() content', () => {
    it('includes cwd in output', () => {
      const output = bar.render('RUNNING', { cwd: '/home/user/project' });
      expect(output).toContain('/home/user/project');
    });

    it('includes reset time info when WAITING', () => {
      const resetTime = new Date(Date.now() + 60_000);
      const output = bar.render('WAITING', { resetTime, cwd: '/test' });
      // Should contain the formatted absolute time
      expect(output).toContain('resets');
    });
  });

  describe('initScrollRegion()', () => {
    it('returns setScrollRegion(2, rows) + moveTo(2, 1)', () => {
      const output = bar.initScrollRegion(24);
      // setScrollRegion(2, 24) = \x1b[2;24r, moveTo(2, 1) = \x1b[2;1H
      expect(output).toBe('\x1b[2;24r\x1b[2;1H');
    });
  });

  describe('cleanup()', () => {
    it('returns resetScrollRegion + showCursor + resetAttributes', () => {
      const output = bar.cleanup();
      // resetScrollRegion = \x1b[r, showCursor = \x1b[?25h, resetAttributes = \x1b[0m
      expect(output).toBe('\x1b[r\x1b[?25h\x1b[0m');
    });
  });
});

describe('formatCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats 65 seconds as "1m 05s"', () => {
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const resetTime = new Date('2026-01-01T12:01:05Z');
    expect(formatCountdown(resetTime)).toBe('1m 05s');
  });

  it('formats 3661 seconds as "1h 01m 01s"', () => {
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const resetTime = new Date('2026-01-01T13:01:01Z');
    expect(formatCountdown(resetTime)).toBe('1h 01m 01s');
  });

  it('formats 0 or negative as "0m 00s"', () => {
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const resetTime = new Date('2026-01-01T11:59:00Z'); // In the past
    expect(formatCountdown(resetTime)).toBe('0m 00s');
  });

  it('formats 30 seconds as "0m 30s"', () => {
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const resetTime = new Date('2026-01-01T12:00:30Z');
    expect(formatCountdown(resetTime)).toBe('0m 30s');
  });
});

describe('formatResetTime', () => {
  it('formats a date to localized time string', () => {
    const date = new Date('2026-01-01T14:45:00');
    const result = formatResetTime(date);
    // Should contain the hour and minute — exact format depends on locale
    // but should include "2:45" or "14:45" depending on locale
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});
