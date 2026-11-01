Parrot is a language-learning app: import vocabulary lists, hear them via Google Cloud TTS in customizable repetition sequences. The plan and milestones are in `PLAN.md`; deployment steps in `DEPLOY.md` (keep it in sync with config changes).

## Layout
- `src/`: Vite + React SPA. Pages in `src/pages/`, logic in `src/lib/` (pure modules have `*.test.ts` next to them).
- `shared/`: TTS core used by both the browser and the Worker (validation, cache key, Google client).
- `worker/`: Cloudflare Worker serving the SPA and `/api/*` (server mode).

## Two audio modes
- **Own key:** the user's Google API key, stored in the browser, calls Google directly.
- **Server:** no key set, so the app uses the Worker, which holds the key and must stay behind Cloudflare Access and fail closed (`worker/auth.ts`). The Worker also checks the signed-in email against the `ALLOWED_EMAILS` secret. Don't commit real email addresses: the repo is public.
Both share the same cache key, so clips are interchangeable. Clips are cached in IndexedDB on every device.

## Mobile and offline
- Mobile first: design for a ~390 px phone, then adapt up (`@media (min-width: 760px)`). Touch targets ≥ 44 px, inputs 16 px. Check 320 px has no horizontal scroll.
- Installable PWA. `sw/sw.js` is a template; the `serviceWorker` plugin in `vite.config.ts` fills in the precache list at build time. Only active in production builds (`vite preview` to test).
- Anything needed to practice must work offline: clips in IndexedDB, voices cached in localStorage, last session in IndexedDB. Never make playback depend on the network.
- `useEffect` callbacks must not return values (use braces): newer Chrome returns a Promise from `scrollTo`, which crashed React.

## Personality
- The UI should feel playful: Parrot the mascot (`components/Parrot.tsx`), article colours by gender (`components/Term.tsx`), greetings and praise in the target language, streaks, confetti on finishing. Keep it light and never in the way of practicing.
- All motion must stop under `prefers-reduced-motion` (handled globally in `styles.css`).

## Rules
- Run `npm test` and `npm run typecheck` before committing.
- Never commit secrets. The server key lives in `.dev.vars` locally and `wrangler secret` in production. Worker config that varies per deployment (Access domain, AUD, allowed emails) is also a secret, so CI deploys never overwrite it; keep `vars` out of `wrangler.jsonc`.
- Pushing to `main` deploys to production via GitHub Actions.
- Keep runtime dependencies few: users paste API keys into this app. `public/_headers` sets a strict CSP; update `connect-src` if a new origin is needed.
