import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatCountdown } from '../src/StatusBar.js';

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
