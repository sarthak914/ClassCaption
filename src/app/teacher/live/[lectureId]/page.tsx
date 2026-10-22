"use client";

import { use, useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navigation/Navbar";
import { PaceGauge } from "@/components/live/PaceGauge";
import { ConfusionMeter } from "@/components/live/ConfusionMeter";
import { createClient } from "@/lib/supabase/client";
import { api, isUuid, needsAuth, speak } from "@/lib/client/api";
import { JoinQrModal } from "@/components/join/JoinQrModal";
import { PhraseRecorder } from "@/lib/client/phraseRecorder";
import { useWakeLock } from "@/lib/client/wakeLock";
import {
  Mic,
  MicOff,
  Users,
  Clock,
  Volume2,
  Check,
  Scan,
  Share2,
  Megaphone,
  ShieldAlert,
  Keyboard,
  Send,
  Sun,
} from "lucide-react";

interface QuestionItem {
  id: string;
  studentName: string;
  seat?: string;
  kind: "question" | "speak";
  text: string;
  timeAgo: string;
  createdAt: number;
  upvotes?: number;
  resolved: boolean;
}

type ClassInfo = {
  id: string;
  title: string;
  join_code: string;
  source_lang: string;
  status: "live" | "ended";
  started_at: string;
  lecture_id: string | null;
  classroom: { id: string; name: string; subject_code: string | null; room: string | null; join_code: string } | null;
};

type Feed = { text: string; readers: number; status: string };
const FEED_LANGS = ["en", "hi", "ta", "bn"] as const;

type Reaction = {
  id: number;
  kind: "lost" | "question" | "speak";
  text: string | null;
  text_en: string | null;
  student_name: string | null;
  created_at: string;
};

function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return "Just now";
  const m = Math.round(s / 60);
  return `${m} min${m === 1 ? "" : "s"} ago`;
}

function toQuestion(r: Reaction): QuestionItem {
  const createdAt = new Date(r.created_at).getTime();
  return {
    id: String(r.id),
    studentName: r.student_name || "Anonymous Student",
    kind: r.kind === "speak" ? "speak" : "question",
    text: r.text_en || r.text || "",
    timeAgo: ago(createdAt),
    createdAt,
    upvotes: 0,
    resolved: false,
  };
}

function TeacherLiveClassroomContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ lectureId: string }>;
}) {
  const { lectureId } = use(paramsPromise);
  const router = useRouter();
  const [cls, setCls] = useState<ClassInfo | null>(null);
  const [loadError, setLoadError] = useState("");

  // Telemetry & Audio state
  const [isRecording, setIsRecording] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [micError, setMicError] = useState("");
  const [wpm, setWpm] = useState(0);
  const [confusionCount, setConfusionCount] = useState(0);
  const [lastSpike, setLastSpike] = useState<{ offset_s: number; text: string | null } | null>(null);
  const [joinedCount, setJoinedCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [provider, setProvider] = useState("");
  const [sent, setSent] = useState({ ok: 0, total: 0 });
  const [captionError, setCaptionError] = useState("");
  const [ttsQueue, setTtsQueue] = useState(0);
  const [streamed, setStreamed] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const [typedCaption, setTypedCaption] = useState("");
  const screenAwake = useWakeLock(!!cls);

  // Board capture
  const [scanning, setScanning] = useState(false);
  const boardInputRef = useRef<HTMLInputElement>(null);

  // Active Live Transcript Feeds
  const [teacherAudio, setTeacherAudio] = useState("Waiting for the teacher to speak...");

  const [feeds, setFeeds] = useState<Record<(typeof FEED_LANGS)[number], Feed>>({
    en: { text: "—", readers: 0, status: "Waiting" },
    hi: { text: "—", readers: 0, status: "Waiting" },
    ta: { text: "—", readers: 0, status: "Waiting" },
    bn: { text: "—", readers: 0, status: "Waiting" },
  });

  // Questions Queue
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [blocked, setBlocked] = useState<{ count: number; students: { name: string; count: number }[] }>({ count: 0, students: [] });

  const recognitionRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  const seqRef = useRef(0);
  const clsRef = useRef<ClassInfo | null>(null);
  const mutedRef = useRef(false);
  const endedRef = useRef(false);
  const lastInterimRef = useRef(0);
  const readersRef = useRef<Record<string, number>>({});
  const seenReactionsRef = useRef<Set<string> | null>(null);
  const lostRef = useRef(0);
  // Caption capture
  const [captureMode, setCaptureMode] = useState<"whisper" | "browser">("browser");
  const recorderRef = useRef<PhraseRecorder | null>(null);
  const whisperRef = useRef(false);
  const whisperFailsRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const recentRef = useRef<string[]>([]);
  const phraseBufRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingInterimRef = useRef("");
  const previewOffRef = useRef(false); // Chrome speech unavailable while Whisper runs: no live preview
  const autoMutedRef = useRef(false); // muted because Chrome speech failed, not by the teacher

  // Resolve the class: a real class id, or "classroom-<id>" (start one in that classroom).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!isUuid(lectureId)) {
          const classroomId = lectureId.startsWith("classroom-") ? lectureId.slice("classroom-".length) : "";
          if (!isUuid(classroomId)) throw new Error("Start a live class from your dashboard.");
          const started = await api<{ class: ClassInfo }>("/api/class/start", { json: { classroomId } });
          if (!cancelled) router.replace(`/teacher/live/${started.class.id}`);
          return;
        }
        const data = await api<{ class: ClassInfo; captions: { seq: number; text: string }[] }>(`/api/class/${lectureId}?limit=1`);
        if (cancelled) return;
        if (data.class.status === "ended") {
          router.replace(data.class.lecture_id ? `/student/lectures/${data.class.lecture_id}` : "/teacher/dashboard");
          return;
        }
        seqRef.current = (data.captions.at(-1)?.seq ?? -1) + 1;
        if (data.captions.at(-1)) setTeacherAudio(data.captions.at(-1)!.text);
        clsRef.current = data.class;
        setCls(data.class);
      } catch (err) {
        if (needsAuth(err)) return router.replace(`/teacher/login?next=${encodeURIComponent(`/teacher/live/${lectureId}`)}`);
        if (!cancelled) setLoadError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lectureId, router]);

  // Timer Tick (from the class start time)
  useEffect(() => {
    if (!cls) return;
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - new Date(cls.started_at).getTime()) / 1000)));
    tick();
    const timer = setInterval(() => {
      tick();
      setQuestions((prev) => prev.map((q) => ({ ...q, timeAgo: ago(q.createdAt) })));
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        setTtsQueue(window.speechSynthesis.pending ? 1 : 0);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [cls]);

  // Format Elapsed Time: 00:42:15
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, "0");
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  type CaptionResponse = {
    caption: { text: string; translations: Record<string, string> };
    provider: string;
    latency_ms: number;
    translateError?: string;
  };

  // Captions go out one at a time, so they always reach students in the order they were spoken.
  const enqueue = (job: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(job, job);
  };
  const captionTargets = () => [...new Set([...Object.keys(readersRef.current), ...FEED_LANGS])];

  const applyCaption = (data: CaptionResponse, via: string) => {
    recentRef.current = [...recentRef.current, data.caption.text].slice(-3);
    setTeacherAudio(data.caption.text);
    setSent((p) => ({ ok: p.ok + 1, total: p.total + 1 }));
    setLatencyMs(data.latency_ms);
    setProvider(`${via} + ${data.provider}`);
    setCaptionError(data.translateError ? "Translation failed; original text sent" : "");
    const tr = data.caption.translations ?? {};
    setFeeds((prev) => {
      const next = { ...prev };
      for (const l of FEED_LANGS) {
        next[l] = {
          ...prev[l],
          text: tr[l] || (l === "en" ? data.caption.text : prev[l].text),
          status: tr[l] ? `${data.provider} • ${data.latency_ms} ms` : prev[l].status,
        };
      }
      return next;
    });
  };

  /** Browser speech path (fallback): text recognised by Chrome. Also used for captions the teacher types. */
  const sendCaption = async (text: string, via = "Chrome speech") => {
    const c = clsRef.current;
    if (!c || endedRef.current) return;
    try {
      const data = await api<CaptionResponse>("/api/captions", {
        json: { classId: c.id, text, seq: seqRef.current++, targets: captionTargets(), context: recentRef.current },
      });
      applyCaption(data, via);
    } catch (err) {
      setSent((p) => ({ ...p, total: p.total + 1 }));
      setCaptionError((err as Error).message);
    }
  };

  /** Whisper path: one recorded phrase, transcribed and translated on the server. */
  const sendAudio = async (clip: Blob, info?: { speechMs: number; peak: number }) => {
    const c = clsRef.current;
    if (!c || endedRef.current || mutedRef.current) return;
    const form = new FormData();
    form.append("audio", clip, "phrase.webm");
    form.append("seq", String(seqRef.current++));
    form.append("targets", JSON.stringify(captionTargets()));
    form.append("context", JSON.stringify(recentRef.current));
    if (info) {
      form.append("speechMs", String(info.speechMs));
      form.append("peak", info.peak.toFixed(4));
    }
    try {
      const data = await api<CaptionResponse & { skipped?: boolean }>(`/api/class/${c.id}/transcribe`, { method: "POST", body: form });
      whisperFailsRef.current = 0;
      if (!data.skipped) applyCaption(data, "Whisper");
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 409 || endedRef.current) return;
      whisperFailsRef.current += 1;
      if (status === 501 || whisperFailsRef.current >= 3) {
        // Groq unavailable: Chrome's own speech recognition takes over the final captions.
        whisperRef.current = false;
        setCaptureMode("browser");
        recorderRef.current?.stop(false);
        recorderRef.current = null;
        setCaptionError(`Accurate (Whisper) mode stopped: ${(err as Error).message}. Using Chrome speech instead.`);
      } else setCaptionError((err as Error).message);
    }
  };

  // Chrome speech fallback: join short final fragments into one phrase so it translates with its meaning intact.
  const flushBrowserPhrase = () => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
    const text = phraseBufRef.current.trim();
    phraseBufRef.current = "";
    if (text) enqueue(() => sendCaption(text));
  };
  const addBrowserFinal = (text: string) => {
    phraseBufRef.current = `${phraseBufRef.current} ${text}`.trim();
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    if (phraseBufRef.current.split(/\s+/).length >= 25) flushBrowserPhrase();
    else flushTimerRef.current = setTimeout(flushBrowserPhrase, 700);
  };

  // Accurate capture: record the mic in phrases and transcribe with Whisper large-v3 (Groq), when the server has a key.
  useEffect(() => {
    if (!cls || typeof window === "undefined" || !window.isSecureContext || !PhraseRecorder.supported()) return;
    let cancelled = false;
    (async () => {
      try {
        const health = await api<{ env?: { groq?: boolean } }>("/api/health");
        if (cancelled || !health.env?.groq) return;
        const rec = new PhraseRecorder({
          onPhrase: (clip, info) => enqueue(() => sendAudio(clip, info)),
          onError: (m) => setCaptionError(m),
        });
        await rec.start();
        if (cancelled) return rec.stop(false);
        if (autoMutedRef.current) {
          // Chrome speech failed before Whisper was ready; Whisper has the mic, so un-mute.
          autoMutedRef.current = false;
          previewOffRef.current = true;
          mutedRef.current = false;
          setMicMuted(false);
        }
        rec.setPaused(mutedRef.current);
        recorderRef.current = rec;
        whisperRef.current = true;
        phraseBufRef.current = ""; // Whisper owns the final captions from here
        setCaptureMode("whisper");
        setMicSupported(true);
        setMicError("");
        if (!mutedRef.current) setIsRecording(true);
      } catch (err) {
        if (!cancelled) setCaptionError(`Accurate (Whisper) mode unavailable: ${(err as Error).message}. Using Chrome speech.`);
      }
    })();
    return () => {
      cancelled = true;
      whisperRef.current = false;
      recorderRef.current?.stop(false);
      recorderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls]);

  // Web Speech API Live Microphone Recognition
  useEffect(() => {
    if (!cls || typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!window.isSecureContext) {
      setMicSupported(false);
      setMicError(`Mic needs localhost: open http://127.0.0.1:${window.location.port || "4000"}${window.location.pathname}`);
      return;
    }
    if (!SpeechRecognition || (navigator as any).brave) {
      setMicSupported(false);
      setMicError("Live speech needs Google Chrome or Microsoft Edge");
      return;
    }
    let stopped = false;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = cls.source_lang || "en-IN";

    recognition.onresult = (event: any) => {
      let interimText = "";
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        else interimText += event.results[i][0].transcript;
      }
      pendingInterimRef.current = interimText;
      if (interimText) {
        setTeacherAudio(interimText);
        // Let students see the words forming before the translation lands.
        if (Date.now() - lastInterimRef.current > 400) {
          lastInterimRef.current = Date.now();
          channelRef.current?.send({ type: "broadcast", event: "interim", payload: { text: interimText } });
        }
      }
      // With Whisper on, Chrome only drives the live preview; Whisper sends the final captions.
      if (finalTranscript.trim() && !whisperRef.current) {
        setTeacherAudio(finalTranscript.trim());
        addBrowserFinal(finalTranscript.trim());
      }
    };
    let lastError = "";
    recognition.onstart = () => {
      setIsRecording(true);
      setMicError("");
    };
    recognition.onerror = (e: any) => {
      lastError = e.error;
      if (e.error === "no-speech" || e.error === "aborted") return;
      const msg: Record<string, string> = {
        "not-allowed": "Mic blocked: click the icon left of the address bar, allow Microphone, then press Unmute Mic",
        "service-not-allowed": "Speech service blocked: use Google Chrome",
        "audio-capture": "No microphone found: check Windows sound settings (Input device)",
        network: "Speech service unreachable: Chrome speech recognition needs internet",
        "language-not-supported": "Chrome can't recognise this language; live captions need the Groq key (Whisper)",
      };
      const hard = ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"].includes(e.error);
      if (whisperRef.current) {
        // Whisper has its own mic stream, so captions keep flowing; only the live word preview is lost.
        if (hard) previewOffRef.current = true;
        return;
      }
      setMicError(msg[e.error] ?? `Mic error: ${e.error}`);
      if (hard) {
        autoMutedRef.current = true;
        mutedRef.current = true;
        setMicMuted(true);
      }
    };
    // Chrome ends recognition after silence; keep it running until muted or ended.
    recognition.onend = () => {
      if (!whisperRef.current) setIsRecording(false);
      if (previewOffRef.current) return;
      // Chrome restarts recognition every minute or so; words still "in progress" never become final, so keep them.
      if (!whisperRef.current && !mutedRef.current && !endedRef.current) {
        if (pendingInterimRef.current.trim()) addBrowserFinal(pendingInterimRef.current.trim());
        flushBrowserPhrase();
      }
      pendingInterimRef.current = "";
      if (!stopped && !mutedRef.current && !endedRef.current) {
        setTimeout(() => {
          if (stopped || mutedRef.current || endedRef.current) return;
          try {
            recognition.start();
          } catch {}
        }, lastError === "network" ? 2000 : 100);
        lastError = "";
      }
    };
    recognitionRef.current = recognition;
    if (!mutedRef.current) {
      try {
        recognition.start();
      } catch {}
    }
    return () => {
      stopped = true;
      try {
        recognition.stop();
      } catch {}
    };
  }, [cls]);

  const toggleMic = () => {
    const next = !micMuted;
    mutedRef.current = next;
    autoMutedRef.current = false;
    setMicMuted(next);
    recorderRef.current?.setPaused(next);
    if (!next && whisperRef.current) setIsRecording(true);
    if (next) flushBrowserPhrase();
    const r = recognitionRef.current;
    if (!r) return;
    try {
      if (next) r.stop();
      else {
        setMicError("");
        r.start();
      }
    } catch {}
  };

  // Realtime: students' presence (joined + readers per language) and every caption (to mirror in the feeds).
  // Student reactions are private, so they come from the stats poll below, not from Realtime.
  useEffect(() => {
    if (!cls) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`class:${cls.id}`, { config: { presence: { key: `teacher-${Math.random().toString(36).slice(2)}` }, broadcast: { self: false } } })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, { role?: string; lang?: string }[]>;
        const students = Object.values(state).map((metas) => metas[0]).filter((m) => m?.role === "student");
        const readers: Record<string, number> = {};
        for (const m of students) if (m.lang) readers[m.lang] = (readers[m.lang] ?? 0) + 1;
        readersRef.current = readers;
        setJoinedCount(students.length);
        setFeeds((prev) => {
          const next = { ...prev };
          for (const l of FEED_LANGS) next[l] = { ...prev[l], readers: readers[l] ?? 0 };
          return next;
        });
      })
      // Mirror every caption (including ones sent from another device) in the feeds.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "captions", filter: `class_id=eq.${cls.id}` },
        ({ new: c }: { new: { seq: number; text: string; translations: Record<string, string> } }) => {
          seqRef.current = Math.max(seqRef.current, c.seq + 1);
          setTeacherAudio(c.text);
          setStreamed((n) => n + 1);
          const tr = c.translations ?? {};
          setFeeds((prev) => {
            const next = { ...prev };
            for (const l of FEED_LANGS) {
              const text = tr[l] || (l === "en" ? c.text : "");
              next[l] = { ...prev[l], text: text || prev[l].text, status: text ? (prev[l].status.includes("ms") ? prev[l].status : "Live") : prev[l].status };
            }
            return next;
          });
        },
      )
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") await channel.track({ role: "teacher" });
      });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [cls]);

  // Stats poll: confusion in the last minute, last spike, pace, and the question queue.
  // New "Speak for me" requests are read aloud by this laptop as soon as they arrive.
  useEffect(() => {
    if (!cls) return;
    const load = async () => {
      try {
        const st = await api<{
          lost_recent: number;
          lost_total: number;
          wpm: number;
          last_spike: { offset_s: number; text: string | null } | null;
          questions: Reaction[];
          blocked?: { count: number; students: { name: string; count: number }[] };
        }>(`/api/class/${cls.id}/stats?window=60`);
        if (st.blocked) setBlocked(st.blocked);
        setConfusionCount(st.lost_recent);
        setLastSpike(st.last_spike);
        setWpm(st.wpm);
        if (st.lost_total > lostRef.current && seenReactionsRef.current && "vibrate" in navigator) navigator.vibrate([150, 100, 150]);
        lostRef.current = st.lost_total;
        const firstLoad = !seenReactionsRef.current;
        const seen = (seenReactionsRef.current ??= new Set());
        const fresh = st.questions.filter((r) => !seen.has(String(r.id))).map(toQuestion); // newest first
        fresh.forEach((q) => seen.add(q.id));
        if (!fresh.length) return;
        setQuestions((prev) => [...fresh, ...prev]);
        if (!firstLoad) {
          for (const q of [...fresh].reverse().filter((f) => f.kind === "speak")) {
            speak(`${q.studentName === "Anonymous Student" ? "A student" : q.studentName} says: ${q.text}`, clsRef.current?.source_lang || "en-IN", 0.95);
          }
        }
      } catch (err) {
        if (needsAuth(err)) router.replace("/teacher/login");
      }
    };
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [cls, router]);

  const handleEndLecture = async () => {
    if (!cls) return;
    if (confirm("Are you sure you want to end this lecture? AI notes will be generated immediately.")) {
      try {
        endedRef.current = true;
        recorderRef.current?.stop(false);
        try {
          recognitionRef.current?.stop();
        } catch {}
        const data = await api<{ lectureId: string }>(`/api/class/${cls.id}/end`, { method: "POST" });
        router.push(`/student/lectures/${data.lectureId}`);
      } catch (err) {
        endedRef.current = false;
        alert((err as Error).message);
      }
    }
  };

  const playTTSAloud = (text: string) => speak(text, cls?.source_lang || "en-IN", 0.95);

  const markQuestionResolved = (id: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, resolved: true } : q))
    );
  };

  // Board capture: photo → text, equations, diagrams → pushed to every student's screen
  const handleBoardPhoto = async (file: File) => {
    if (!cls) return;
    setScanning(true);
    try {
      const img = await shrinkImage(file);
      const form = new FormData();
      form.append("image", img, "board.jpg");
      form.append("lang", "en");
      form.append("context", cls.classroom?.name ?? cls.title);
      form.append("classId", cls.id);
      const res = await fetch("/api/board", { method: "POST", body: form });
      const board = await res.json();
      if (!res.ok) throw new Error(board.error || "Board scan failed");
      alert(`Board sent to ${joinedCount} student${joinedCount === 1 ? "" : "s"}: ${board.title}\n\n${board.explanation}`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const announce = async () => {
    if (!cls) return;
    const msg = prompt("Announcement for students (translated into each student's language):");
    if (!msg?.trim()) return;
    try {
      await api(`/api/class/${cls.id}/announce`, { json: { text: msg.trim() } });
      alert(`Announcement sent to ${joinedCount} student${joinedCount === 1 ? "" : "s"}.`);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const unresolvedCount = questions.filter((q) => !q.resolved).length;
  const stablePct = sent.total ? Math.round((sent.ok / sent.total) * 1000) / 10 : 100;
  const spikeTopic = lastSpike?.text ? lastSpike.text.split(/\s+/).slice(0, 6).join(" ") + (lastSpike.text.split(/\s+/).length > 6 ? "..." : "") : "the current topic";

  if (loadError) {
    return (
      <div className="min-h-screen bg-paper p-8 text-center text-sm text-sindoor font-semibold">
        {loadError}{" "}
        <a href="/teacher/dashboard" className="text-neel underline">Back to dashboard</a>
      </div>
    );
  }
  if (!cls) {
    return <div className="p-8 text-center text-sm text-ink-2">Loading instructor console...</div>;
  }

  const micOk = isRecording && !micMuted;
  const micLabel = micError
    ? micError
    : !micSupported
    ? "Mic unavailable (use Chrome)"
    : micMuted
    ? "Mic muted"
    : isRecording
    ? captureMode === "whisper"
      ? "Accurate captions (Whisper)"
      : "Listening (Chrome speech)"
    : "Starting mic...";
  const readingFeeds = Object.values(feeds).reduce((n, f) => n + f.readers, 0);
  const extraLangs = Object.keys(readersRef.current).filter((l) => !(FEED_LANGS as readonly string[]).includes(l)).length;

  return (
    <div className="min-h-screen bg-paper pb-24 text-ink">
      <Navbar
        title="ClassCaption"
        subtitle="Live class"
        homeHref="/teacher/dashboard"
        showEndLecture={true}
        onEndLecture={handleEndLecture}
      />

      {cls.classroom && (
        <JoinQrModal
          isOpen={showQr}
          onClose={() => setShowQr(false)}
          classroomId={cls.classroom.id}
          classroomName={cls.classroom.name}
          pin={cls.classroom.join_code}
          onPinChange={(pin) => setCls((c) => (c && c.classroom ? { ...c, classroom: { ...c.classroom, join_code: pin } } : c))}
        />
      )}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* 1. Class header and status */}
        <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="cc-stamp text-sindoor">
                <span className="w-1.5 h-1.5 rounded-full bg-sindoor animate-live-pulse" />
                Live
              </span>
              <span className="font-mono text-sm text-ink-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-ink-3" />
                {formatTime(elapsedSeconds)}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-normal leading-tight">{cls.classroom?.name ?? cls.title}</h1>
            <p className="text-sm text-ink-3 mt-1">{cls.classroom ? cls.title : "Live Lecture"}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="cc-tag !bg-card">
              <Users className="w-3.5 h-3.5 text-neel" />
              {joinedCount} joined
              <span className="text-ink-3 font-medium">· {readingFeeds} reading</span>
            </span>
            <button onClick={() => setShowQr(true)} className="cc-tag !bg-card hover:!border-ink font-mono" title="Show the join QR code">
              PIN <span className="text-neel font-bold tracking-[0.2em]">{cls.classroom?.join_code}</span>
            </button>
            <span className={`cc-tag !bg-card ${micOk ? "" : "!border-sindoor-line !text-sindoor"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${micOk ? "bg-patta animate-pulse" : "bg-sindoor"}`} />
              {micLabel}
            </span>
            {screenAwake && (
              <span className="cc-tag !bg-card" title="This screen won't sleep during the class">
                <Sun className="w-3.5 h-3.5 text-haldi-deep" />
                Screen stays on
              </span>
            )}
          </div>
        </section>

        <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6 items-start">
          {/* Left: what the class is reading, and what it is asking */}
          <div className="space-y-6 min-w-0">
            {/* 2. The board: teacher audio and the language feeds */}
            <section className="cc-board overflow-hidden">
              <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3 border-b border-board-line">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-chalk-dim">You are saying</span>
                </div>
                <div className={`flex items-center gap-2 text-[11px] font-mono ${micOk ? "text-chalk-green" : "text-chalk-pink"}`}>
                  {micOk ? "MIC ON" : "MIC OFF"}
                  <div className={`flex items-end gap-0.5 h-3 ${micOk ? "" : "opacity-30"}`}>
                    <span className="w-1 bg-chalk-green rounded-full animate-soundwave-1" />
                    <span className="w-1 bg-chalk-green rounded-full animate-soundwave-2" />
                    <span className="w-1 bg-chalk-green rounded-full animate-soundwave-3" />
                  </div>
                </div>
              </div>
              <p className="px-5 py-5 font-heading italic text-2xl sm:text-[1.7rem] leading-snug text-chalk">
                &ldquo;{teacherAudio}&rdquo;
              </p>

              <div className="grid sm:grid-cols-2 border-t border-board-line">
                {FEED_LANGS.map((code, i) => {
                  const f = feeds[code];
                  const label = { en: ["English", "English"], hi: ["हिंदी", "Hindi"], ta: ["தமிழ்", "Tamil"], bn: ["বাংলা", "Bengali"] }[code];
                  return (
                    <div
                      key={code}
                      className={`p-4 border-board-line ${i % 2 === 0 ? "sm:border-r" : ""} ${i < 2 ? "border-b" : i === 2 ? "border-b sm:border-b-0" : ""}`}
                    >
                      <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <span className="flex items-baseline gap-2">
                          <span lang={code} className="text-sm text-chalk-blue">{label[0]}</span>
                          {code !== "en" && <span className="font-mono uppercase tracking-wider text-chalk-dim">{label[1]}</span>}
                        </span>
                        <span className="font-mono text-chalk-dim">
                          {f.readers} reading · <span className={f.status === "Live" ? "text-chalk-green" : ""}>{f.status}</span>
                        </span>
                      </div>
                      <p lang={code} className="text-[15px] text-chalk/90 leading-relaxed">{f.text}</p>
                    </div>
                  );
                })}
              </div>
              {extraLangs > 0 && (
                <p className="px-5 py-2 text-[11px] font-mono text-chalk-dim border-t border-board-line">
                  +{extraLangs} more language{extraLangs === 1 ? "" : "s"} translated for students
                </p>
              )}

              {/* Typed captions: for a noisy room, a failed mic, or a formula/term the mic can't catch */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = typedCaption.trim();
                  if (!text) return;
                  setTypedCaption("");
                  enqueue(() => sendCaption(text, "Typed"));
                }}
                className="flex gap-2 p-3 border-t border-board-line bg-black/15"
              >
                <label htmlFor="typed-caption" className="sr-only">Type a caption</label>
                <div className="flex-1 flex items-center gap-2 h-11 px-3 rounded-[10px] border border-board-line focus-within:border-chalk-blue bg-board-2">
                  <Keyboard className="w-4 h-4 text-chalk-dim flex-shrink-0" />
                  <input
                    id="typed-caption"
                    value={typedCaption}
                    onChange={(e) => setTypedCaption(e.target.value)}
                    maxLength={500}
                    autoComplete="off"
                    placeholder="Type a caption and press Enter"
                    className="flex-1 min-w-0 text-sm outline-none bg-transparent text-chalk placeholder:text-chalk-dim/70"
                  />
                </div>
                <button type="submit" disabled={!typedCaption.trim()} className="cc-btn cc-btn-haldi h-11 px-4 text-xs">
                  <Send className="w-4 h-4" />
                  Send
                </button>
              </form>
            </section>

            {/* 3. Questions and Speak for Me */}
            <section className="space-y-3">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <h2 className="text-2xl font-normal">Questions</h2>
                  <p className="text-sm text-ink-3">Typed questions and Speak for Me requests from students</p>
                </div>
                <span className="font-mono text-sm text-ink-2">{unresolvedCount} open</span>
              </div>

              {blocked.count > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-[10px] bg-sindoor-wash border border-sindoor-line text-sm text-sindoor-deep">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    <span className="font-semibold">
                      {blocked.count} inappropriate {blocked.count === 1 ? "message" : "messages"} blocked
                    </span>{" "}
                    before reaching the queue or the speaker:{" "}
                    {blocked.students.map((b) => `${b.name}${b.count > 1 ? ` (${b.count})` : ""}`).join(", ")}
                  </p>
                </div>
              )}

              {unresolvedCount === 0 && (
                <p className="rounded-card border border-dashed border-rule-strong cc-kolam text-sm text-ink-3 text-center py-6 px-4">
                  No questions yet. Student questions and Speak for Me requests appear here instantly.
                </p>
              )}
              {questions.map((q) => {
                if (q.resolved) return null;

                return (
                  <div key={q.id} className={`cc-card p-5 ${q.kind === "speak" ? "!border-neel-line border-l-4 !border-l-neel" : ""}`}>
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-paper-2 border border-rule-strong text-ink flex items-center justify-center font-heading text-sm flex-shrink-0">
                          {q.studentName.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-sm text-ink block truncate">{q.studentName}</span>
                          <span className="text-[11px] text-ink-3">
                            {q.seat ? `${q.seat} · ` : ""}
                            {q.timeAgo}
                          </span>
                        </div>
                      </div>

                      {q.kind === "speak" ? (
                        <span className="cc-stamp text-neel">
                          <Volume2 className="w-3 h-3" />
                          Speak for me
                        </span>
                      ) : (
                        <span className="cc-stamp text-ink-3">Question</span>
                      )}
                    </div>

                    <p className="font-heading text-xl leading-snug mb-4">&ldquo;{q.text}&rdquo;</p>

                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => playTTSAloud(q.text)} className="cc-btn cc-btn-primary h-10 px-4 text-xs">
                        <Volume2 className="w-4 h-4" />
                        <span>Play on classroom speakers</span>
                      </button>

                      <button onClick={() => markQuestionResolved(q.id)} className="cc-btn h-10 px-4 text-xs">
                        <Check className="w-4 h-4 text-patta" />
                        <span>Mark resolved</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          </div>

          {/* Right: controls and how the class is doing */}
          <aside className="space-y-5 min-w-0">
            {/* 4. Quick actions */}
            <section className="grid grid-cols-3 gap-2.5">
              <button
                onClick={toggleMic}
                className={`cc-btn h-20 flex-col gap-1.5 text-xs ${micMuted ? "cc-btn-sindoor" : ""}`}
              >
                {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-ink-2" />}
                <span>{micMuted ? "Unmute" : "Mute mic"}</span>
              </button>

              <input
                ref={boardInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) handleBoardPhoto(f);
                }}
              />
              <button
                onClick={() => boardInputRef.current?.click()}
                disabled={scanning}
                className="cc-btn cc-btn-primary h-20 flex-col gap-1.5 text-xs"
              >
                <Scan className={`w-5 h-5 ${scanning ? "animate-pulse" : ""}`} />
                <span>{scanning ? "Reading..." : "Scan board"}</span>
              </button>

              <button onClick={() => setShowQr(true)} className="cc-btn h-20 flex-col gap-1.5 text-xs">
                <Share2 className="w-5 h-5 text-ink-2" />
                <span>Join QR</span>
              </button>

              <button onClick={announce} className="cc-btn col-span-3 h-11 text-xs">
                <Megaphone className="w-4 h-4 text-haldi-deep" />
                <span>Send an announcement to every phone</span>
              </button>
            </section>

            {/* 5. Confusion meter */}
            <ConfusionMeter
              count={confusionCount}
              totalStudents={joinedCount}
              lastSpikeTime={lastSpike ? formatTime(Math.round(lastSpike.offset_s)).replace(/^00:/, "") : undefined}
              topic={lastSpike?.text ? spikeTopic : undefined}
            />

            {/* 6. Speaking pace */}
            <PaceGauge wpm={wpm} />

            {/* 7. Connection */}
            <section className="cc-card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="cc-eyebrow">Connection</span>
                <span className="font-mono text-xs text-patta">{stablePct}% delivered</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-ink-3">Caption delay</dt>
                  <dd className={`font-mono font-semibold ${latencyMs !== null && latencyMs > 2500 ? "text-haldi-deep" : "text-ink"}`}>
                    {latencyMs === null ? "Waiting" : `${latencyMs} ms`}
                  </dd>
                  {provider && <dd className="text-[11px] text-ink-3">{provider}</dd>}
                </div>
                <div>
                  <dt className="text-xs text-ink-3">Read-aloud queue</dt>
                  <dd className="font-semibold text-ink">{ttsQueue ? "Speaking" : "Clear"}</dd>
                </div>
              </dl>
              <p className="mt-3 pt-3 border-t border-rule text-xs text-ink-3">
                {captionError || `${streamed} caption${streamed === 1 ? "" : "s"} streamed · ${Object.keys(readersRef.current).length || 0} student language${Object.keys(readersRef.current).length === 1 ? "" : "s"} active`}
              </p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

/** Phone photos are often over the 4 MB vision limit: resize to 1600px JPEG. */
async function shrinkImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
}

export default function TeacherLiveClassroomPage({
  params,
}: {
  params: Promise<{ lectureId: string }>;
}) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-ink-2">Loading instructor console...</div>}>
      <TeacherLiveClassroomContent paramsPromise={params} />
    </Suspense>
  );
}
