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
   node --env-file=.env.local scripts/listen.mjs <CLASS_ID> hi
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
scripts/board.mjs            board capture test: node scripts/board.mjs photo.jpg hi http://127.0.0.1:4000
```

## Accounts and joining

- **Teachers** create an account at `/teacher/login` (name, email, password; passwords are hashed with scrypt). A teacher sees and controls only their own classrooms, live classes and recordings. The first teacher to sign up inherits classrooms created before accounts existed.
- **Students** join at `/join` with the classroom PIN or by scanning the QR code from the teacher's "Join QR" button, and enter their name. The device gets a signed, HttpOnly pass for that classroom only: no account needed. Questions carry the name from the pass (or none, if asked anonymously), so nobody can post as someone else.
- Teachers can make a **new PIN** at any time; the old one stops working for new joins.
- Moderation: student questions, "Speak for me" text and names are checked for abuse (English, Hindi and Hinglish, including disguised spellings) before the teacher sees them or the laptop reads them aloud. Blocked messages are never saved; the teacher sees who tried, and three tries in 10 minutes mute that student for 10 minutes.
- Rate limits: PIN attempts (15 per 10 min per network), sign-ins, "I'm lost" (once per 10 s per student), questions, explain and Ask-the-lecture.
- Browsers can read only `captions` and `class_events` from Supabase (needed for Realtime). PINs, student questions and names, lectures and teacher accounts are only served by the API after a permission check. Announcements, board scans and "class ended" are written by the server, so students can't fake them.
- `node scripts/demo.mjs` also checks that strangers and students are refused where they should be.

## Known limits (prototype)

- Sessions are signed cookies with no server-side revocation list (signing out clears the cookie; changing `SESSION_SECRET` logs everyone out). Rate limits live in memory, so they reset when the server restarts.
- Anyone who learns a live class id can read its captions over Realtime; ids are random UUIDs and only shown after joining. The teacher's in-progress (grey) words are broadcast on the same channel without a signature.
- Uploads are capped at 50 MB by Supabase Storage on the free plan. The server extracts and chunks audio itself (ffmpeg), so Groq's 25 MB limit doesn't apply.
- Free-tier rate limits on Gemini and Groq apply. The translator chain falls back automatically.
