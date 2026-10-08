import "server-only";

// Bhashini (ULCA) translation. Two steps: ask the pipeline config API which
// service handles a language pair, then call the returned inference endpoint.
// Docs: https://bhashini.gitbook.io/bhashini-apis
const CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline";
const PIPELINE_ID = process.env.BHASHINI_PIPELINE_ID || "64392f96daac500b55c543cd"; // MeitY pipeline

type Cfg = { url: string; authName: string; authValue: string; serviceId: string; at: number };
const cache = new Map<string, Cfg>();

async function config(src: string, tgt: string): Promise<Cfg> {
  const k = `${src}>${tgt}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit;
  const res = await fetch(CONFIG_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      userID: process.env.BHASHINI_USER_ID!,
      ulcaApiKey: process.env.BHASHINI_API_KEY!,
    },
    body: JSON.stringify({
      pipelineTasks: [{ taskType: "translation", config: { language: { sourceLanguage: src, targetLanguage: tgt } } }],
      pipelineRequestConfig: { pipelineId: PIPELINE_ID },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Bhashini config ${res.status}`);
  const data = await res.json();
  const ep = data.pipelineInferenceAPIEndPoint;
  const cfg: Cfg = {
    url: ep.callbackUrl,
    authName: ep.inferenceApiKey.name,
    authValue: ep.inferenceApiKey.value,
    serviceId: data.pipelineResponseConfig[0].config[0].serviceId,
    at: Date.now(),
  };
  cache.set(k, cfg);
  return cfg;
}

export async function bhashiniTranslate(texts: string[], src: string, tgt: string): Promise<string[]> {
  const cfg = await config(src, tgt);
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "content-type": "application/json", [cfg.authName]: cfg.authValue },
    body: JSON.stringify({
      pipelineTasks: [
        { taskType: "translation", config: { language: { sourceLanguage: src, targetLanguage: tgt }, serviceId: cfg.serviceId } },
      ],
      inputData: { input: texts.map((source) => ({ source })) },
    }),
    signal: AbortSignal.timeout(texts.length > 5 ? 30000 : 6000),
  });
  if (!res.ok) throw new Error(`Bhashini compute ${res.status}`);
  const data = await res.json();
  const out: { target: string }[] = data.pipelineResponse[0].output;
  if (out.length !== texts.length) throw new Error("Bhashini returned wrong count");
  return out.map((o) => o.target);
}
