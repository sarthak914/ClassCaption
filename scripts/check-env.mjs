#!/usr/bin/env node
// Checks your keys WITHOUT starting the server.
//   node --env-file=.env.local scripts/check-env.mjs
const env = process.env;
const t = (ms) => AbortSignal.timeout(ms);
let bad = 0;
const pass = (m) => console.log(`✓ ${m}`);
const failMsg = (m) => { bad++; console.log(`✗ ${m}`); };

async function check(name, fn) {
  try { pass(`${name}: ${await fn()}`); } catch (e) { failMsg(`${name}: ${e.name === "TimeoutError" ? "no answer in 15s (network/firewall?)" : e.message}`); }
}

console.log("\nClassCaption key check\n");
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "GROQ_API_KEY"]) {
  const v = env[k];
  if (!v) failMsg(`${k} is missing from .env.local`);
  else if (v !== v.trim() || /^["']/.test(v)) failMsg(`${k} has spaces or quotes around it; remove them`);
}
const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
if (url && !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) failMsg(`NEXT_PUBLIC_SUPABASE_URL should look like https://abcd1234.supabase.co (got "${url}")`);

if (url && env.SUPABASE_SERVICE_ROLE_KEY) {
  await check("Supabase tables", async () => {
    const r = await fetch(`${url}/rest/v1/classes?select=id&limit=1`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }, signal: t(15000),
    });
    if (r.status === 404 || r.status === 400) throw new Error(`table "classes" not found. Run supabase/schema.sql in the SQL Editor (${r.status})`);
    if (r.status === 401) throw new Error("key rejected (401). Use the service_role / secret key for SUPABASE_SERVICE_ROLE_KEY");
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 150)}`);
    return "ok";
  });
}
if (env.GEMINI_API_KEY) {
  await check("Gemini key", async () => {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models", { headers: { "x-goog-api-key": env.GEMINI_API_KEY }, signal: t(15000) });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 150)}`);
    return "ok";
  });
}
if (env.GROQ_API_KEY) {
  await check("Groq key", async () => {
    const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${env.GROQ_API_KEY}` }, signal: t(15000) });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 150)}`);
    return "ok";
  });
}
console.log(bad ? `\n${bad} problem(s) found.` : "\nAll keys look good.");
