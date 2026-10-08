"use client";

import { use, useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navigation/Navbar";
import { PaceGauge } from "@/components/live/PaceGauge";
import { ConfusionMeter } from "@/components/live/ConfusionMeter";
import { createClient } from "@/lib/supabase/client";
import { api, isUuid, speak } from "@/lib/client/api";
import {
  Mic,
  MicOff,
  Radio,
  Wifi,
  Users,
  Clock,
  Volume2,
  Check,
  CheckCircle2,
  Scan,
  Share2,
  Megaphone,
  HelpCircle,
  AlertTriangle,
  Play,
  Layers,
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

  const recognitionRef = useRef<any>(null);
  const channelRef = useRef<any>(null);
  const seqRef = useRef(0);
  const clsRef = useRef<ClassInfo | null>(null);
  const mutedRef = useRef(false);
  const endedRef = useRef(false);
  const lastInterimRef = useRef(0);
  const readersRef = useRef<Record<string, number>>({});

  // Resolve the class: a real class id, "classroom-<id>" (start one there), or a demo link (start a fresh one).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!isUuid(lectureId)) {
          const classroomId = lectureId.startsWith("classroom-") ? lectureId.slice("classroom-".length) : undefined;
          const started = await api<{ class: ClassInfo }>("/api/class/start", {
            json: classroomId ? { classroomId } : { title: "Live Lecture" },
          });
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

  const sendCaption = async (text: string) => {
    const c = clsRef.current;
    if (!c || endedRef.current) return;
    const seq = seqRef.current++;
    setSent((p) => ({ ...p, total: p.total + 1 }));
    try {
      const data = await api<{
        caption: { text: string; translations: Record<string, string> };
        provider: string;
        latency_ms: number;
        translateError?: string;
      }>("/api/captions", {
        json: {
          classId: c.id,
          text,
          seq,
          targets: [...new Set([...Object.keys(readersRef.current), ...FEED_LANGS])],
        },
      });
      setSent((p) => ({ ...p, ok: p.ok + 1 }));
      setLatencyMs(data.latency_ms);
      setProvider(data.provider);
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
    } catch (err) {
      setCaptionError((err as Error).message);
    }
  };

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
      if (interimText) {
        setTeacherAudio(interimText);
        // Let students see the words forming before the translation lands.
        if (Date.now() - lastInterimRef.current > 400) {
          lastInterimRef.current = Date.now();
          channelRef.current?.send({ type: "broadcast", event: "interim", payload: { text: interimText } });
        }
      }
      if (finalTranscript.trim()) {
        setTeacherAudio(finalTranscript.trim());
        sendCaption(finalTranscript.trim());
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
      };
      setMicError(msg[e.error] ?? `Mic error: ${e.error}`);
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
        mutedRef.current = true;
        setMicMuted(true);
      }
    };
    // Chrome ends recognition after silence; keep it running until muted or ended.
    recognition.onend = () => {
      setIsRecording(false);
      if (!stopped && !mutedRef.current && !endedRef.current) {
        setTimeout(() => {
          if (stopped || mutedRef.current || endedRef.current) return;
          try {
            recognition.start();
          } catch {}
        }, lastError === "network" ? 2000 : 250);
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
    setMicMuted(next);
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

  // Realtime: students' presence (joined + readers per language), "I'm lost" pings, questions, speak-for-me
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
          const tr = c.translations ?? {};
          setFeeds((prev) => {
            const next = { ...prev };
            for (const l of FEED_LANGS) next[l] = { ...prev[l], text: tr[l] || (l === "en" ? c.text : prev[l].text) };
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reactions", filter: `class_id=eq.${cls.id}` },
        ({ new: r }: { new: Reaction }) => {
          if (r.kind === "lost") {
            setConfusionCount((prev) => prev + 1);
            if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([150, 100, 150]);
            return;
          }
          const q = toQuestion(r);
          setQuestions((prev) => (prev.some((p) => p.id === q.id) ? prev : [q, ...prev]));
          // Speak for me: the teacher's device reads it aloud straight away.
          if (r.kind === "speak") speak(`${q.studentName === "Anonymous Student" ? "A student" : q.studentName} says: ${q.text}`, clsRef.current?.source_lang || "en-IN", 0.95);
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

  // Stats poll: confusion in the last minute, last spike, pace, and the question queue (catch-up after reload)
  useEffect(() => {
    if (!cls) return;
    let first = true;
    const load = async () => {
      try {
        const st = await api<{
          lost_recent: number;
          wpm: number;
          last_spike: { offset_s: number; text: string | null } | null;
          questions: Reaction[];
        }>(`/api/class/${cls.id}/stats`);
        setConfusionCount(st.lost_recent);
        setLastSpike(st.last_spike);
        setWpm(st.wpm);
        if (first) {
          first = false;
          setQuestions((prev) => {
            const have = new Set(prev.map((p) => p.id));
            return [...prev, ...st.questions.map(toQuestion).filter((q) => !have.has(q.id))];
          });
        }
      } catch {}
    };
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [cls]);

  const handleEndLecture = async () => {
    if (!cls) return;
    if (confirm("Are you sure you want to end this lecture? AI notes will be generated immediately.")) {
      try {
        endedRef.current = true;
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
      const res = await fetch("/api/board", { method: "POST", body: form });
      const board = await res.json();
      if (!res.ok) throw new Error(board.error || "Board scan failed");
      channelRef.current?.send({ type: "broadcast", event: "board", payload: board });
      alert(`Board sent to ${joinedCount} student${joinedCount === 1 ? "" : "s"}: ${board.title}\n\n${board.explanation}`);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const shareJoinLink = async () => {
    if (!cls) return;
    const pin = cls.classroom?.join_code ?? cls.join_code;
    const url = `${window.location.origin}/student/live/${cls.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
    alert(`Students join with PIN ${pin}\nor open: ${url}\n(link copied)`);
  };

  const unresolvedCount = questions.filter((q) => !q.resolved).length;
  const stablePct = sent.total ? Math.round((sent.ok / sent.total) * 1000) / 10 : 100;
  const spikeTopic = lastSpike?.text ? lastSpike.text.split(/\s+/).slice(0, 6).join(" ") + (lastSpike.text.split(/\s+/).length > 6 ? "..." : "") : "the current topic";

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-8 text-center text-sm text-[#DC2626] font-semibold">
        {loadError}{" "}
        <a href="/teacher/dashboard" className="text-[#1E3A8A] underline">Back to dashboard</a>
      </div>
    );
  }
  if (!cls) {
    return <div className="p-8 text-center text-sm text-[#475569]">Loading instructor console...</div>;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 text-[#0F172A]">
      <Navbar
        title="ClassCaption"
        subtitle="Instructor Telemetry & Live Audio"
        showEndLecture={true}
        onEndLecture={handleEndLecture}
      />

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* 1. Subheader Card with Status Metrics matching Stitch */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ECFDF5] text-[#065F46] text-xs font-extrabold border border-[#A7F3D0]">
              <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
              LIVE
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] font-heading mb-1">
            {cls.classroom?.name ?? cls.title}
          </h1>
          <p className="text-sm font-semibold text-[#475569] mb-4">
            {cls.classroom ? cls.title : "Live Lecture"}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <div className="h-10 px-3.5 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] flex items-center gap-2 text-xs font-bold font-mono text-[#0F172A]">
              <Clock className="w-4 h-4 text-[#1E3A8A]" />
              <span>{formatTime(elapsedSeconds)}</span>
            </div>

            <div className="h-10 px-3.5 rounded-xl border border-[#CBD5E1] bg-[#EFF6FF] flex items-center gap-2 text-xs font-bold text-[#1E3A8A]">
              <Users className="w-4 h-4" />
              <span>
                {joinedCount} Joined <span className="text-[#059669]">({Object.values(feeds).reduce((n, f) => n + f.readers, 0)} reading feeds)</span>
              </span>
            </div>

            <div className="h-10 px-3.5 rounded-xl border border-[#CBD5E1] bg-[#FEF3C7] flex items-center gap-2 text-xs font-bold font-mono text-[#92400E]">
              <span>PIN: {cls.classroom?.join_code ?? cls.join_code}</span>
            </div>

            <div
              className={`h-10 px-3.5 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                isRecording && !micMuted
                  ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]"
                  : "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isRecording && !micMuted ? "bg-[#059669] animate-pulse" : "bg-[#DC2626]"}`} />
              <span>
                {micError
                  ? micError
                  : !micSupported
                  ? "Mic unavailable (use Chrome)"
                  : micMuted
                  ? "Mic Muted"
                  : isRecording
                  ? "Clear Audio Signal"
                  : "Starting Mic..."}
              </span>
            </div>
          </div>
        </section>

        {/* 2. Real-Time Confusion Meter matching Stitch */}
        <ConfusionMeter
          count={confusionCount}
          totalStudents={Math.max(1, joinedCount)}
          lastSpikeTime={lastSpike ? formatTime(Math.round(lastSpike.offset_s)).replace(/^00:/, "") : "--:--"}
          topic={spikeTopic}
        />

        {/* 3. Speech Pace Coach Telemetry matching Stitch */}
        <PaceGauge wpm={wpm} />

        {/* 4. Network & Assistive Sink Card matching Stitch */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] flex items-center justify-center text-[#1E3A8A]">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                  Network &amp; Assistive Sink
                </span>
                <h3 className="text-base font-bold text-[#0F172A] font-heading">
                  {joinedCount} Connected
                </h3>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full bg-[#EFF6FF] text-[#1E40AF] text-xs font-bold border border-[#BFDBFE]">
              {stablePct}% Stable
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3 text-xs">
            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
              <span className="text-[#64748B] block mb-1">Caption Stream Latency:</span>
              <span className={`font-bold ${latencyMs !== null && latencyMs > 2500 ? "text-[#D97706]" : "text-[#059669]"}`}>
                {latencyMs === null ? "Waiting for speech" : `${latencyMs} ms`} {provider ? `(${provider})` : ""}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
              <span className="text-[#64748B] block mb-1">TTS Queue Synchrony:</span>
              <span className="font-bold text-[#1E3A8A]">{ttsQueue ? "Speaking queue" : "Synced"}</span>
            </div>
          </div>

          <div className="bg-[#F1F5F9] rounded-xl p-3 text-xs text-[#475569] flex items-center gap-2">
            <span>
              ⓘ {captionError || `${sent.ok} caption${sent.ok === 1 ? "" : "s"} streamed • ${Object.keys(readersRef.current).length || 0} student language${Object.keys(readersRef.current).length === 1 ? "" : "s"} active`}
            </span>
          </div>
        </section>

        {/* 5. Live Transcription & Multilingual Feeds matching Stitch */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#0F172A] font-heading">
                Live Transcription &amp; Multilingual Feeds
              </h3>
              <p className="text-xs text-[#64748B]">
                Continuous synchronized generation across {FEED_LANGS.length} language streams{Object.keys(readersRef.current).filter((l) => !(FEED_LANGS as readonly string[]).includes(l)).length ? ` (+${Object.keys(readersRef.current).filter((l) => !(FEED_LANGS as readonly string[]).includes(l)).length} more for students)` : ""}
              </p>
            </div>

            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border ${micMuted || !isRecording ? "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626] opacity-60" : "bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]"}`}>
              <span>Mic:</span>
              <div className="flex items-end gap-0.5 h-3">
                <span className="w-1 bg-[#059669] rounded-full animate-soundwave-1" />
                <span className="w-1 bg-[#059669] rounded-full animate-soundwave-2" />
                <span className="w-1 bg-[#059669] rounded-full animate-soundwave-3" />
              </div>
            </div>
          </div>

          {/* Teacher Audio Source Box */}
          <div className="p-4 rounded-2xl bg-[#0B0F19] text-[#F8FAFC] border border-white/10">
            <span className="px-2.5 py-1 rounded-md bg-[#1E3A8A] text-[#90A8FF] font-mono text-[11px] font-bold block w-fit mb-2">
              TEACHER AUDIO
            </span>
            <p className="text-sm font-medium leading-relaxed italic text-white">
              &ldquo;{teacherAudio}&rdquo;
            </p>
          </div>

          {/* 4 Multilingual Stream Cards matching Stitch */}
          <div className="space-y-3">
            {/* English Feed */}
            <div className="p-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-[#0F172A] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#059669]" />
                  English (Standard)
                </span>
                <span className="text-[#64748B] font-semibold">{feeds.en.readers} Readers</span>
              </div>
              <p className="text-xs text-[#334155] leading-relaxed mb-3">
                &ldquo;{feeds.en.text}&rdquo;
              </p>
              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-[11px] text-[#059669] font-semibold">
                <span>Status: {feeds.en.status}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#059669]" />
              </div>
            </div>

            {/* Hindi Feed */}
            <div className="p-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-[#0F172A] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#059669]" />
                  हिन्दी (Hindi)
                </span>
                <span className="text-[#64748B] font-semibold">{feeds.hi.readers} Readers</span>
              </div>
              <p className="text-xs text-[#334155] leading-relaxed mb-3">
                &ldquo;{feeds.hi.text}&rdquo;
              </p>
              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-[11px] text-[#059669] font-semibold">
                <span>Status: {feeds.hi.status}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#059669]" />
              </div>
            </div>

            {/* Tamil Feed */}
            <div className="p-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-[#0F172A] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#059669]" />
                  தமிழ் (Tamil)
                </span>
                <span className="text-[#64748B] font-semibold">{feeds.ta.readers} Readers</span>
              </div>
              <p className="text-xs text-[#334155] leading-relaxed mb-3">
                &ldquo;{feeds.ta.text}&rdquo;
              </p>
              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-[11px] text-[#059669] font-semibold">
                <span>Status: {feeds.ta.status}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#059669]" />
              </div>
            </div>

            {/* Bengali Feed */}
            <div className="p-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-[#0F172A] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#059669]" />
                  বাংলা (Bengali)
                </span>
                <span className="text-[#64748B] font-semibold">{feeds.bn.readers} Readers</span>
              </div>
              <p className="text-xs text-[#334155] leading-relaxed mb-3">
                &ldquo;{feeds.bn.text}&rdquo;
              </p>
              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-[11px] text-[#059669] font-semibold">
                <span>Status: {feeds.bn.status}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#059669]" />
              </div>
            </div>
          </div>
        </section>

        {/* 6. Live Questions & Assistive Audio Queue matching Stitch */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] flex items-center justify-center text-[#1E3A8A]">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F172A] font-heading">
                  Live Questions &amp; Assistive Audio Queue
                </h3>
                <p className="text-xs text-[#64748B]">
                  Assistive speech requests and prioritized anonymous student doubts
                </p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-full bg-[#EFF6FF] text-[#1E40AF] text-xs font-bold">
              {unresolvedCount} Unresolved
            </span>
          </div>

          <div className="space-y-3">
            {unresolvedCount === 0 && (
              <p className="text-xs text-[#64748B] text-center py-3">
                No questions yet. Student questions and Speak for Me requests appear here instantly.
              </p>
            )}
            {questions.map((q) => {
              if (q.resolved) return null;

              return (
                <div
                  key={q.id}
                  className={`p-5 rounded-3xl border transition ${
                    q.kind === "speak"
                      ? "border-[#1E3A8A] bg-white shadow-sm"
                      : "border-[#E2E8F0] bg-[#F8FAFC]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#1E3A8A] text-white flex items-center justify-center font-bold text-xs">
                        {q.studentName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-bold text-sm text-[#0F172A] block">
                          {q.studentName}
                        </span>
                        <span className="text-[11px] text-[#64748B]">
                          {q.seat ? `${q.seat} • ` : ""}
                          {q.timeAgo}
                        </span>
                      </div>
                    </div>

                    {q.kind === "speak" ? (
                      <span className="px-3 py-1 rounded-full bg-[#EFF6FF] text-[#1E40AF] text-xs font-bold flex items-center gap-1 border border-[#BFDBFE]">
                        <Volume2 className="w-3.5 h-3.5" />
                        Deaf Assistive TTS
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full bg-[#EFF6FF] text-[#1E40AF] text-xs font-bold">
                        Typed Question
                      </span>
                    )}
                  </div>

                  <p className="text-sm font-semibold text-[#0F172A] leading-relaxed mb-4">
                    &ldquo;{q.text}&rdquo;
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => playTTSAloud(q.text)}
                      className="h-11 px-4 rounded-xl bg-[#1E3A8A] hover:bg-[#00236F] text-white font-bold text-xs flex items-center gap-2 shadow-xs transition active:scale-95"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>Play Audio via Classroom Speakers</span>
                    </button>

                    <button
                      onClick={() => markQuestionResolved(q.id)}
                      className="h-11 px-4 rounded-xl border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[#0F172A] font-semibold text-xs flex items-center gap-1.5 transition active:scale-95"
                    >
                      <Check className="w-4 h-4 text-[#059669]" />
                      <span>Mark Resolved</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 7. Instructor Quick Action Console matching Stitch */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-3">
          <h3 className="text-base font-bold text-[#0F172A] font-heading">
            Instructor Quick Action Console
          </h3>
          <p className="text-xs text-[#64748B]">
            Immediate triggers for multi-modal accessibility during instruction
          </p>

          <div className="grid grid-cols-3 gap-2.5">
            <button
              onClick={toggleMic}
              className={`h-24 rounded-2xl flex flex-col items-center justify-center gap-2 border font-bold text-xs transition active:scale-95 ${
                micMuted
                  ? "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]"
                  : "bg-white border-[#CBD5E1] text-[#0F172A] hover:bg-[#F1F5F9]"
              }`}
            >
              {micMuted ? <MicOff className="w-6 h-6 text-[#DC2626]" /> : <Mic className="w-6 h-6 text-[#475569]" />}
              <span>{micMuted ? "Unmute Mic" : "Mute Mic"}</span>
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
              className="h-24 rounded-2xl bg-[#1E3A8A] hover:bg-[#00236F] text-white font-bold text-xs flex flex-col items-center justify-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-70"
            >
              <Scan className={`w-6 h-6 ${scanning ? "animate-pulse" : ""}`} />
              <span>{scanning ? "Reading Board..." : "Scan Board with AI"}</span>
            </button>

            <button
              onClick={shareJoinLink}
              className="h-24 rounded-2xl bg-white border border-[#CBD5E1] hover:bg-[#F1F5F9] text-[#0F172A] font-bold text-xs flex flex-col items-center justify-center gap-2 transition active:scale-95"
            >
              <Share2 className="w-6 h-6 text-[#475569]" />
              <span>Share Join Link</span>
            </button>
          </div>

          <button
            onClick={() => {
              const msg = prompt("Enter announcement for students:");
              if (msg?.trim()) {
                channelRef.current?.send({ type: "broadcast", event: "announcement", payload: { text: msg.trim(), lang: cls.source_lang } });
                alert(`Announcement broadcasted to all ${joinedCount} students.`);
              }
            }}
            className="w-full h-12 rounded-xl bg-white border border-[#CBD5E1] hover:bg-[#F1F5F9] text-[#0F172A] font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95"
          >
            <Megaphone className="w-4 h-4 text-[#D97706]" />
            <span>Broadcast Important Announcement</span>
          </button>
        </section>
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
    <Suspense fallback={<div className="p-8 text-center text-sm text-[#475569]">Loading instructor console...</div>}>
      <TeacherLiveClassroomContent paramsPromise={params} />
    </Suspense>
  );
}
