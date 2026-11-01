import type { ApiError, TtsResponse, VoicesResponse } from "../shared/api";
import { checkAccess, type AuthEnv } from "./auth";
import { audioObjectKey, cacheKey, HASH_PATTERN } from "../shared/cache-key";
import { GoogleTtsError, listVoices, synthesize } from "../shared/google";
import { LANGUAGE_CODE, validateTtsRequest } from "../shared/validate";

interface Env extends AuthEnv {
  AUDIO: R2Bucket;
  GOOGLE_TTS_API_KEY?: string;
}

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers });
}

function error(message: string, status: number): Response {
  return json({ error: message } satisfies ApiError, status);
}


export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return error("Not found", 404);

    const authError = await checkAccess(request, env);
    if (authError) return error(authError, 401);

    try {
      // GET /api/audio/:hash  -> cached MP3 from R2
      const audioMatch = url.pathname.match(/^\/api\/audio\/([^/]+)$/);
      if (audioMatch && request.method === "GET") {
        const hash = audioMatch[1];
        if (!HASH_PATTERN.test(hash)) return error("Invalid audio id", 400);
        const object = await env.AUDIO.get(audioObjectKey(hash));
        if (!object) return error("Audio not found", 404);
        return new Response(object.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            // Content-addressed, so it never changes. Private because it's behind auth.
            "Cache-Control": "private, max-age=31536000, immutable",
            ETag: object.httpEtag,
          },
        });
      }

      if (!env.GOOGLE_TTS_API_KEY) return error("GOOGLE_TTS_API_KEY is not set", 500);

      // POST /api/tts  -> synthesize (or reuse cached) audio
      if (url.pathname === "/api/tts" && request.method === "POST") {
        const body = await request.json().catch(() => null);
        const validated = validateTtsRequest(body);
        if (!validated.ok) return error(validated.error, 400);

        const req = validated.value;
        const hash = await cacheKey(req);
        const key = audioObjectKey(hash);
        const audioUrl = `/api/audio/${hash}`;

        if (await env.AUDIO.head(key)) {
          return json({ hash, url: audioUrl, cached: true } satisfies TtsResponse);
        }

        const audio = await synthesize(req, env.GOOGLE_TTS_API_KEY);
        await env.AUDIO.put(key, audio, {
          httpMetadata: { contentType: "audio/mpeg" },
          customMetadata: {
            // Handy when browsing the bucket. Header-safe encoding for umlauts.
            text: encodeURIComponent(req.text),
            voice: req.voice,
            speakingRate: String(req.speakingRate),
          },
        });
        return json({ hash, url: audioUrl, cached: false } satisfies TtsResponse);
      }

      // GET /api/voices?lang=de-DE  -> available Google voices for a language
      if (url.pathname === "/api/voices" && request.method === "GET") {
        const lang = url.searchParams.get("lang") ?? "de-DE";
        if (!LANGUAGE_CODE.test(lang)) return error("lang must look like de-DE", 400);
        const voices = await listVoices(lang, env.GOOGLE_TTS_API_KEY);
        return json({ voices } satisfies VoicesResponse, 200, {
          "Cache-Control": "private, max-age=3600",
        });
      }

      return error("Not found", 404);
    } catch (err) {
      if (err instanceof GoogleTtsError) {
        // Pass quota errors through so the app knows to wait and retry.
        if (err.status === 429) {
          return json({ error: `Google TTS: ${err.message}` } satisfies ApiError, 429, { "Retry-After": "30" });
        }
        // Surface Google's message (e.g. unknown voice) but don't echo upstream 401/403s,
        // which would look like the user's own auth failed.
        return error(`Google TTS: ${err.message}`, err.status >= 500 ? 502 : 400);
      }
      console.error(err);
      return error("Internal error", 500);
    }
  },
} satisfies ExportedHandler<Env>;
