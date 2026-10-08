import "server-only";
import { geminiJSON } from "./gemini";
import { groqVisionJSON } from "./groq";
import { langName } from "../languages";

export type Board = {
  title: string;
  text: string; // everything written on the board, in reading order (Markdown)
  equations: { latex: string; spoken: string }[];
  diagrams: { description: string }[];
  explanation: string; // short explanation of what the board shows, in the chosen language
};

const prompt = (lang: string, context?: string) => `This is a photo of a classroom whiteboard, blackboard or projected slide from an Indian college lecture.
${context ? `Lecture context: ${context}\n` : ""}Make it accessible for a blind or deaf student.
- "text": transcribe ALL writing exactly as written, in reading order, as Markdown (keep bullet points and headings; use $...$ for inline math).
- "equations": every equation/formula as LaTeX, plus how to say it aloud in ${langName(lang)}.
- "diagrams": for each diagram, graph, table or drawing, a clear description (shapes, labels, arrows, axes, what it shows) in ${langName(lang)}.
- "explanation": 2-4 simple sentences in ${langName(lang)} explaining what the board teaches.
- "title": a short topic title.
If something is unreadable write [unclear]. Return JSON only:
{"title": "...", "text": "...", "equations": [{"latex": "...", "spoken": "..."}], "diagrams": [{"description": "..."}], "explanation": "..."}`;

/** Board capture: Gemini Vision, falling back to a Groq vision model. */
export async function readBoard(image: { mime: string; base64: string }, lang = "en", context?: string) {
  const p = prompt(lang, context);
  if (process.env.GEMINI_API_KEY) {
    try {
      const out = await geminiJSON<Board>([{ text: p }, { inline_data: { mime_type: image.mime, data: image.base64 } }], {
        timeoutMs: 45000,
        retries: 1,
      });
      return { provider: "gemini", ...out };
    } catch (e) {
      console.warn("Gemini vision failed, falling back to Groq:", (e as Error).message.slice(0, 120));
    }
  }
  return { provider: "groq", ...(await groqVisionJSON<Board>(p, image)) };
}
