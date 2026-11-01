# Parrot

Learn vocabulary by ear. Import a word list, choose a repetition sequence
("word twice, meaning, word slowly"), and Parrot turns it into one audio
session you can play with your phone locked or download. Uses Google Cloud
text to speech. German first; French, Spanish and Italian work too.

Parrot is built for phones first and is an installable **PWA**: add it to your
home screen and every downloaded list plays fully offline.

See [PLAN.md](PLAN.md) for the design and roadmap.

## Features

- **Mobile first, works offline:** installable from the browser (Settings shows how on
  iPhone and Android). A service worker caches the app; every imported list downloads all
  its audio automatically, with an "Ready offline" indicator per list. The last session is
  saved and resumes where you stopped, even with no connection.

- **Import** `.xlsx`, `.csv` or `.tsv`, or paste from a spreadsheet. Columns are detected
  automatically (word, translation, article/gender, notes), including legacy Excel encodings.
- **Speech-ready text:** articles are added to nouns ("der Hund"), gender markers become
  articles (`m` → der), and notation like `(n.)`, `, -e` or `etw.` is cleaned up before speaking.
  Any word can have a custom "spoken as" override.
- **Sequences:** presets (Listen and repeat, Recall, Shadowing, Quick review) or your own steps,
  with repeats, speed and pauses. Shuffle, ranges, loops and skipping known words.
- **Player:** the session is rendered into a single WAV, so it keeps playing on a locked phone.
  Shows the current word, works with lock screen and headphone controls, and can be downloaded.
- **Voices:** compare every Google voice per language and set a default.
- **Caching:** every clip is stored on the device (and in R2 in server mode), so each word is
  only paid for once.

## Two ways to get audio

1. **Your own key (no backend needed).** Paste a Google Cloud API key in Settings.
   The browser calls Google directly and the key never leaves the browser except to Google.
   Restrict the key to the Text-to-Speech API and to this site's address
   (the in-app Settings page shows how).
2. **The Parrot server.** With no key set, the app uses the Worker's `/api/*`, which holds
   a key server-side behind Cloudflare Access. Good for you and people you allowlist.

## Local development

```sh
npm install
npm run dev
```

Then either paste your key in the app's Settings page, or, to test server mode,
`cp .dev.vars.example .dev.vars` and put the key there (`AUTH_DISABLED=true` skips
Cloudflare Access locally).

```sh
npm test
npm run typecheck
```

## Google Cloud setup

1. Create (or pick) a Google Cloud project and attach a billing account.
2. Enable the **Cloud Text-to-Speech API**.
3. **APIs & Services → Credentials → Create credentials → API key.**
4. Edit the key. Under **API restrictions**, allow only **Cloud Text-to-Speech API**.
   - For a key pasted into the browser, also add a **website restriction** for your
     site's address, e.g. `https://parrot.example.com/*`.
   - For the server key, leave application restrictions at **None** (Cloudflare has no fixed IP).
5. Optional: set a budget alert under **Billing → Budgets & alerts**.

## Deploying to Cloudflare

The full one-time checklist (Google key, Cloudflare account, R2, Access,
GitHub secrets) is in the deployment checklist doc. In short:

```sh
npx wrangler login
npx wrangler r2 bucket create parrot-audio
npm run deploy
```

That's enough for "own key" mode. For server mode, set the Worker's secrets.
All four are secrets, not vars, so CI deploys never overwrite them:

```sh
npx wrangler secret put GOOGLE_TTS_API_KEY
npx wrangler secret put ALLOWED_EMAILS       # you@example.com,friend@example.com
npx wrangler secret put ACCESS_TEAM_DOMAIN   # yourteam.cloudflareaccess.com
npx wrangler secret put ACCESS_AUD           # the Access application's Audience tag
```

Then put the site behind **Cloudflare Access**: in the `parrot` Worker's
**Settings → Domains & Routes**, enable Access on the `workers.dev` route, and give
the Access application an Allow policy for the same emails as `ALLOWED_EMAILS`.
Until all four secrets are set, `/api/*` rejects every request with 401.

### Continuous deployment

`.github/workflows/deploy.yml` runs typecheck, tests and build on every pull
request, and on every push to `main` also deploys with `wrangler deploy`. It needs
two repository secrets: `CLOUDFLARE_API_TOKEN` (a token from the "Edit Cloudflare
Workers" template) and `CLOUDFLARE_ACCOUNT_ID`. Without them the deploy step is
skipped with a warning.
