import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);

export type AudioChunk = { data: Blob; filename: string; offset_s: number };

const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|opus|flac|webm|mpga|mpeg)$/i;
const GROQ_LIMIT = 24 * 1024 * 1024; // Groq free tier: 25 MB per request
const CHUNK_S = 20 * 60; // 20 min of 32 kbps mono ≈ 4.8 MB, far under the limit

/**
 * Turns any uploaded lecture (video or audio) into Whisper-ready chunks.
 * Small audio files pass straight through. Video, or audio that is too big,
 * is converted to 16 kHz mono 32 kbps MP3 (~14 MB/hour) and split into
 * 20-minute chunks so long lectures stay under Groq's file limit.
 */
export async function toWhisperChunks(file: Blob, filename: string, mediaType?: string | null): Promise<AudioChunk[]> {
  const isAudio = (mediaType?.startsWith("audio/") ?? false) || AUDIO_EXT.test(filename);
  if (isAudio && file.size <= GROQ_LIMIT) return [{ data: file, filename, offset_s: 0 }];
  if (!ffmpegPath) throw new Error("ffmpeg is not available on this server (ffmpeg-static missing)");

  const dir = await mkdtemp(join(tmpdir(), "classcaption-"));
  try {
    const input = join(dir, "input" + (filename.match(/\.[^.]+$/)?.[0] ?? ""));
    await writeFile(input, Buffer.from(await file.arrayBuffer()));
    await run(
      ffmpegPath,
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", input,
        "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k",
        "-f", "segment", "-segment_time", String(CHUNK_S), "-reset_timestamps", "1",
        join(dir, "chunk_%03d.mp3"),
      ],
      { maxBuffer: 10 * 1024 * 1024, timeout: 10 * 60_000 },
    ).catch((e: { stderr?: string; message: string }) => {
      const msg = e.stderr?.trim() || e.message;
      throw new Error(/does not contain any stream|matches no streams/i.test(msg) ? "This file has no audio track" : `ffmpeg failed: ${msg.slice(0, 300)}`);
    });

    const names = (await readdir(dir)).filter((n) => n.startsWith("chunk_")).sort();
    if (!names.length) throw new Error("ffmpeg produced no audio. Does the video have sound?");
    return Promise.all(
      names.map(async (n, i) => ({
        data: new Blob([await readFile(join(dir, n))], { type: "audio/mpeg" }),
        filename: n,
        offset_s: i * CHUNK_S,
      })),
    );
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
