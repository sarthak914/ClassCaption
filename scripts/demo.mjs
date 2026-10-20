#!/usr/bin/env node
// End-to-end test of the ClassCaption API, no frontend needed.
//   node scripts/demo.mjs                                  # against http://localhost:3000
//   node scripts/demo.mjs http://127.0.0.1:4000            # the classroom laptop
//   node scripts/demo.mjs http://127.0.0.1:4000 lecture.mp4   # also runs the recorded pipeline on a video or audio file
//
// It signs up a throwaway teacher (or signs in with DEMO_TEACHER_EMAIL / DEMO_TEACHER_PASSWORD),
// creates a classroom, and joins it as a student with the PIN, like a phone would.
// It also checks that strangers and students are refused where they should be.
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const FILE = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A tiny cookie jar per actor, so the teacher and the student each keep their own session. */
function actor(name) {
  const jar = new Map();
  async function call(method, path, body, { timeoutMs = 120000, expect } = {}) {
    const t0 = Date.now();
    process.stdout.write(`… ${name}: ${method} ${path}\r`);
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      console.error(`✗ ${method} ${path} → ${e.name === "TimeoutError" ? `no answer after ${timeoutMs / 1000}s` : e.message}`);
      console.error(`  Is the server running at ${BASE}? Check the terminal where you ran "npm start" for errors.`);
      process.exit(1);
    }
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      const v = kv.slice(i + 1);
      if (v) jar.set(kv.slice(0, i), v);
      else jar.delete(kv.slice(0, i));
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    const ms = Date.now() - t0;
    if (expect) {
      const okay = expect.includes(res.status);
      console.log(`${okay ? "✓" : "✗"} ${name}: ${method} ${path} refused with ${res.status} (${okay ? "as expected" : `expected ${expect.join("/")}`})`);
      if (!okay) throw new Error(`${method} ${path} should have been refused`);
      return data;
    }
    if (!res.ok) {
      console.error(`✗ ${name}: ${method} ${path} → ${res.status} (${ms} ms)`, data);
      throw new Error(`${method} ${path} failed`);
    }
    console.log(`✓ ${name}: ${method} ${path} (${ms} ms)`);
    return data;
  }
  return { call, jar };
}
const teacher = actor("teacher");
const student = actor("student");
const stranger = actor("stranger");
const call = teacher.call;
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

// 1. Accounts and joining
console.log("\n— ACCOUNTS —");
const email = process.env.DEMO_TEACHER_EMAIL || `demo+${Date.now()}@classcaption.test`;
const password = process.env.DEMO_TEACHER_PASSWORD || `demo-${Math.random().toString(36).slice(2)}-pass`;
if (process.env.DEMO_TEACHER_EMAIL) await call("POST", "/api/auth/login", { email, password });
else await call("POST", "/api/auth/signup", { name: "Demo Teacher", email, password, institution: "ClassCaption test" });
const { classroom } = await call("POST", "/api/classrooms", { name: "Data Structures (API test)", subject_code: "TEST101", default_source_language: "en-IN" });
show("classroom PIN", classroom.join_code);

console.log("\n— LIVE MODE —");
const { class: cls } = await call("POST", "/api/class/start", { classroomId: classroom.id, title: "Binary Search" });
show("class id", cls.id);

const joined = await student.call("POST", "/api/class/join", { pin: classroom.join_code, name: "Asha", lang: "ta" });
show("student joined; live class", joined.live_class?.id === cls.id ? "found" : "MISSING");

console.log("\n— PERMISSION CHECKS —");
await stranger.call("GET", `/api/class/${cls.id}`, null, { expect: [401] });
await stranger.call("POST", "/api/class/join", { pin: "ZZZZZZ", name: "Guess", lang: "hi" }, { expect: [404] });
await stranger.call("GET", "/api/classrooms", null, { expect: [401] });
await student.call("POST", "/api/captions", { classId: cls.id, text: "fake caption" }, { expect: [401] });
await student.call("POST", `/api/class/${cls.id}/announce`, { text: "fake" }, { expect: [401] });
await student.call("POST", `/api/class/${cls.id}/end`, null, { expect: [401] });
await student.call("GET", `/api/class/${cls.id}/stats`, null, { expect: [401] });
await call("POST", `/api/class/${cls.id}/react`, { kind: "lost" }, { expect: [403] });

const sentences = [
  "Good morning everyone, today we will study binary search.",
  "Binary search works only on a sorted array.",
  "Har step mein hum array ko half kar dete hain, so the time complexity is O of log n.",
  "We compare the target with the middle element and discard one half.",
];
let seq = 0;
for (const text of sentences) {
  const r = await call("POST", "/api/captions", { classId: cls.id, text, seq: seq++ });
  show(`  [${r.provider}, ${r.latency_ms} ms] ta`, r.caption.translations.ta ?? "(not translated)");
  if (r.translateError) show("translateError", r.translateError);
  await sleep(1200);
}

await student.call("POST", `/api/class/${cls.id}/react`, { kind: "lost", captionSeq: 2 });
await student.call("POST", `/api/class/${cls.id}/react`, { kind: "lost", captionSeq: 2 }, { expect: [429] });
const q = await student.call("POST", `/api/class/${cls.id}/react`, {
  kind: "question", text: "सर, log n कैसे आया?", lang: "hi", captionSeq: 2,
});
show("question for teacher (translated)", q.reaction.text_en);

console.log("\n— MODERATION —");
await student.call("POST", `/api/class/${cls.id}/react`, { kind: "speak", text: "f.u.c.k this class", lang: "en" }, { expect: [422] });
await student.call("POST", `/api/class/${cls.id}/react`, { kind: "question", text: "sir ye chutiyapa kya hai", lang: "hi" }, { expect: [422] });
await stranger.call("POST", "/api/class/join", { pin: classroom.join_code, name: "B$DK", lang: "en" }, { expect: [422] });
await call("POST", `/api/class/${cls.id}/announce`, { text: "Quiz on Friday" });

const stats = await call("GET", `/api/class/${cls.id}/stats`);
show("teacher stats", { lost_recent: stats.lost_recent, wpm: stats.wpm, pace: stats.pace, languages: stats.languages, from: stats.questions[0]?.student_name, blocked: stats.blocked?.count });

const late = await student.call("GET", `/api/class/${cls.id}?lang=mr`);
show("late joiner in Marathi, first caption", late.captions[0]?.display);
show("latest announcement", late.events?.announcement?.payload?.translations?.mr ?? late.events?.announcement?.payload?.text);

try {
  const exp = await student.call("POST", "/api/explain", { term: "time complexity", context: sentences[2], lang: "hi" });
  show("tap-to-explain", exp);
} catch { /* error already printed; keep going */ }

const { lectureId } = await call("POST", `/api/class/${cls.id}/end`);
show("saved as lecture", lectureId);
await stranger.call("GET", `/api/lectures/${lectureId}`, null, { expect: [401] });

// 2. Live class → notes
let lec;
for (let i = 0; i < 30; i++) {
  ({ lecture: lec } = await student.call("GET", `/api/lectures/${lectureId}`));
  if (lec.status === "ready" || lec.status === "failed") break;
  await sleep(2000);
}
show("lecture status", lec.status + (lec.error ? ` (${lec.error})` : ""));
show("confusion moments", lec.confusion);
if (lec.status === "ready") {
  const notes = await student.call("GET", `/api/lectures/${lectureId}/notes?lang=hi`);
  show("Hindi notes summary", notes.notes.summary);
  const ans = await student.call("POST", `/api/lectures/${lectureId}/ask`, { question: "binary search kis type ke array par kaam karta hai?", lang: "hi" });
  show("ask the lecture", ans);
  const vtt = await student.call("GET", `/api/lectures/${lectureId}/subtitles?lang=ta`);
  show("Tamil subtitles (VTT)", vtt.split("\n").slice(0, 7).join("\n"));
}

// 3. Recorded upload (optional)
if (FILE) {
  console.log("\n— RECORDED MODE —");
  const buf = await readFile(FILE);
  const types = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".webm": "audio/webm", ".mp4": "video/mp4", ".ogg": "audio/ogg", ".mov": "video/quicktime", ".mkv": "video/x-matroska" };
  const contentType = types[extname(FILE).toLowerCase()] || "application/octet-stream";
  const created = await call("POST", "/api/lectures", { title: basename(FILE), filename: basename(FILE), contentType, classroomId: classroom.id });
  const put = await fetch(created.upload.uploadUrl, { method: "PUT", headers: { "content-type": contentType }, body: buf });
  if (!put.ok) throw new Error(`Upload failed: ${put.status} ${await put.text()}`);
  console.log(`✓ uploaded ${(buf.length / 1e6).toFixed(1)} MB to storage`);
  const id = created.lecture.id;
  const p = await call("POST", `/api/lectures/${id}/process`, {});
  show("processed", p);
  const { lecture } = await call("GET", `/api/lectures/${id}`);
  show("notes (en) summary", lecture.notes?.en?.summary);
  const vtt = await call("GET", `/api/lectures/${id}/subtitles?lang=hi`);
  show("Hindi subtitles (VTT)", vtt.split("\n").slice(0, 10).join("\n"));
}

console.log("\nAll done ✔");
