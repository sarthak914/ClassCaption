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
if (url && env.SUPABASE_SERVICE_ROLE_KEY && env.GEMINI_API_KEY) {
  await check("Ask AI search (pgvector)", async () => {
    const r = await fetch(`${url}/rest/v1/segment_chunks?select=chunk&limit=1`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }, signal: t(15000),
    });
    if (!r.ok) throw new Error("table segment_chunks not found. Run the v5 part of supabase/schema.sql (Ask AI still works, reading the whole transcript)");
    const e = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_EMBED_MODEL || "gemini-embedding-001"}:embedContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({ content: { parts: [{ text: "binary search tree" }] }, outputDimensionality: 768 }),
      signal: t(15000),
    });
    if (!e.ok) throw new Error(`Gemini embeddings ${e.status} ${(await e.text()).slice(0, 150)}`);
    return "ok";
  });
}
if (env.BHASHINI_USER_ID || env.BHASHINI_API_KEY) {
  await check("Bhashini keys", async () => {
    if (!env.BHASHINI_USER_ID || !env.BHASHINI_API_KEY) throw new Error("set both BHASHINI_USER_ID and BHASHINI_API_KEY");
    const cfg = await fetch("https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline", {
      method: "POST",
      headers: { "content-type": "application/json", userID: env.BHASHINI_USER_ID, ulcaApiKey: env.BHASHINI_API_KEY },
      body: JSON.stringify({
        pipelineTasks: [{ taskType: "translation", config: { language: { sourceLanguage: "en", targetLanguage: "hi" } } }],
        pipelineRequestConfig: { pipelineId: env.BHASHINI_PIPELINE_ID || "64392f96daac500b55c543cd" },
      }),
      signal: t(15000),
    });
    if (!cfg.ok) throw new Error(`config ${cfg.status} ${(await cfg.text()).slice(0, 150)} (check the User ID and ULCA API key)`);
    const c = await cfg.json();
    const ep = c.pipelineInferenceAPIEndPoint;
    const serviceId = c.pipelineResponseConfig?.[0]?.config?.[0]?.serviceId;
    const r = await fetch(ep.callbackUrl, {
      method: "POST",
      headers: { "content-type": "application/json", [ep.inferenceApiKey.name]: ep.inferenceApiKey.value },
      body: JSON.stringify({
        pipelineTasks: [{ taskType: "translation", config: { language: { sourceLanguage: "en", targetLanguage: "hi" }, serviceId } }],
        inputData: { input: [{ source: "The teacher explains binary search." }] },
      }),
      signal: t(15000),
    });
    if (!r.ok) throw new Error(`translate ${r.status} ${(await r.text()).slice(0, 150)}`);
    const out = (await r.json()).pipelineResponse?.[0]?.output?.[0]?.target;
    if (!out) throw new Error("no translation in the response");
    if (!(env.TRANSLATION_PROVIDERS || "bhashini").includes("bhashini")) return `ok ("${out}"), but add bhashini to TRANSLATION_PROVIDERS to use it`;
    return `ok ("${out}")`;
  });
}
if (env.INDICTRANS2_URL) {
  await check("IndicTrans2 server", async () => {
    const r = await fetch(`${env.INDICTRANS2_URL.replace(/\/+$/, "")}/translate`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(env.INDICTRANS2_API_KEY ? { authorization: `Bearer ${env.INDICTRANS2_API_KEY}` } : {}) },
      body: JSON.stringify({ texts: ["The teacher explains binary search."], src: "en", tgt: ["hi"] }),
      signal: t(120000), // the first call may still be loading the model
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 150)} (is python indictrans2/server.py running?)`);
    const d = await r.json();
    return `ok ("${d.translations.hi[0]}", ${d.ms} ms)`;
  });
}
console.log(bad ? `\n${bad} problem(s) found.` : "\nAll keys look good.");
