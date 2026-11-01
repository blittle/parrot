# Parrot

Learn vocabulary by ear: upload word lists and hear them in customizable
repetition sequences using Google Cloud text to speech. See [PLAN.md](PLAN.md).

Currently a **voice audition** page for comparing Google's German voices.

## Local development

1. Get a Google Cloud API key (see below).
2. `cp .dev.vars.example .dev.vars` and paste the key in.
3. `npm install`
4. `npm run dev` and open the URL it prints.

`.dev.vars` sets `AUTH_DISABLED=true` so you can run locally without Cloudflare Access.
R2 is simulated locally by the dev server.

```sh
npm test         # unit tests
npm run typecheck
```

## Google Cloud setup

1. Create (or pick) a Google Cloud project and enable billing.
2. Enable the **Cloud Text-to-Speech API**.
3. **APIs & Services → Credentials → Create credentials → API key.**
4. Edit the key and under **API restrictions** restrict it to **Cloud Text-to-Speech API** only.
5. Optional but recommended: set a budget alert under **Billing → Budgets & alerts**.

Google has a monthly free tier per voice family. Check current pricing; with
caching, a list is only paid for once.

## Deploying to Cloudflare

```sh
npx wrangler login
npx wrangler r2 bucket create parrot-audio
npx wrangler secret put GOOGLE_TTS_API_KEY
npm run deploy
```

Then put the app behind **Cloudflare Access** (Zero Trust, free for up to 50 users):

1. In the Cloudflare dashboard, open the `parrot` Worker → **Settings → Domains & Routes**
   and enable Cloudflare Access on the `workers.dev` route (or add a custom domain and
   create a self-hosted Access application for it under **Zero Trust → Access → Applications**).
2. Add a policy that allows only your email (and anyone else you want).
3. Copy the application's **Audience (AUD) tag** and your **team domain**
   (e.g. `yourteam.cloudflareaccess.com`) into `vars` in `wrangler.jsonc`.
4. `npm run deploy` again.

Until both vars are set, the API rejects every request with 401. That is
intentional: the Worker fails closed, so a misconfiguration can't expose your key.
If you use a custom domain, disable the `workers.dev` and preview URLs so Access
can't be bypassed.
