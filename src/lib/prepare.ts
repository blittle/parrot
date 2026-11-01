import type { TtsRequest } from "../../shared/api";
import { clipsDb } from "./db";
import type { RenderProgress } from "./render";
import { isRateLimit, OfflineError, PendingError } from "./retry";
import { keepSlots, uniqueClips, type Plan } from "./sequence";
import { clipKey, getClipsSettled } from "./tts";

export interface PreparedPlan {
  /** The plan, minus words whose audio isn't available. */
  plan: Plan;
  /** Distinct words left out. */
  skippedWords: number;
  /** Distinct words kept. */
  keptWords: number;
  /** Why words were left out. */
  reason?: "quota" | "downloading" | "offline" | "error";
  error?: unknown;
}

const reqKey = (req: Required<TtsRequest>) => JSON.stringify(req);

/**
 * Makes sure a session can start with whatever audio is available.
 *
 * Saved clips are used as-is. Missing clips get one quick attempt (no waiting
 * on Google's quota). A word is kept only if all of its clips are ready, so a
 * partial session never plays half a word. Only if nothing at all is playable
 * does it wait out the quota, like a normal download.
 */
export async function preparePlan(plan: Plan, onProgress: (p: RenderProgress) => void): Promise<PreparedPlan> {
  const unique = uniqueClips(plan);
  const hashes = await Promise.all(unique.map((r) => clipKey(r)));
  const present = await Promise.all(hashes.map((h) => clipsDb.has(h)));
  const missing = unique.filter((_, i) => !present[i]);

  const failedKeys = new Set<string>();
  let error: unknown;
  const progress = (done: number, total: number, waiting?: boolean) => onProgress({ phase: "audio", done, total, waiting });

  if (missing.length > 0) {
    const quick = await getClipsSettled(missing, progress, { retry: false });
    error = quick.error;
    for (const i of quick.failed) failedKeys.add(reqKey(missing[i]));

    const pruned = prune(plan, failedKeys);
    // Nothing playable yet and Google just needs a minute: wait it out once.
    if (failedKeys.size > 0 && !hasClips(pruned) && (isRateLimit(error) || error instanceof PendingError)) {
      const retryReqs = missing.filter((r) => failedKeys.has(reqKey(r)));
      const slow = await getClipsSettled(retryReqs, progress, { retry: true });
      failedKeys.clear();
      for (const i of slow.failed) failedKeys.add(reqKey(retryReqs[i]));
      error = slow.error;
    }
  }

  const result = prune(plan, failedKeys);
  const kept = new Set(result.slots.map((w) => w.id));
  const skipped = new Set(plan.slots.map((w) => w.id).filter((id) => !kept.has(id)));
  return {
    plan: result,
    keptWords: kept.size,
    skippedWords: skipped.size,
    reason:
      skipped.size === 0
        ? undefined
        : isRateLimit(error)
          ? "quota"
          : error instanceof PendingError
            ? "downloading"
            : error instanceof OfflineError
              ? "offline"
              : "error",
    error: skipped.size === 0 ? undefined : error,
  };
}

function prune(plan: Plan, failedKeys: Set<string>): Plan {
  if (failedKeys.size === 0) return plan;
  const bad = new Set<number>();
  for (const item of plan.items) {
    if (item.kind === "clip" && failedKeys.has(reqKey(item.req))) bad.add(item.slot);
  }
  return keepSlots(plan, (slot) => !bad.has(slot));
}

function hasClips(plan: Plan): boolean {
  return plan.items.some((i) => i.kind === "clip");
}
