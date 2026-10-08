#!/usr/bin/env node
// Watch a live class exactly like a student phone would, over Supabase Realtime.
//   node --env-file=.env.local scripts/listen.mjs <JOIN_CODE> [lang]
// Also prints "I'm lost" taps and questions, like the teacher dashboard would.
import { createClient } from "@supabase/supabase-js";

const [code, lang = "hi"] = process.argv.slice(2);
if (!code) { console.error("usage: node --env-file=.env.local scripts/listen.mjs <JOIN_CODE> [lang]"); process.exit(1); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (use --env-file=.env.local)"); process.exit(1); }

const supabase = createClient(url, key);
const { data: cls, error } = await supabase.from("classes").select("*").eq("join_code", code.toUpperCase()).order("started_at", { ascending: false }).limit(1).maybeSingle();
if (error || !cls) { console.error("Class not found", error?.message ?? ""); process.exit(1); }
console.log(`Listening to "${cls.title}" (${cls.status}) in ${lang}. Ctrl+C to stop.\n`);

supabase
  .channel(`class:${cls.id}`)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "captions", filter: `class_id=eq.${cls.id}` }, ({ new: c }) => {
    console.log(`[${c.seq}] ${c.translations?.[lang] ?? c.text}\n     ${c.text}`);
  })
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions", filter: `class_id=eq.${cls.id}` }, ({ new: r }) => {
    console.log(r.kind === "lost" ? `   😕 someone is lost (caption ${r.caption_seq})` : `   ✋ question: ${r.text_en ?? r.text}`);
  })
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "classes", filter: `id=eq.${cls.id}` }, ({ new: c }) => {
    if (c.status === "ended") console.log(`\nClass ended. Lecture: ${c.lecture_id ?? "(saving…)"}`);
  })
  .subscribe((status) => console.log(`realtime: ${status}`));
