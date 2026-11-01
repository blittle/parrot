Parrot is a language-learning app: import vocabulary lists, hear them via Google Cloud TTS in customizable repetition sequences. The plan and milestones are in `PLAN.md`.

## Layout
- `src/`: Vite + React SPA. Pages in `src/pages/`, logic in `src/lib/` (pure modules have `*.test.ts` next to them).
- `shared/`: TTS core used by both the browser and the Worker (validation, cache key, Google client).
- `worker/`: Cloudflare Worker serving the SPA and `/api/*` (server mode).

## Two audio modes
- **Own key:** the user's Google API key, stored in the browser, calls Google directly.
- **Server:** no key set, so the app uses the Worker, which holds the key and must stay behind Cloudflare Access and fail closed (`worker/auth.ts`).
Both share the same cache key, so clips are interchangeable. Clips are cached in IndexedDB on every device.

## Rules
- Run `npm test` and `npm run typecheck` before committing.
- Never commit secrets. The server key lives in `.dev.vars` locally and `wrangler secret` in production.
- Keep runtime dependencies few: users paste API keys into this app. `public/_headers` sets a strict CSP; update `connect-src` if a new origin is needed.
