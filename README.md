# ClassCaption backend

API for **ClassCaption**, an AI classroom companion with live translated captions, an "I'm lost" confusion meter, a pace coach, and recorded lectures with subtitles, notes, a quiz and Ask-the-lecture, in Indian languages.

- **Stack:** Next.js API routes (Vercel), ffmpeg (video to audio), Supabase (Postgres, Realtime, Storage), Groq Whisper large-v3, Gemini Flash. Translation goes through a provider chain (Bhashini → IndicTrans2 → Groq → Gemini → Google fallback). Ask-the-lecture uses Gemini embeddings + pgvector.
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

## Docker

One image works for any Supabase project: keys are read when the container starts, never baked into the image (`.env*` is excluded from the build).

```bash
docker compose up --build -d          # builds and starts on http://localhost:3000
docker compose logs -f                # watch it
docker compose down                   # stop
```

Or without compose: `docker build -t classcaption .` then `docker run -p 3000:3000 --env-file .env.local classcaption`.

**Published image** (Windows/Intel and Apple Silicon Macs): [`sarthak914/classcaption`](https://hub.docker.com/r/sarthak914/classcaption). No build needed, just a `.env.local` with your own keys (see `.env.example`):

```bash
docker run -p 3000:3000 --env-file .env.local sarthak914/classcaption
```

- **Join QR code:** inside Docker the app can't see the laptop's Wi-Fi address, so add `PUBLIC_BASE_URL=http://<laptop-wifi-ip>:3000` to `.env.local` (find the IP with `ipconfig`).
- **Teacher mic:** open the teacher page at `http://localhost:3000` on the laptop running Docker; browsers only allow the microphone on localhost or https.
- **Publish to Docker Hub:** `docker login`, then `docker buildx build --platform linux/amd64,linux/arm64 -t <your-user>/classcaption:latest --push .` (both PC and Apple Silicon). Anyone can then run it with their own `.env.local`. The image holds no keys.
- **Mac: creating `.env.local`:** TextEdit saves it as `.env.local.txt`. In Terminal run `nano .env.local`, paste, then Ctrl+O, Enter, Ctrl+X (or rename with `mv .env.local.txt .env.local`).

## Translation providers

`TRANSLATION_PROVIDERS` sets the order (code default `bhashini,groq,gemini,google`; `.env.example` uses `groq,gemini,google`). A provider is skipped when its keys are missing, and each one falls back to the next on error or timeout, so captions keep flowing even if a free-tier rate limit is hit. The code is in `src/lib/translate/`.

- **Bhashini** (MeitY): set `BHASHINI_USER_ID` and `BHASHINI_API_KEY` (from bhashini.gov.in → ULCA profile) and make sure `bhashini` is in `TRANSLATION_PROVIDERS`. Check the keys with `node --env-file=.env.local scripts/check-env.mjs`, which does a real English → Hindi translation.
- **IndicTrans2** (AI4Bharat, open source, no API key): runs on your own machine from [`indictrans2/`](indictrans2/server.py).
  ```bash
  cd indictrans2
  pip install -r requirements.txt     # torch, transformers (IndicTransToolkit optional, needs a C++ compiler)
  python server.py                    # http://localhost:7860, downloads ~1 GB of models on first start
  ```
  - **Gated models:** the AI4Bharat models need a Hugging Face login. Click "Agree and access repository" on both [indictrans2-en-indic-dist-200M](https://huggingface.co/ai4bharat/indictrans2-en-indic-dist-200M) and [indictrans2-indic-en-dist-200M](https://huggingface.co/ai4bharat/indictrans2-indic-en-dist-200M), create a Read token at huggingface.co/settings/tokens, and set it as `HF_TOKEN` (e.g. `setx HF_TOKEN "hf_..."` on Windows, then open a new terminal) or run `huggingface-cli login`. Without it the server stops with "gated repo … 401".
  - **Restarting:** once the models are downloaded, start with `HF_HUB_OFFLINE=1` (PowerShell: `$env:HF_HUB_OFFLINE='1'; python server.py`) so startup never touches the network.

  Or with Docker: `docker compose --profile indictrans2 up --build -d`. Then set `INDICTRANS2_URL=http://localhost:7860` (`http://indictrans2:7860` inside compose). The distilled 200M models are used by default (laptop CPU); set `INDICTRANS2_SIZE=1B` on a GPU.
  - **Automatic routing:** once `INDICTRANS2_URL` is set, every English caption is checked (`src/lib/translate/hinglish.ts`). **Pure English goes to IndicTrans2**, and **Hinglish** (romanised Hindi words like "hai", "kya", "mein", or any Devanagari) and lines with formulas or code (`O(n log n)`, `x^2`, `a[i]`) **go to Groq** and the rest of `TRANSLATION_PROVIDERS`, because the LLMs fix Hinglish and speech mistakes and IndicTrans2 doesn't. If IndicTrans2 fails, the chain carries on as usual. Set `INDICTRANS2_ROUTING=off` to use `TRANSLATION_PROVIDERS` exactly as written.

## Ask the lecture (RAG)

Questions on a recorded lecture are answered with retrieval: the transcript is split into passages of a few lines, embedded with Gemini (`gemini-embedding-001`, 768 dimensions, multilingual so a Hindi question finds English lines) and stored in pgvector (`segment_chunks`) the first time someone asks. Each question is embedded, `match_segment_chunks()` returns the 6 closest passages, and only those lines go to the LLM, which cites timestamps. Run the **v5** part of `supabase/schema.sql` to enable it; without it (or with `ASK_RETRIEVAL=off`) the whole transcript is sent as before. Each answer says which method was used, and `/api/health` shows `ask_retrieval`.

## In class

- **Screen stays on:** the teacher and student live pages hold a screen wake lock. Over plain `http://<laptop IP>` phones don't offer the Wake Lock API, so a tiny muted video keeps the screen on instead; it starts on the first tap.
- **Typed captions:** the teacher can type a line under "Teacher audio" (noisy room, mic trouble, a formula). It is translated and sent to every student like speech.
- **QR join:** phones scan the projector QR with their own camera app. The in-page scanner on `/join` works on Chrome/Edge (BarcodeDetector) and on iPhone Safari and Firefox (jsQR), wherever the page is on https or localhost.

## Layout

```
supabase/schema.sql          tables, RLS, realtime, storage bucket
src/lib/translate/           swappable translators (bhashini.ts, indictrans2.ts, index.ts)
src/lib/rag.ts               Ask the lecture: chunking, pgvector search
indictrans2/server.py        self-hosted IndicTrans2 translation server
src/lib/ai/                  gemini.ts, groq.ts, lecture.ts (notes, ask, explain prompts)
src/lib/classes.ts           live class helpers
src/lib/lectures.ts          recorded pipeline, live→lecture, subtitles
src/app/api/**               route handlers (see API_CONTRACT.md)
scripts/demo.mjs             end-to-end API test
scripts/listen.mjs           Realtime listener (acts as a student phone)
scripts/board.mjs            board capture test: node scripts/board.mjs photo.jpg hi http://127.0.0.1:4000
```

## Accounts and joining

- **Student accounts (optional):** students can create an account at `/student/login` (name, email, password, roll number). Classrooms they join with a PIN are saved to the account, so their dashboard shows every classroom and past lecture on any device they sign in on. Joining without an account still works, as a pass on that one device; creating an account later moves those classrooms in.

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
