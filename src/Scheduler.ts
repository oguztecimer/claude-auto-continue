export class Scheduler {
  #timer: ReturnType<typeof setTimeout> | null = null;
  #cancelled = false;
  readonly #safetyMs: number;

  constructor(safetyMs = 5000) {
    this.#safetyMs = safetyMs;
  }

  /**
   * Schedule callback to fire at resetTime + safetyBuffer milliseconds from now.
   * If resetTime is null → fire immediately (0ms delay) as a fallback.
   * If resetTime is in the past → waitMs clamps to 0 (plus safety buffer).
   * Calling scheduleAt() while a timer is pending cancels the previous timer.
   * Calling scheduleAt() after cancel() is a no-op (cancelled flag stays true).
   */
  scheduleAt(resetTime: Date | null, callback: () => void): void {
    if (this.#cancelled) return;

    // Clear any existing timer before setting a new one
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }

    const waitMs = resetTime
      ? Math.max(0, resetTime.getTime() - Date.now() + this.#safetyMs)
      : 0;

    this.#timer = setTimeout(() => {
      if (!this.#cancelled) callback();
    }, waitMs);
  }

  /**
   * Cancel any pending timer. After cancel(), the scheduler is inert —
   * subsequent scheduleAt() calls are ignored.
   * Safe to call when no timer is pending (no-op, no error).
   */
  cancel(): void {
    this.#cancelled = true;
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
}
