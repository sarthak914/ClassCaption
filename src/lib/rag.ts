import "server-only";
import { supabaseAdmin } from "./supabase/server";
import { embed } from "./ai/embed";
import { askLecture, type Answer, type Seg } from "./ai/lecture";

/**
 * "Ask the lecture" with retrieval: the transcript is split into chunks of a few consecutive lines,
 * embedded once (Gemini) and stored in pgvector (segment_chunks). A question is embedded, the closest
 * chunks are found with match_segment_chunks(), and only those lines (with their neighbours) go to the LLM.
 * Without a Gemini key or the v5 schema, it falls back to sending the whole transcript.
 */
const CHUNK_CHARS = 700;
const TOP_K = 6;

export type Chunk = { chunk: number; start_idx: number; end_idx: number; start_s: number; text: string };

/** Consecutive lines up to ~CHUNK_CHARS each; every chunk repeats the previous chunk's last line, so no answer is cut in half. */
export function chunkSegments(segs: Seg[]): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;
  while (i < segs.length) {
    let j = i;
    let len = segs[i].text.length;
    while (j + 1 < segs.length && len + segs[j + 1].text.length + 1 <= CHUNK_CHARS) len += segs[++j].text.length + 1;
    chunks.push({
      chunk: chunks.length,
      start_idx: segs[i].idx,
      end_idx: segs[j].idx,
      start_s: segs[i].start_s,
      text: segs.slice(i, j + 1).map((s) => s.text).join(" "),
    });
    if (j + 1 >= segs.length) break;
    i = j > i ? j : j + 1; // overlap one line, but always move forward
  }
  return chunks;
}

const toVector = (v: number[]) => `[${v.join(",")}]`;

/** Embeds and stores the chunks, unless this transcript is already indexed. */
async function ensureIndex(lectureId: string, segs: Seg[]) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("segment_chunks")
    .select("end_idx")
    .eq("lecture_id", lectureId)
    .order("chunk", { ascending: false })
    .limit(1);
  if (error) throw error;
  if (data?.[0]?.end_idx === segs.at(-1)!.idx) return;

  const chunks = chunkSegments(segs);
  const vecs = await embed(chunks.map((c) => c.text), "document");
  await db.from("segment_chunks").delete().eq("lecture_id", lectureId);
  const rows = chunks.map((c, k) => ({ lecture_id: lectureId, ...c, embedding: toVector(vecs[k]) }));
  for (let k = 0; k < rows.length; k += 200) {
    const { error: insErr } = await db.from("segment_chunks").upsert(rows.slice(k, k + 200));
    if (insErr) throw insErr;
  }
}

/** The transcript lines in the closest chunks, plus one line either side, in lecture order. */
async function retrieve(lectureId: string, segs: Seg[], question: string): Promise<{ lines: Seg[]; chunks: number }> {
  await ensureIndex(lectureId, segs);
  const [q] = await embed([question], "query");
  const { data, error } = await supabaseAdmin().rpc("match_segment_chunks", {
    p_lecture: lectureId,
    p_query: toVector(q),
    p_count: TOP_K,
  });
  if (error) throw error;
  const hits = (data ?? []) as (Chunk & { similarity: number })[];
  const wanted = new Set<number>();
  for (const h of hits) for (let idx = h.start_idx - 1; idx <= h.end_idx + 1; idx++) wanted.add(idx);
  return { lines: segs.filter((s) => wanted.has(s.idx)), chunks: hits.length };
}

export type RagAnswer = Answer & { retrieval: { method: "pgvector" | "full_transcript"; chunks?: number; lines: number; note?: string } };

export async function answerFromLecture(lectureId: string, segs: Seg[], question: string, lang: string): Promise<RagAnswer> {
  if (process.env.GEMINI_API_KEY && process.env.ASK_RETRIEVAL !== "off") {
    try {
      const { lines, chunks } = await retrieve(lectureId, segs, question);
      if (lines.length) {
        const answer = await askLecture(lines, question, lang, { excerpts: true });
        return { ...answer, retrieval: { method: "pgvector", chunks, lines: lines.length } };
      }
    } catch (e) {
      // Usually: schema v5 not run yet (no segment_chunks table / vector extension), or the embed API failed.
      console.warn("Ask retrieval failed, sending the whole transcript:", (e as Error).message?.slice(0, 200));
      const answer = await askLecture(segs, question, lang);
      return { ...answer, retrieval: { method: "full_transcript", lines: segs.length, note: "retrieval unavailable" } };
    }
  }
  const answer = await askLecture(segs, question, lang);
  return { ...answer, retrieval: { method: "full_transcript", lines: segs.length } };
}

/** Call when a lecture's transcript is replaced, so the next question re-embeds it. Ignores a missing table. */
export async function dropIndex(lectureId: string) {
  await supabaseAdmin().from("segment_chunks").delete().eq("lecture_id", lectureId);
}
