# ClassCaption API contract

Backend for the ClassCaption frontend. All endpoints are Next.js API routes under `/api`, take and return JSON, and allow cross-origin calls (CORS `*`), so the frontend can run on its own origin during development.

Errors always look like `{ "error": "message" }` with a 4xx/5xx status.

Language codes are ISO 639-1: `en hi mr bn ta te gu kn ml pa or ur`.

The browser talks to two things:

1. **These API routes** for every write and every AI call (keys stay on the server).
2. **Supabase directly**, with the anon key, only to *subscribe* to Realtime changes (tables are read-only for the browser).

---

## Live mode

### Flow

```
Teacher                                   Backend                       Students
POST /api/class/start  ─────────────────► classes row + join code
show QR → https://<frontend>/join/<code>
                                                                        POST /api/class/join {code, lang}
Web Speech final sentence
POST /api/captions {classId, text, seq} ─► translate → insert captions ─► Realtime INSERT on captions
                                                                        "I'm lost" / question
                                          reactions row ◄────────────── POST /api/class/:id/react
Realtime INSERT on reactions ◄──────────
GET /api/class/:id/stats  (every ~5 s)
POST /api/class/:id/end  ───────────────► class → lecture + AI notes ──► Realtime UPDATE on classes (lecture_id)
```

### `POST /api/class/start`
Teacher taps **Go live**.

Request: `{ "title": "DSA – Binary search", "sourceLang": "en-IN" }`. `sourceLang` is the Web Speech language: `en-IN` (English/Hinglish, default) or `hi-IN`.

Response `201`:
```json
{
  "class": { "id": "uuid", "title": "...", "join_code": "K7QX2M", "source_lang": "en-IN",
             "status": "live", "languages": [], "lecture_id": null, "started_at": "...", "ended_at": null },
  "channel": "class:uuid"
}
```
Put `join_code` in the QR code (for example `https://<frontend>/join/K7QX2M`).

### `POST /api/class/join`
Student opens the QR link and picks a language. This also registers the language, so later captions are translated into it.

Request: `{ "code": "K7QX2M", "lang": "hi" }`

Response:
```json
{ "class": { ...as above }, "lang": "hi", "channel": "class:uuid",
  "captions": [ { "id": 1, "seq": 0, "text": "original", "translations": { "hi": "..." },
                  "display": "text in the requested lang", "offset_s": 3.2, "created_at": "..." } ] }
```
`captions` holds the last 30 captions, oldest first, already translated into `lang`.

### `GET /api/class/:id?lang=hi&since=<seq>&limit=50`
Same caption shape as `join`. Use it when a student **switches language** (missing translations are filled in and cached) or to **catch up** after a reconnect (`since` = last seq seen).

### `POST /api/captions`
Teacher's browser sends one call per **final** Web Speech result. Interim results stay local, on the teacher's screen only.

Request: `{ "classId": "uuid", "text": "Binary search works on a sorted array.", "seq": 7, "offsetS": 42.5 }`

- `seq` is optional. It is a counter kept by the teacher page; the server picks the next number if it's missing.
- `offsetS` is optional (seconds since start; the server computes it if missing).
- `targets` is optional (`["hi","ta"]`). By default the server uses every language students joined with, plus Hindi.

Response `201`:
```json
{ "caption": { "id": 8, "class_id": "uuid", "seq": 7, "text": "...", "translations": { "hi": "...", "ta": "..." },
               "offset_s": 42.5, "created_at": "..." },
  "provider": "gemini", "latency_ms": 820 }
```
If every translator fails, the caption is still saved with `translations: {}` and the response includes `translateError`, so students at least see the original.

Students get the row through Realtime. Show `caption.translations[lang] ?? caption.text`, with `caption.text` small underneath.

### `POST /api/class/:id/react`
- I'm lost: `{ "kind": "lost", "captionSeq": 7 }`
- Question or "Speak for me": `{ "kind": "question", "text": "सर, log n कैसे आया?", "lang": "hi", "captionSeq": 7 }`

Response `201`: `{ "reaction": { "id", "class_id", "kind", "text", "lang", "text_en", "caption_seq", "offset_s", "created_at" } }`

`text_en` is the question translated into the class language. The teacher screen can read it aloud with `speechSynthesis.speak(new SpeechSynthesisUtterance(text_en))`.

### `GET /api/class/:id/stats?window=60`
Numbers for the confusion meter and pace coach. Poll every 3 to 5 seconds, or recompute on each Realtime event.
```json
{ "status": "live", "languages": ["hi","ta"], "captions": 42,
  "lost_recent": 4, "lost_total": 9, "window_s": 60,
  "wpm": 172, "pace": "too_fast",            // "silent" | "slow" | "good" | "too_fast"
  "questions": [ { ...reaction } ] }
```

### `POST /api/class/:id/end`
Response: `{ "classId": "uuid", "lectureId": "uuid" }`

The class becomes a recorded lecture right away. Captions become segments, and "I'm lost" taps become `lecture.confusion`. AI notes are generated in the background, and the lecture status goes `summarising` → `ready`.

### `POST /api/explain` (tap-to-explain)
Request: `{ "term": "time complexity", "context": "the caption sentence", "lang": "hi" }`

Response: `{ "term": "...", "explanation": "...", "example": "..." }`

### `POST /api/translate`
Request: `{ "texts": ["..."], "targets": ["hi","ta"], "source": "en" }`. You can also send `text` and `target` instead.

Response: `{ "provider": "gemini", "latency_ms": 700, "translations": { "hi": ["..."], "ta": ["..."] } }`

---

## Recorded mode

### Flow
1. `POST /api/lectures` creates the lecture and returns a signed upload URL.
2. The browser uploads the file **directly to Supabase Storage**. Vercel can't take bodies over 4.5 MB, so the file can't go through the API.
3. `POST /api/lectures/:id/process` runs Groq Whisper, then Gemini notes. Progress is written to the lecture row.
4. The student page reads `GET /api/lectures/:id`, `/subtitles`, `/notes` and `/ask`.

**Video or audio both work** (mp4, mov, mkv, webm, mp3, m4a, wav, ...). The server extracts the audio with ffmpeg (16 kHz mono, about 14 MB per hour) and splits it into 20-minute chunks, so long lectures stay under Groq's 25 MB per-request limit. The upload itself is capped by Supabase Storage, which allows 50 MB per file on the free plan. For a long recording, upload compressed video (720p or lower) or just the audio.

### `POST /api/lectures`
Request: `{ "title": "Lecture 5", "filename": "lec5.mp4", "contentType": "video/mp4" }`

Response `201`:
```json
{ "lecture": { "id": "uuid", "status": "uploaded", ... },
  "upload": { "bucket": "lectures", "path": "uuid/lec5.mp3", "token": "...", "uploadUrl": "https://...supabase.co/storage/v1/object/upload/sign/..." } }
```
Upload with supabase-js:
```js
await supabase.storage.from("lectures").uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
```
or with a plain `PUT`: `fetch(upload.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file })`.

### `POST /api/lectures/:id/process`
Body (optional): `{ "language": "en" }`. Pass a Whisper language hint like `"hi"`, or leave it out to auto-detect.

This call takes about 10 to 60 seconds for a short lecture (longer for videos, which need audio extraction first) and returns `{ "lectureId", "status": "ready", "segments": 120, "duration_s": 612.3, "language": "english" }`. Meanwhile the lecture row moves `transcribing (10)` → audio extracted `(25)` → each chunk transcribed `(up to 60)` → `summarising (60)` → `ready (100)`, or `failed` with `error` set. Show progress from Realtime, or poll `GET /api/lectures/:id`.

### `GET /api/lectures`
Response: `{ "lectures": [ { "id", "title", "source": "upload|live", "status", "progress", "duration_s", "created_at", "error" } ] }`

### `GET /api/lectures/:id`
```json
{ "lecture": { "id", "title", "source", "status", "progress", "duration_s", "media_type",
               "notes": { "en": { ...Notes } }, "confusion": [ { "seq", "offset_s", "count", "text" } ], "error" },
  "segments": [ { "idx": 0, "start_s": 0, "end_s": 4.2, "text": "...", "translations": { "hi": "..." } } ],
  "mediaUrl": "signed URL valid for 2 h, or null for live-class lectures" }
```

### `GET /api/lectures/:id/subtitles?lang=hi&format=vtt|json`
`vtt` (default) works directly as a track on the uploaded video: `<video src={mediaUrl}><track kind="subtitles" srclang="hi" src="/api/lectures/:id/subtitles?lang=hi" default /></video>`.

`json` returns `{ "lang", "cues": [ { "idx", "start_s", "end_s", "text", "original" } ] }`, which is good for a clickable transcript.

The first request for a language translates every segment and caches the result. Later requests are instant.

### `GET /api/lectures/:id/notes?lang=hi`
```json
{ "lang": "hi",
  "notes": { "title": "...", "summary": ["..."],
             "key_terms": [ { "term": "...", "meaning": "..." } ],
             "quiz": [ { "question": "...", "options": ["a","b","c","d"], "answer_index": 1, "explanation": "..." } ],
             "timeline": [ { "start_s": 0, "topic": "..." } ] },
  "confusion": [ { "seq": 7, "offset_s": 42.5, "count": 4, "text": "caption where the class got lost" } ] }
```
English is generated automatically. Other languages are generated on first request (about 5 to 15 s) and then cached. For audio notes, read `summary` aloud with `speechSynthesis`, setting `utterance.lang` to `hi-IN` etc.

### `POST /api/lectures/:id/ask` (Ask the lecture)
Request: `{ "question": "binary search kis array par chalta hai?", "lang": "hi" }`

Response: `{ "answer": "...", "found_in_lecture": true, "citations": [ { "idx": 3, "start_s": 84.2, "quote": "..." } ] }`

Seek the player to `citations[0].start_s`.

### `POST /api/board` (Board capture)
A photo of the whiteboard, blackboard or a slide becomes text, equations and spoken descriptions of diagrams. This is for blind and deaf students, or for anyone revising later.

Send `multipart/form-data` with the fields `image` (a file, at most 4 MB), `lang` (optional, e.g. `hi`) and `context` (optional, e.g. the lecture title). From a phone: `<input type="file" accept="image/*" capture="environment">`.

Or send JSON: `{ "imageBase64": "data:image/jpeg;base64,...", "lang": "hi" }` or `{ "imageUrl": "https://...", "lang": "hi" }`.

Response:
```json
{ "provider": "gemini", "lang": "hi", "latency_ms": 4200,
  "title": "Binary search",
  "text": "## Binary Search\n- works on sorted array\n- $T(n) = T(n/2) + 1$",
  "equations": [ { "latex": "T(n) = T(n/2) + 1 = O(\\log n)", "spoken": "T of n equals ..." } ],
  "diagrams": [ { "description": "An array of 7 boxes ... arrow points to the middle box ..." } ],
  "explanation": "..." }
```
Gemini Vision reads the image. If Gemini is busy or over quota, a Groq vision model (Llama 4) takes over. To read the result aloud, send `text`, `equations[].spoken` and `diagrams[].description` to `speechSynthesis`.

---

## Realtime (Supabase)

Browsers subscribe with the **anon** key. All tables are read-only for anon; writes go through the API.

```js
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const channel = supabase
  .channel(`class:${classId}`)
  // Students: new captions
  .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "captions", filter: `class_id=eq.${classId}` },
      ({ new: c }) => addCaption({ ...c, display: c.translations[lang] ?? c.text }))
  // Teacher: "I'm lost" taps and questions
  .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "reactions", filter: `class_id=eq.${classId}` },
      ({ new: r }) => r.kind === "lost" ? bumpLost(r) : showQuestion(r))
  // Everyone: class ended → lecture_id appears
  .on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "classes", filter: `id=eq.${classId}` },
      ({ new: c }) => c.status === "ended" && onEnded(c.lecture_id))
  .subscribe();

// Upload page: processing progress
supabase.channel(`lecture:${lectureId}`)
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lectures", filter: `id=eq.${lectureId}` },
      ({ new: l }) => setProgress(l.status, l.progress))
  .subscribe();
```

A caption that arrives before a student's language was registered may not have their translation yet. In that case show `c.text`, or call `GET /api/class/:id?lang=..&since=<seq-1>` to backfill.

---

## Teacher mic (Web Speech), reference snippet

Chrome or Edge only. Keep the tab in front. A wake lock stops the screen from sleeping.

```js
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const rec = new SR();
rec.lang = cls.source_lang;        // "en-IN" handles Hinglish reasonably
rec.continuous = true;
rec.interimResults = true;
let seq = 0, live = true;
const t0 = Date.parse(cls.started_at);
const queue = [];                  // send in order, retry if the network blips
async function flush() {
  while (queue.length) {
    try {
      await fetch("/api/captions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(queue[0]) });
      queue.shift();
    } catch { await new Promise(r => setTimeout(r, 1000)); }
  }
}
rec.onresult = (e) => {
  for (let i = e.resultIndex; i < e.results.length; i++) {
    const r = e.results[i];
    if (r.isFinal) {
      queue.push({ classId: cls.id, text: r[0].transcript.trim(), seq: seq++, offsetS: (Date.now() - t0) / 1000 });
      if (queue.length === 1) flush();
    } else showInterim(r[0].transcript);
  }
};
rec.onend = () => live && rec.start();       // Chrome stops after silence, so restart
rec.start();
navigator.wakeLock?.request("screen");
```

Keep a "type a caption" text box on the teacher page that posts to `/api/captions` too. It's a demo backup if the mic or the room is a problem.

---

## Health

`GET /api/health` reports which keys are set and whether the tables and bucket exist. It never returns secret values.
