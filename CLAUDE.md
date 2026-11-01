Parrot is a personal language-learning app: upload vocabulary lists, hear them via Google Cloud TTS in customizable repetition sequences. The plan and milestones are in `PLAN.md`.

- Stack: Cloudflare Worker (`worker/`) serving a Vite + React SPA (`src/`), with types shared in `shared/`.
- Run `npm test` and `npm run typecheck` before committing.
- Never commit secrets. The Google API key lives in `.dev.vars` locally and `wrangler secret` in production.
- The API must stay behind Cloudflare Access and fail closed (see `worker/auth.ts`).
