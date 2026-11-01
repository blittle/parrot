import { describe, expect, it } from "vitest";
import { GoogleTtsError } from "../../shared/google";
import { HttpError, isRateLimit, withRetry } from "./retry";

const noSleep = () => Promise.resolve();

describe("isRateLimit", () => {
  it("recognises quota errors from Google and the server", () => {
    expect(isRateLimit(new GoogleTtsError("Quota exceeded for quota metric", 429))).toBe(true);
    expect(isRateLimit(new HttpError("Google TTS: Resource has been exhausted", 429))).toBe(true);
    expect(isRateLimit(new Error("RESOURCE_EXHAUSTED"))).toBe(true);
    expect(isRateLimit(new GoogleTtsError("API key not valid", 400))).toBe(false);
    expect(isRateLimit(new TypeError("Failed to fetch"))).toBe(false);
  });
});

describe("withRetry", () => {
  it("retries rate limits until it succeeds", async () => {
    let calls = 0;
    const waits: number[] = [];
    const result = await withRetry(
      async () => {
        if (++calls < 3) throw new HttpError("Too many requests", 429);
        return "ok";
      },
      { sleep: noSleep, onWait: (ms) => waits.push(ms) },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(waits).toHaveLength(2);
  });

  it("does not retry other errors", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("API key not valid");
        },
        { sleep: noSleep },
      ),
    ).rejects.toThrow("API key not valid");
    expect(calls).toBe(1);
  });

  it("gives up after the last delay", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new HttpError("quota", 429);
        },
        { sleep: noSleep, delays: [1, 1] },
      ),
    ).rejects.toThrow("quota");
    expect(calls).toBe(3);
  });
});
