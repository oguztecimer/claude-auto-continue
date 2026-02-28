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
