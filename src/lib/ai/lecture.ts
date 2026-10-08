import "server-only";
import { llmJSON } from "./llm";
import { langName } from "../languages";

export type Seg = { idx: number; start_s: number; end_s: number; text: string };

export type Notes = {
  title: string;
  summary: string[];
  key_terms: { term: string; meaning: string }[];
  quiz: { question: string; options: string[]; answer_index: number; explanation: string }[];
  timeline: { start_s: number; topic: string }[];
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function transcriptText(segs: Seg[], maxChars = 300_000) {
  const lines = segs.map((s) => `[${s.idx} @ ${s.start_s.toFixed(1)}s ${fmt(s.start_s)}] ${s.text}`);
  let out = lines.join("\n");
  if (out.length > maxChars) out = out.slice(0, maxChars) + "\n[transcript truncated]";
  return out;
}

export async function generateNotes(segs: Seg[], lang = "en"): Promise<Notes> {
  return llmJSON<Notes>(
    `You are an assistant that turns an Indian college lecture transcript into accessible revision notes.
Write everything in ${langName(lang)} (${lang}), in simple language. Keep technical terms in English in brackets after the ${langName(lang)} word when helpful.
The transcript comes from speech recognition (may be English, Hindi or Hinglish) with lines "[index @ seconds m:ss] text".

Return JSON:
{
 "title": "short lecture title",
 "summary": ["5-10 bullet points covering the lecture in order"],
 "key_terms": [{"term": "...", "meaning": "one-line simple meaning"}],   // 5-12 terms
 "quiz": [{"question": "...", "options": ["a","b","c","d"], "answer_index": 0, "explanation": "..."}],  // 5 MCQs
 "timeline": [{"start_s": 0, "topic": "..."}]   // 3-8 topic changes, start_s taken from the transcript
}

TRANSCRIPT:
${transcriptText(segs)}`,
    90000,
  );
}

export type Answer = {
  answer: string;
  found_in_lecture: boolean;
  citations: { idx: number; start_s: number; quote: string }[];
};

export async function askLecture(segs: Seg[], question: string, lang = "en"): Promise<Answer> {
  return llmJSON<Answer>(
    `A student asks a question about a lecture. Answer ONLY from the transcript below.
The question may be in any Indian language or Hinglish. Answer in ${langName(lang)} (${lang}), simply, in 2-5 sentences.
Cite the transcript lines that support the answer so the student can jump to that moment.
If the lecture does not cover it, say so briefly, set found_in_lecture=false, and give a short general hint.

Return JSON: {"answer": "...", "found_in_lecture": true, "citations": [{"idx": 12, "start_s": 84.2, "quote": "short original quote"}]}

QUESTION: ${question}

TRANSCRIPT:
${transcriptText(segs)}`,
    45000,
  );
}

export type Explanation = { term: string; translated_term: string; explanation: string; example: string };

export async function explainTerm(term: string, context: string, lang = "en"): Promise<Explanation> {
  return llmJSON<Explanation>(
    `A college student tapped a hard word in a live lecture caption. Explain it in ${langName(lang)} (${lang}) for a first-year student.
Term: "${term}"
Caption it appeared in: "${context}"
Return JSON: {"term": "the term as written", "translated_term": "the term written in ${langName(lang)} script (same as term if English)", "explanation": "1-2 simple sentences, meaning in this context", "example": "one short everyday example"}`,
    15000,
  );
}
