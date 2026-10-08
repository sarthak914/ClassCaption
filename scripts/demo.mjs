#!/usr/bin/env node
// End-to-end test of the ClassCaption API, no frontend needed.
//   node scripts/demo.mjs                                  # against http://localhost:3000
//   node scripts/demo.mjs https://your-app.vercel.app      # against a deployment
//   node scripts/demo.mjs http://localhost:3000 lecture.mp3   # also runs the recorded pipeline on an audio file
//
// Tip: run `node --env-file=.env.local scripts/listen.mjs <JOIN_CODE> hi` in a second terminal
// while this runs to watch captions arrive over Supabase Realtime.
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const FILE = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, path, body, timeoutMs = 120000) {
  const t0 = Date.now();
  process.stdout.write(`… ${method} ${path}\r`);
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    console.error(`✗ ${method} ${path} → ${e.name === "TimeoutError" ? `no answer after ${timeoutMs / 1000}s` : e.message}`);
    console.error(`  Is the server running at ${BASE}? Check the terminal where you ran "npm run dev" / "npm start" for errors.`);
    process.exit(1);
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  const ms = Date.now() - t0;
  if (!res.ok) {
    console.error(`✗ ${method} ${path} → ${res.status} (${ms} ms)`, data);
    throw new Error(`${method} ${path} failed`);
  }
  console.log(`✓ ${method} ${path} (${ms} ms)`);
  return data;
}
const show = (label, v) => console.log(`  ${label}:`, typeof v === "string" ? v : (JSON.stringify(v, null, 2) ?? "(none)").replace(/\n/g, "\n  "));

console.log(`\nClassCaption API test → ${BASE}\n`);

// 0. Setup check
console.log("(The first request can take up to a minute while Next.js compiles in dev mode.)");
const health = await call("GET", "/api/health");
show("health", health);
if (health.database !== "ok") {
  console.error("\nDatabase not ready. Run supabase/schema.sql in the Supabase SQL editor first.");
  process.exit(1);
}

// 1. Live class
console.log("\n— LIVE MODE —");
const { class: cls } = await call("POST", "/api/class/start", { title: "Data Structures: Binary Search", sourceLang: "en-IN" });
show("join code", cls.join_code);
show("class id", cls.id);

const joined = await call("POST", "/api/class/join", { code: cls.join_code, lang: "ta" });
show("student joined, class languages", joined.class.languages);

const sentences = [
  "Good morning everyone, today we will study binary search.",
  "Binary search works only on a sorted array.",
  "Har step mein hum array ko half kar dete hain, so the time complexity is O of log n.",
  "We compare the target with the middle element and discard one half.",
];
let seq = 0;
for (const text of sentences) {
  const r = await call("POST", "/api/captions", { classId: cls.id, text, seq: seq++ });
  show(`  [${r.provider}, ${r.latency_ms} ms] hi`, r.caption.translations.hi ?? "(not translated)");
  if (r.translateError) show("translateError", r.translateError);
  await sleep(1200);
}

await call("POST", `/api/class/${cls.id}/react`, { kind: "lost", captionSeq: 2 });
await call("POST", `/api/class/${cls.id}/react`, { kind: "lost", captionSeq: 2 });
const q = await call("POST", `/api/class/${cls.id}/react`, {
  kind: "question", text: "सर, log n कैसे आया?", lang: "hi", captionSeq: 2,
});
show("question for teacher (translated)", q.reaction.text_en);

const stats = await call("GET", `/api/class/${cls.id}/stats`);
show("teacher stats", { lost_recent: stats.lost_recent, wpm: stats.wpm, pace: stats.pace, languages: stats.languages });

const late = await call("GET", `/api/class/${cls.id}?lang=mr`);
show("late joiner in Marathi, first caption", late.captions[0]?.display);

try {
  const exp = await call("POST", "/api/explain", { term: "time complexity", context: sentences[2], lang: "hi" });
  show("tap-to-explain", exp);
} catch { /* error already printed; keep going */ }

const { lectureId } = await call("POST", `/api/class/${cls.id}/end`);
show("saved as lecture", lectureId);

// 2. Live class → notes
let lec;
for (let i = 0; i < 30; i++) {
  ({ lecture: lec } = await call("GET", `/api/lectures/${lectureId}`));
  if (lec.status === "ready" || lec.status === "failed") break;
  await sleep(2000);
}
show("lecture status", lec.status + (lec.error ? ` (${lec.error})` : ""));
show("confusion moments", lec.confusion);
if (lec.status === "ready") {
  const notes = await call("GET", `/api/lectures/${lectureId}/notes?lang=hi`);
  show("Hindi notes summary", notes.notes.summary);
  const ans = await call("POST", `/api/lectures/${lectureId}/ask`, { question: "binary search kis type ke array par kaam karta hai?", lang: "hi" });
  show("ask the lecture", ans);
  const vtt = await (await fetch(`${BASE}/api/lectures/${lectureId}/subtitles?lang=ta`)).text();
  show("Tamil subtitles (VTT)", vtt.split("\n").slice(0, 7).join("\n"));
}

// 3. Recorded upload (optional)
if (FILE) {
  console.log("\n— RECORDED MODE —");
  const buf = await readFile(FILE);
  const types = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".webm": "audio/webm", ".mp4": "video/mp4", ".ogg": "audio/ogg" };
  const contentType = types[extname(FILE).toLowerCase()] || "application/octet-stream";
  const created = await call("POST", "/api/lectures", { title: basename(FILE), filename: basename(FILE), contentType });
  const put = await fetch(created.upload.uploadUrl, { method: "PUT", headers: { "content-type": contentType }, body: buf });
  if (!put.ok) throw new Error(`Upload failed: ${put.status} ${await put.text()}`);
  console.log(`✓ uploaded ${(buf.length / 1e6).toFixed(1)} MB to storage`);
  const id = created.lecture.id;
  const p = await call("POST", `/api/lectures/${id}/process`, {});
  show("processed", p);
  const { lecture } = await call("GET", `/api/lectures/${id}`);
  show("notes (en) summary", lecture.notes?.en?.summary);
  const vtt = await (await fetch(`${BASE}/api/lectures/${id}/subtitles?lang=hi`)).text();
  show("Hindi subtitles (VTT)", vtt.split("\n").slice(0, 10).join("\n"));
}

console.log("\nAll done ✔");
