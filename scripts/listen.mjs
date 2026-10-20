#!/usr/bin/env node
// Watch a live class exactly like a student phone would, over Supabase Realtime.
//   node --env-file=.env.local scripts/listen.mjs <CLASS_ID> [lang]
// The class id is in the teacher's live page URL (/teacher/live/<CLASS_ID>).
// Browsers can only read captions and class events; questions and "I'm lost" taps stay private to the teacher.
import { createClient } from "@supabase/supabase-js";

const [classId, lang = "hi"] = process.argv.slice(2);
if (!classId) { console.error("usage: node --env-file=.env.local scripts/listen.mjs <CLASS_ID> [lang]"); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, ""), key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (use --env-file=.env.local)"); process.exit(1); }

const supabase = createClient(url, key);
const cls = { id: classId };
console.log(`Listening to class ${classId} in ${lang}. Ctrl+C to stop.\n`);

supabase
  .channel(`class:${cls.id}`)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "captions", filter: `class_id=eq.${cls.id}` }, ({ new: c }) => {
    console.log(`[${c.seq}] ${c.translations?.[lang] ?? c.text}\n     ${c.text}`);
  })
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "class_events", filter: `class_id=eq.${cls.id}` }, ({ new: e }) => {
    if (e.kind === "announcement") console.log(`   📢 ${e.payload.translations?.[lang] ?? e.payload.text}`);
    else if (e.kind === "board") console.log(`   🧾 board: ${e.payload.board?.title}`);
    else if (e.kind === "ended") console.log(`\nClass ended. Lecture: ${e.payload.lecture_id}`);
  })
  .subscribe((status) => console.log(`realtime: ${status}`));
