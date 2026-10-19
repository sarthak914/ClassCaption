#!/usr/bin/env node
// Board capture test: send a whiteboard/slide photo and print what the API reads from it.
//   node scripts/board.mjs board.jpg [lang] [baseUrl]
//   node scripts/board.mjs board.jpg hi http://127.0.0.1:4000
// Needs a teacher account: set DEMO_TEACHER_EMAIL and DEMO_TEACHER_PASSWORD.
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

const [file, lang = "en", base = "http://localhost:3000"] = process.argv.slice(2);
if (!file) { console.error("usage: node scripts/board.mjs <image> [lang] [baseUrl]"); process.exit(1); }
const types = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const form = new FormData();
form.append("image", new Blob([await readFile(file)], { type: types[extname(file).toLowerCase()] || "image/jpeg" }), basename(file));
form.append("lang", lang);
const root = base.replace(/\/$/, "");
const login = await fetch(root + "/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.DEMO_TEACHER_EMAIL, password: process.env.DEMO_TEACHER_PASSWORD }),
});
if (!login.ok) { console.error("Sign-in failed: set DEMO_TEACHER_EMAIL and DEMO_TEACHER_PASSWORD to a teacher account", await login.text()); process.exit(1); }
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const t0 = Date.now();
const res = await fetch(root + "/api/board", { method: "POST", body: form, headers: { cookie }, signal: AbortSignal.timeout(90000) });
const data = await res.json();
console.log(`${res.ok ? "✓" : "✗"} POST /api/board → ${res.status} (${Date.now() - t0} ms)`);
console.log(JSON.stringify(data, null, 2));
