# ClassCaption backend

API for **ClassCaption**, an AI classroom companion with live translated captions, an "I'm lost" confusion meter, a pace coach, and recorded lectures with subtitles, notes, a quiz and Ask-the-lecture, in Indian languages.

- **Stack:** Next.js API routes (Vercel), ffmpeg (video to audio), Supabase (Postgres, Realtime, Storage), Groq Whisper large-v3, Gemini Flash. Translation goes through a provider chain (Bhashini → Groq → Gemini → Google fallback).
- **Endpoint reference for the frontend:** [`API_CONTRACT.md`](API_CONTRACT.md)

## Setup (about 10 minutes)

1. **Database.** In Supabase, open SQL Editor, paste all of [`supabase/schema.sql`](supabase/schema.sql), and click Run. This creates the tables, read-only RLS policies, Realtime publication and the `lectures` storage bucket.
2. **Keys.** Copy `.env.example` to `.env.local` and fill it in. On Vercel, add the same variables under Project → Settings → Environment Variables. Never commit `.env.local`.
3. **Run.**
   ```bash
   npm install
   npm run dev                         # http://localhost:3000
   ```
4. **Check.** Look at the port `npm run dev` prints (3000, or 3001 if 3000 is busy) and open http://localhost:PORT/api/health. You want `"database": "ok"` and `gemini`/`groq` set to `true`.
5. **Test end to end** without any frontend:
   ```bash
   node --env-file=.env.local scripts/check-env.mjs   # checks your keys without the server
   node scripts/demo.mjs                              # live class, reactions, notes, Q&A, subtitles
   node scripts/demo.mjs http://localhost:3000 lec.mp4   # also the recorded pipeline (video or audio, ≤50 MB)
   ```
   In a second terminal, watch captions arrive over Realtime the way a student phone would:
   ```bash
   node --env-file=.env.local scripts/listen.mjs <JOIN_CODE> hi
   ```

## Deploy

Push to GitHub, import the repo in Vercel, add the environment variables, then deploy. Run `node scripts/demo.mjs https://<app>.vercel.app` against the deployment.

## Translation providers

`TRANSLATION_PROVIDERS` sets the order (default `bhashini,groq,gemini,google`: Groq is fastest for live captions). A provider is skipped when its keys are missing, and each one falls back to the next on error or timeout, so captions keep flowing even if a free-tier rate limit is hit. When the Bhashini keys arrive, set `BHASHINI_USER_ID` and `BHASHINI_API_KEY` and it becomes the first choice automatically. The code is in `src/lib/translate/`.

## Layout

```
supabase/schema.sql          tables, RLS, realtime, storage bucket
src/lib/translate/           swappable translators (bhashini.ts, index.ts)
src/lib/ai/                  gemini.ts, groq.ts, lecture.ts (notes, ask, explain prompts)
src/lib/classes.ts           live class helpers
src/lib/lectures.ts          recorded pipeline, live→lecture, subtitles
src/app/api/**               route handlers (see API_CONTRACT.md)
scripts/demo.mjs             end-to-end API test
scripts/listen.mjs           Realtime listener (acts as a student phone)
```

## Known limits (prototype)

- No login yet. Anyone with a join code can join, and anyone with the URL can call the API.
- Uploads are capped at 50 MB by Supabase Storage on the free plan. The server extracts and chunks audio itself (ffmpeg), so Groq's 25 MB limit doesn't apply.
- Free-tier rate limits on Gemini and Groq apply. The translator chain falls back automatically.
