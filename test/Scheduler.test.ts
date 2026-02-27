import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../src/Scheduler';

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires callback after calculated wait + safety buffer (future resetTime)', async () => {
    const scheduler = new Scheduler(5000);
    const callback = vi.fn();

    // resetTime is 60 seconds in the future
    const resetTime = new Date(Date.now() + 60_000);
    scheduler.scheduleAt(resetTime, callback);

    // Advance 64 seconds — not yet (60s + 5s buffer = 65s total)
    await vi.advanceTimersByTimeAsync(64_000);
    expect(callback).not.toHaveBeenCalled();

    // Advance 1 more second to cross 65s
    await vi.advanceTimersByTimeAsync(1_000);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('fires callback immediately (0ms delay) when resetTime is in the past', async () => {
    const scheduler = new Scheduler(0); // 0ms safety buffer so past times fire at 0
    const callback = vi.fn();

    // resetTime is 10 seconds in the past
    const resetTime = new Date(Date.now() - 10_000);
    scheduler.scheduleAt(resetTime, callback);

    // With 0 safety buffer: max(0, -10000 + 0) = 0 → fires immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('does not fire callback after cancel()', async () => {
    const scheduler = new Scheduler(5000);
    const callback = vi.fn();

    const resetTime = new Date(Date.now() + 60_000);
    scheduler.scheduleAt(resetTime, callback);

    // Cancel before timer fires
    scheduler.cancel();

    // Advance past when it would have fired
    await vi.advanceTimersByTimeAsync(70_000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('handles null resetTime by firing immediately (0ms delay)', async () => {
    const scheduler = new Scheduler(5000);
    const callback = vi.fn();

    scheduler.scheduleAt(null, callback);

    await vi.advanceTimersByTimeAsync(0);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('re-scheduling cancels previous timer — only last callback fires', async () => {
    const scheduler = new Scheduler(0);
    const firstCallback = vi.fn();
    const secondCallback = vi.fn();

    const resetTime = new Date(Date.now() + 30_000);
    scheduler.scheduleAt(resetTime, firstCallback);

    // Schedule a new one (should cancel first)
    const resetTime2 = new Date(Date.now() + 50_000);
    scheduler.scheduleAt(resetTime2, secondCallback);

    // Advance past both — only second should fire
    await vi.advanceTimersByTimeAsync(60_000);
    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).toHaveBeenCalledOnce();
  });

  it('cancel() when no timer pending does not throw', () => {
    const scheduler = new Scheduler(5000);
    // No scheduleAt called yet — cancel should be a no-op
    expect(() => scheduler.cancel()).not.toThrow();
  });

  it('scheduleAt() after cancel() does not schedule (cancelled flag stays true)', async () => {
    const scheduler = new Scheduler(5000);
    const callback = vi.fn();

    scheduler.cancel();

    // Try scheduling after cancel — should not fire
    scheduler.scheduleAt(null, callback);
    await vi.advanceTimersByTimeAsync(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it('safety buffer is configurable via constructor (10000ms instead of default 5000ms)', async () => {
    const scheduler = new Scheduler(10_000); // 10 second safety buffer
    const callback = vi.fn();

    // resetTime is exactly now → waitMs = max(0, 0 + 10000) = 10000
    const resetTime = new Date(Date.now());
    scheduler.scheduleAt(resetTime, callback);

    // 9 seconds not enough
    await vi.advanceTimersByTimeAsync(9_000);
    expect(callback).not.toHaveBeenCalled();

    // 1 more second crosses 10s buffer
    await vi.advanceTimersByTimeAsync(1_000);
    expect(callback).toHaveBeenCalledOnce();
  });
});
