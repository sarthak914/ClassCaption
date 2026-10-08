import { body, need, ok, route } from "@/lib/http";
import { explainTerm } from "@/lib/ai/lecture";

// POST /api/explain  { term, context?, lang? }  → tap-to-explain a hard word in a caption
export const POST = route(async (req: Request) => {
  const b = await body<{ term?: string; context?: string; lang?: string }>(req);
  const term = need(b.term?.trim(), "term is required");
  return ok(await explainTerm(term, b.context ?? "", b.lang ?? "en"));
});
