import "server-only";
import { geminiJSON } from "./gemini";
import { groqJSON } from "./groq";

/** JSON from Gemini, falling back to Groq when Gemini is overloaded or failing. */
export async function llmJSON<T>(prompt: string, timeoutMs = 60000): Promise<T> {
  let geminiError: unknown;
  if (process.env.GEMINI_API_KEY) {
    try {
      return await geminiJSON<T>(prompt, { timeoutMs });
    } catch (e) {
      geminiError = e;
      console.warn("Gemini failed, falling back to Groq:", (e as Error).message.slice(0, 120));
    }
  }
  if (process.env.GROQ_API_KEY) return groqJSON<T>(prompt, timeoutMs);
  throw geminiError ?? new Error("No GEMINI_API_KEY or GROQ_API_KEY set");
}
