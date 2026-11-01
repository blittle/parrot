# Parrot plan

A personal app for learning vocabulary by ear. Upload a word list, then listen to
it in customizable repetition sequences with high-quality text to speech.
German first, French and Spanish possibly later.

## Decisions

| Area | Choice | Why |
|---|---|---|
| TTS | Google Cloud Text-to-Speech | Excellent German voices (Chirp 3 HD), broad language coverage, generous free tier |
| Hosting | One Cloudflare Worker serving the SPA and `/api/*` | Keeps the API key server-side with minimal infrastructure |
| Audio cache | R2, keyed by SHA-256 of (voice, rate, text) | Each clip is synthesized once and replayed for free |
| Auth | Cloudflare Access in front of the app, JWT re-verified in the Worker | No auth code to maintain; the Worker fails closed if Access is misconfigured |
| Frontend | Vite + React + TypeScript | |
| Google auth | API key restricted to the Text-to-Speech API | Simplest option in a Worker; a service account JWT is possible later if needed |

## Architecture

```
Browser (React SPA)
 ├─ Upload CSV/XLSX, parsed client-side
 ├─ Column mapping: term, translation, article, notes
 ├─ Sequence builder
 └─ Player
        │  (Cloudflare Access)
        ▼
Worker
 ├─ GET  /api/voices?lang=de-DE   list Google voices
 ├─ POST /api/tts                 R2 cache hit, or synthesize + store
 ├─ GET  /api/audio/:hash         stream MP3 from R2 (immutable)
 └─ /api/lists                    (later) word lists in D1
```

## Milestones

### 1. Spike: voice audition (done)
- Worker with `/api/tts`, `/api/voices`, `/api/audio/:hash`, R2 caching, Access verification.
- Page to type German text and play it with every Google `de-DE` voice, at adjustable speed, with favorites.
- Goal: pick a default voice (and maybe a second voice for variety) by ear.

### 2. MVP: lists and sequences
- Upload CSV or XLSX (SheetJS). Handle non-UTF-8 Excel exports so ä/ö/ü/ß survive.
- Column mapping with a preview. Combine an optional article column with the noun ("der Hund").
- Separate display text from spoken text: strip annotations like "(m.)" or "pl. -e" before synthesis.
- Pre-generate all audio on upload with a progress bar, so playback never waits on the network.
- Sequence builder, for example:
  `[term ×2, pause 1s] → [translation, pause 2s] → [term at 0.8x, pause 3s]`
  - Steps: speak term, speak translation, pause.
  - Per step: repeat count, speed, voice.
  - Session order: in order, shuffled.
- Translation spoken with an English voice (or hidden for recall practice).
- Lists stored locally (IndexedDB) for now.

### 3. Hands-free listening
- Render a whole session (clips plus silences) into one audio file with `OfflineAudioContext`,
  so playback survives a locked phone screen (iOS throttles background timers).
- Media Session API for lock screen controls and track info.
- Download a session as an MP3 or WAV.

### 4. Later
- Lists synced across devices (D1).
- Mark words as known; spaced repetition ordering.
- Record yourself and compare with the TTS clip.
- French (`fr-FR`) and Spanish (`es-ES` / `es-MX`): mostly config, since the language code lives on each list.
- SSML `<phoneme>` overrides for words a voice gets wrong (Neural2/Wavenet support SSML; Chirp 3 HD does not).

## Open questions
- Which voice family wins for single words vs. sentences? (Answer with the spike.)
- Is the slow version better as a lower `speakingRate` or as the same clip with longer pauses?
