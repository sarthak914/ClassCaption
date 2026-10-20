"use client";

/**
 * Records the teacher's mic and cuts it into phrases at natural pauses, so each clip is
 * a complete thought for Whisper (no words cut in half) and silence is never uploaded.
 *
 * A clip ends after a pause following at least `minSpeechMs` of speech, or at the first short
 * dip after `softMaxMs`, or hard at `hardMaxMs`. The pause it waits for adapts to the speaker:
 * about 650 ms for fluent speech, up to 1.2 s for someone who speaks slowly, stutters or has
 * many short gaps, so their sentences aren't chopped up. The recorder restarts for every
 * clip so each Blob is a standalone, decodable file.
 */
export type PhraseRecorderOptions = {
  onPhrase: (clip: Blob, info: { speechMs: number; durationMs: number; startedAt: number; peak: number }) => void;
  onLevel?: (level: number, speaking: boolean) => void;
  onError?: (message: string) => void;
  /** Fixed pause before cutting; leave unset to adapt to the speaker. */
  pauseMs?: number;
  minSpeechMs?: number;
  softMaxMs?: number;
  hardMaxMs?: number;
};

const TICK_MS = 50;

export class PhraseRecorder {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private buf = new Float32Array(2048);
  private mime = "";
  private paused = false;
  private stopped = false;

  // Per-clip state
  private clipStart = 0;
  private speechMs = 0;
  private quietMs = 0;
  private peak = 0;
  private noise = 0.004; // running estimate of the room's background level
  private hang = 0; // keeps "speaking" true briefly between syllables
  // Speaker rhythm (kept across clips): typical length of the short gaps inside their sentences.
  private gapAvg = 250;
  private wasSpeaking = false;

  constructor(private opts: PhraseRecorderOptions) {}

  static supported() {
    return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);
    this.newClip();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Muting drops whatever was being recorded; unmuting starts a fresh clip. */
  setPaused(paused: boolean) {
    if (this.paused === paused || this.stopped) return;
    this.paused = paused;
    if (paused) this.discardClip();
    else {
      this.ctx?.resume().catch(() => {});
      this.newClip();
    }
  }

  /** Sends what has been said so far (e.g. when the class ends), then stops. */
  stop(flush = true) {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (flush && !this.paused) this.cut();
    else this.discardClip();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
  }

  private newClip() {
    if (!this.stream || this.stopped || this.paused) return;
    const rec = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime, audioBitsPerSecond: 32000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onerror = () => this.opts.onError?.("Recorder error");
    (rec as MediaRecorder & { _chunks?: Blob[] })._chunks = chunks;
    rec.start();
    this.recorder = rec;
    this.clipStart = Date.now();
    this.speechMs = 0;
    this.quietMs = 0;
    this.peak = 0;
  }

  private discardClip() {
    const rec = this.recorder;
    this.recorder = null;
    if (rec && rec.state !== "inactive") {
      rec.ondataavailable = null;
      rec.onstop = null;
      try {
        rec.stop();
      } catch {}
    }
  }

  /** Ends the current clip, hands it to onPhrase if it had real speech, and starts the next one. */
  private cut() {
    const rec = this.recorder;
    if (!rec) return this.newClip();
    const speechMs = this.speechMs;
    const startedAt = this.clipStart;
    const durationMs = Date.now() - startedAt;
    const peak = this.peak;
    const chunks = (rec as MediaRecorder & { _chunks?: Blob[] })._chunks ?? [];
    rec.onstop = () => {
      if (speechMs >= 350) this.opts.onPhrase(new Blob(chunks, { type: rec.mimeType || this.mime || "audio/webm" }), { speechMs, durationMs, startedAt, peak });
    };
    this.recorder = null;
    try {
      rec.stop();
    } catch {}
    this.newClip(); // start immediately so nothing said in between is lost
  }

  private tick() {
    if (!this.analyser || this.paused || this.stopped) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);

    // Low floor so soft voices count; the noise-relative part keeps fans and chatter out.
    const threshold = Math.max(0.007, this.noise * 2.8);
    const loud = rms > threshold;
    if (loud) this.hang = 250;
    else this.hang = Math.max(0, this.hang - TICK_MS);
    const speaking = loud || this.hang > 0;
    // Background level: falls quickly to quiet moments, rises only slowly (so a fan or AC still
    // gets learned, but speech doesn't raise the bar).
    this.noise += (Math.min(rms, 0.05) - this.noise) * (rms < this.noise ? 0.1 : 0.002);
    this.opts.onLevel?.(Math.min(1, rms / 0.15), speaking);

    if (speaking) {
      // Learn the speaker's rhythm from the short gaps between their words.
      if (!this.wasSpeaking && this.speechMs > 0 && this.quietMs > 0 && this.quietMs < 1500) {
        this.gapAvg = this.gapAvg * 0.85 + this.quietMs * 0.15;
      }
      this.speechMs += TICK_MS;
      this.quietMs = 0;
      this.peak = Math.max(this.peak, rms);
    } else this.quietMs += TICK_MS;
    this.wasSpeaking = speaking;

    const age = Date.now() - this.clipStart;
    const pauseMs = this.opts.pauseMs ?? Math.min(1200, Math.max(650, this.gapAvg * 2.5));
    const minSpeech = this.opts.minSpeechMs ?? 1500;
    const softMax = this.opts.softMaxMs ?? 8000;
    const hardMax = this.opts.hardMaxMs ?? 12000;

    if (this.speechMs === 0 && age > 3000) {
      // Nothing said: start over so clips never carry long silences.
      this.discardClip();
      this.newClip();
    } else if (this.speechMs >= minSpeech && this.quietMs >= pauseMs) this.cut();
    else if (this.speechMs > 0 && this.speechMs < minSpeech && this.quietMs >= pauseMs + 500) this.cut(); // short remark ("okay, next slide")
    else if (age >= softMax && this.quietMs >= 150) this.cut(); // long sentence: break at a breath
    else if (age >= hardMax) this.cut();
  }
}
