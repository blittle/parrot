# Parrot

Learn vocabulary by ear. Import a word list, choose a repetition sequence
("word twice, meaning, word slowly"), and Parrot turns it into one audio
session you can play with your phone locked or download. Uses Google Cloud
text to speech. German first; French, Spanish and Italian work too.

See [PLAN.md](PLAN.md) for the design and roadmap.

## Features

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

```sh
npx wrangler login
npx wrangler r2 bucket create parrot-audio
npm run deploy
```

That's enough for "own key" mode: anyone can open the site and paste their key.

To also enable server mode:

```sh
npx wrangler secret put GOOGLE_TTS_API_KEY
npx wrangler secret put ALLOWED_EMAILS   # comma-separated, e.g. you@example.com,friend@example.com
```

`ALLOWED_EMAILS` is a secret rather than a var so the addresses stay out of this
public repo. The Worker checks every request's signed-in email against it, in
addition to the Access policy below. Keep the two lists in sync.

Then put the app behind **Cloudflare Access** (Zero Trust, free for up to 50 users):

1. In the Cloudflare dashboard, open the `parrot` Worker → **Settings → Domains & Routes**
   and enable Cloudflare Access on the `workers.dev` route (or add a custom domain and
   create a self-hosted Access application for it under **Zero Trust → Access → Applications**).
2. Add an **Allow** policy with an **Emails** rule listing the same addresses as `ALLOWED_EMAILS`.
   Under login methods, the default "One-time PIN" (a code emailed to you) works with any
   address; add Google as a login method if you'd rather sign in with your Google account.
3. Copy the application's **Audience (AUD) tag** and your **team domain**
   (e.g. `yourteam.cloudflareaccess.com`) into `vars` in `wrangler.jsonc`.
4. `npm run deploy` again.

Until both vars and `ALLOWED_EMAILS` are set, `/api/*` rejects every request with 401, so a
misconfiguration can't expose the server key. If you want the site public for
"own key" users but the server private, put Access on `/api/*` only.
If you use a custom domain, disable the `workers.dev` and preview URLs so Access
can't be bypassed.
