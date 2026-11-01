// Waiting out Google's per-minute quotas instead of failing.

/** An HTTP error from the Parrot server, keeping the status code. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Google's quota was still exhausted after retrying (or retrying was off). */
export class QuotaError extends Error {
  readonly status = 429;
}

/** A clip is being downloaded in the background (maybe waiting on the quota), not ready yet. */
export class PendingError extends Error {}

/** A clip isn't saved on this device and there's no connection to fetch it. */
export class OfflineError extends Error {}

/** True for "too many requests" / quota errors from Google or the Parrot server. */
export function isRateLimit(err: unknown): boolean {
  if (typeof err === "object" && err !== null && (err as { status?: unknown }).status === 429) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /quota|RESOURCE_EXHAUSTED|rate limit|too many requests/i.test(message);
}

// About 90 seconds in total: long enough for a per-minute quota to reset.
export const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 30000, 30000];

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    shouldRetry?: (err: unknown) => boolean;
    delays?: number[];
    onWait?: (ms: number) => void;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  const { shouldRetry = isRateLimit, delays = RETRY_DELAYS_MS, onWait, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= delays.length || !shouldRetry(err)) throw err;
      // A little jitter so parallel downloads don't retry in lockstep.
      const ms = Math.round(delays[attempt] * (0.8 + Math.random() * 0.4));
      onWait?.(ms);
      await sleep(ms);
    }
  }
}
