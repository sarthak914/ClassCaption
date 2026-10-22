"use client";

import { use, useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Brand } from "@/components/brand/Brand";
import { Navbar } from "@/components/navigation/Navbar";
import { BottomNav } from "@/components/navigation/BottomNav";
import { api, isUuid, mmss, needsAuth, pref, speak } from "@/lib/client/api";
import { PACE_LABEL, paceOf } from "@/lib/pace";
import { LANGUAGES } from "@/lib/languages";
import {
  Play,
  Pause,
  Volume2,
  Maximize2,
  Download,
  HelpCircle,
  Headphones,
  Bot,
  Mic,
  Send,
  Languages,
  ChevronRight,
  ArrowLeft,
  Share2,
} from "lucide-react";

type Lecture = {
  id: string;
  title: string;
  source: "upload" | "live";
  status: string;
  progress: number;
  duration_s: number | null;
  media_type: string | null;
  error: string | null;
  confusion: { seq: number; offset_s: number; count: number; text: string }[] | null;
  classroom: { name: string; subject_code: string | null; room: string | null } | null;
};
type Segment = { idx: number; start_s: number; end_s: number; text: string };
type Cue = { idx: number; start_s: number; end_s: number; text: string; original: string };
type Notes = {
  title: string;
  summary: string[];
  key_terms: { term: string; meaning: string }[];
  quiz: { question: string; options: string[]; answer_index: number; explanation: string }[];
  practice_questions?: { question: string; answer: string }[];
  timeline: { start_s: number; topic: string }[];
};
type Citation = { idx: number; start_s: number; quote: string };

const PLAYER_LANGS = ["en", "hi", "ta", "te", "bn"] as const;
type PlayerLang = (typeof PLAYER_LANGS)[number];

function RecordedLectureContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ id: string }>;
}) {
  const { id } = use(paramsPromise);
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams?.get("tab");
  const initialTab = tabParam === "quiz" || tabParam === "ask" || tabParam === "transcript" ? tabParam : "notes";

  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [role, setRole] = useState<"teacher" | "student">("student");
  const [cues, setCues] = useState<Cue[]>([]);
  const [notes, setNotes] = useState<Notes | null>(null);
  const [notesEn, setNotesEn] = useState<Notes | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [showCC, setShowCC] = useState(true);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [activeTab, setActiveTab] = useState<"transcript" | "notes" | "quiz" | "ask">(initialTab);
  const [selectedCaptionLang, setSelectedCaptionLang] = useState<PlayerLang>("hi");
  const [playbackSpeed, setPlaybackSpeed] = useState("1.0x");
  const [textSize, setTextSize] = useState<"sm" | "md" | "lg">("md");

  // AI Q&A State
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiChat, setAiChat] = useState<Array<{ q: string; a: string; citations?: Citation[]; via?: string }>>([]);
  const [isAsking, setIsAsking] = useState(false);

  // Audio narration TTS
  const [isNarrating, setIsNarrating] = useState(false);

  const mediaRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const clockRef = useRef<number | null>(null);

  const ready = lecture?.status === "ready";
  const totalTimeSec = Math.round(lecture?.duration_s || segments.at(-1)?.end_s || 0);
  const isVideo = !!mediaUrl && !(lecture?.media_type ?? "").startsWith("audio");

  useEffect(() => {
    const l = pref("lang", "hi");
    if ((PLAYER_LANGS as readonly string[]).includes(l)) setSelectedCaptionLang(l as PlayerLang);
  }, []);

  useEffect(() => {
    if (!isUuid(id)) setLoadError("Lecture not found.");
  }, [id]);

  // Lecture + segments; poll while it is still being transcribed / summarised.
  useEffect(() => {
    if (!isUuid(id)) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const data = await api<{ lecture: Lecture; segments: Segment[]; mediaUrl: string | null; me: { role: "teacher" | "student" } }>(`/api/lectures/${id}`);
        if (stop) return;
        setRole(data.me.role);
        if (data.lecture.id !== id) {
          router.replace(`/student/lectures/${data.lecture.id}`);
          return;
        }
        setLecture(data.lecture);
        setSegments(data.segments);
        setMediaUrl((prev) => prev ?? data.mediaUrl);
        if (data.lecture.status !== "ready" && data.lecture.status !== "failed") timer = setTimeout(load, 3000);
      } catch (err) {
        if (stop) return;
        if (needsAuth(err)) {
          setLoadError("This lecture belongs to a classroom you haven't joined yet. Sign in to your student account, or join with the class PIN.");
          return;
        }
        // A live class that is still running has no lecture yet.
        setLoadError((err as Error).message);
        timer = setTimeout(load, 4000);
      }
    };
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id, router]);

  // Subtitles in the chosen language (translated on first request, then cached)
  useEffect(() => {
    if (!lecture || segments.length === 0) return;
    api<{ cues: Cue[] }>(`/api/lectures/${lecture.id}/subtitles?lang=${selectedCaptionLang}&format=json`)
      .then((d) => setCues(d.cues))
      .catch(() => setCues(segments.map((sg) => ({ ...sg, original: sg.text }))));
  }, [lecture?.id, segments.length, selectedCaptionLang]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI notes: English plus the chosen language (bilingual summary)
  useEffect(() => {
    if (!lecture || !ready) return;
    setNotesLoading(true);
    const other = selectedCaptionLang === "en" ? "hi" : selectedCaptionLang;
    Promise.all([
      api<{ notes: Notes }>(`/api/lectures/${lecture.id}/notes?lang=en`).then((d) => setNotesEn(d.notes)),
      api<{ notes: Notes }>(`/api/lectures/${lecture.id}/notes?lang=${other}`).then((d) => setNotes(d.notes)),
    ])
      .catch(() => {})
      .finally(() => setNotesLoading(false));
  }, [lecture?.id, ready, selectedCaptionLang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live lectures have no media file: play the transcript on a clock instead.
  useEffect(() => {
    if (mediaUrl || !isPlaying) return;
    const rate = parseFloat(playbackSpeed);
    clockRef.current = window.setInterval(() => {
      setCurrentTimeSec((t) => {
        const next = t + 0.25 * rate;
        if (next >= totalTimeSec) {
          setIsPlaying(false);
          return totalTimeSec;
        }
        return next;
      });
    }, 250);
    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
    };
  }, [isPlaying, mediaUrl, playbackSpeed, totalTimeSec]);

  useEffect(() => {
    if (mediaRef.current) mediaRef.current.playbackRate = parseFloat(playbackSpeed);
  }, [playbackSpeed, mediaUrl]);

  const setIsPlayingReal = (play: boolean) => {
    const m = mediaRef.current;
    if (m) {
      if (play) m.play().catch(() => {});
      else m.pause();
    }
    if (!m && play && currentTimeSec >= totalTimeSec) setCurrentTimeSec(0);
    setIsPlaying(play);
  };

  const seek = (t: number) => {
    const clamped = Math.max(0, Math.min(totalTimeSec || t, t));
    if (mediaRef.current) mediaRef.current.currentTime = clamped;
    setCurrentTimeSec(clamped);
  };

  // Format seconds to mm:ss
  const formatTime = (secs: number) => mmss(secs);

  const currentCue = cues.find((c) => currentTimeSec >= c.start_s && currentTimeSec < c.end_s + 0.4) ?? null;
  const hotspots = (lecture?.confusion ?? []).filter((c) => c.count > 0);
  const topHotspot = [...hotspots].sort((a, b) => b.count - a.count)[0];
  const words = segments.reduce((n, sg) => n + sg.text.split(/\s+/).filter(Boolean).length, 0);
  const lectureWpm = totalTimeSec > 30 ? Math.round((words / totalTimeSec) * 60) : 0;
  const paceText = lectureWpm === 0 ? "Pace: n/a" : `${PACE_LABEL[paceOf(lectureWpm)]} pace (${lectureWpm} WPM)`;
  const langLabel = (l: string) => LANGUAGES.find((x) => x.code === l)?.native ?? l;
  const speechLocale = (l: string) => LANGUAGES.find((x) => x.code === l)?.speech ?? "en-IN";
  const subtitleSize = textSize === "sm" ? "text-xs" : textSize === "lg" ? "text-lg" : "text-sm";
  const conceptNotes = selectedCaptionLang === "en" ? notesEn : notes;

  // Quiz results are saved for signed-in student accounts (best score shows on the dashboard).
  const [quizSaved, setQuizSaved] = useState<{ best: number; total: number; attempts: number } | null>(null);
  const [quizAccount, setQuizAccount] = useState<boolean | null>(null);
  const [quizJustSaved, setQuizJustSaved] = useState(false);
  useEffect(() => {
    if (!lecture || !ready || role !== "student") return;
    api<{ attempt: { best: number; total: number; attempts: number } | null; account: boolean }>(`/api/lectures/${lecture.id}/quiz`)
      .then((d) => {
        setQuizSaved(d.attempt);
        setQuizAccount(d.account);
      })
      .catch(() => {});
  }, [lecture?.id, ready, role]); // eslint-disable-line react-hooks/exhaustive-deps
  // Each language has its own quiz, so switching language starts it fresh.
  useEffect(() => {
    setAnswers({});
    setQuizJustSaved(false);
  }, [selectedCaptionLang]);
  const quizLen = conceptNotes?.quiz.length ?? 0;
  const answeredAll = quizLen > 0 && Object.keys(answers).length === quizLen;
  useEffect(() => {
    if (!answeredAll || !lecture || role !== "student") return;
    api<{ saved: boolean; best?: number; total: number; attempts?: number }>(`/api/lectures/${lecture.id}/quiz`, {
      json: { lang: selectedCaptionLang, answers: Array.from({ length: quizLen }, (_, i) => answers[i]) },
    })
      .then((r) => {
        if (r.saved) {
          setQuizSaved({ best: r.best ?? 0, total: r.total, attempts: r.attempts ?? 1 });
          setQuizJustSaved(true);
        }
      })
      .catch(() => {});
  }, [answeredAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const playAudioNarration = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      if (isNarrating) {
        window.speechSynthesis.cancel();
        setIsNarrating(false);
        return;
      }
      const n = selectedCaptionLang === "en" ? notesEn : notes;
      if (!n) return alert("Notes are still being generated.");
      setIsNarrating(true);
      const text = [n.title, ...n.summary].join(". ");
      speak(text, speechLocale(selectedCaptionLang), 1.2, () => setIsNarrating(false));
    }
  };

  const handleAskAI = async (qText?: string) => {
    const query = qText || aiQuestion;
    if (!query.trim() || isAsking || !lecture) return;

    setIsAsking(true);
    setActiveTab("ask");
    try {
      const data = await api<{ answer: string; citations: Citation[]; retrieval?: { method: string; chunks?: number; lines: number } }>(
        `/api/lectures/${lecture.id}/ask`,
        { json: { question: query, lang: selectedCaptionLang } },
      );
      const r = data.retrieval;
      const via = r?.method === "pgvector" ? `Searched with pgvector: ${r.chunks} best-matching passages (${r.lines} lines)` : r ? `Read the whole transcript (${r.lines} lines)` : undefined;
      setAiChat((prev) => [...prev, { q: query, a: data.answer, citations: data.citations, via }]);
      setAiQuestion("");
    } catch (err) {
      setAiChat((prev) => [...prev, { q: query, a: (err as Error).message }]);
    } finally {
      setIsAsking(false);
    }
  };

  const downloadTranscript = () => {
    const lines = (cues.length ? cues : segments.map((sg) => ({ ...sg, original: sg.text }))).map((c) => `[${mmss(c.start_s)}] ${c.text}`);
    const blob = new Blob([`${lecture?.title ?? "Lecture"}\n\n${lines.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(lecture?.title ?? "lecture").replace(/[^\w-]+/g, "_")}_${selectedCaptionLang}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const shareLecture = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: lecture?.title, url });
      else {
        await navigator.clipboard.writeText(url);
        alert("Link copied");
      }
    } catch {}
  };

  const markLost = () => {
    try {
      const key = `cc_review_${lecture?.id}`;
      const marks: number[] = JSON.parse(localStorage.getItem(key) || "[]");
      localStorage.setItem(key, JSON.stringify([...marks, Math.round(currentTimeSec)]));
    } catch {}
    alert(`Bookmarked ${mmss(currentTimeSec)} on this device to revise later.`);
  };

  const tabCls = "h-11 -mb-px border-b-2 text-sm font-semibold transition";
  const tabOn = "border-sindoor text-ink";
  const tabOff = "border-transparent text-ink-3 hover:text-ink";

  if (!lecture) {
    return (
      <div className="min-h-screen bg-paper p-8 text-center text-sm text-ink-2">
        {loadError || "Loading lecture hub..."}{" "}
        {loadError &&
          (loadError.includes("PIN") ? (
            <span className="inline-flex gap-3">
              <Link href={`/student/login?next=/student/lectures/${id}`} className="text-neel underline font-bold">
                Sign in
              </Link>
              <Link href="/join" className="text-neel underline font-bold">
                Join with PIN
              </Link>
            </span>
          ) : (
            <Link href="/student" className="text-neel underline font-bold">
              Back
            </Link>
          ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper pb-32 text-ink">
      {/* Top Navbar with Back navigation matching Stitch */}
      <header className="sticky top-0 z-40 bg-paper/95 backdrop-blur-sm border-b border-rule px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={role === "teacher" ? "/teacher/dashboard" : "/student"}
              aria-label="Back"
              className="w-9 h-9 rounded-[9px] border border-rule-strong bg-card flex items-center justify-center text-ink-2 hover:bg-paper-2 transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <Brand href={role === "teacher" ? "/teacher/dashboard" : "/student"} size={32} />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedCaptionLang(selectedCaptionLang === "en" ? "hi" : "en")}
              className="h-9 px-3 flex items-center gap-1.5 rounded-[9px] bg-card text-ink font-semibold text-xs border border-rule-strong hover:bg-paper-2"
            >
              <Languages className="w-3.5 h-3.5 text-neel" />
              <span>{langLabel(selectedCaptionLang)}</span>
            </button>
            <button onClick={shareLecture} aria-label="Share" className="w-9 h-9 rounded-[9px] border border-rule-strong bg-card flex items-center justify-center text-ink-2 hover:bg-paper-2">
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* 1. Header Information matching Stitch */}
        <section className="pt-2">
          <p className="cc-eyebrow mb-2">
            {lecture.classroom?.name ?? (lecture.source === "live" ? "Live class recording" : "Uploaded recording")}
            {lecture.classroom?.room ? ` · ${lecture.classroom.room}` : ""}
          </p>

          <h1 className="text-3xl sm:text-4xl font-normal leading-tight mb-3">
            {lecture.title}
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            {ready ? (
              <span className="cc-stamp text-patta">
                Ready · {formatTime(totalTimeSec)} · {segments.length} lines
              </span>
            ) : lecture.status === "failed" ? (
              <span className="cc-stamp text-sindoor normal-case tracking-normal">
                Failed: {(lecture.error ?? "processing error").slice(0, 80)}
              </span>
            ) : (
              <span className="cc-stamp text-haldi-deep">
                <span className="w-1.5 h-1.5 rounded-full bg-haldi-deep animate-pulse" />
                {lecture.status === "summarising" ? "Writing AI notes" : "Processing"} · {lecture.progress ?? 0}%
              </span>
            )}

            <button
              onClick={downloadTranscript}
              disabled={segments.length === 0}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-neel transition"
            >
              <Download className="w-3.5 h-3.5 text-neel" />
              <span>Transcript (TXT)</span>
            </button>
          </div>
        </section>

        {/* 2. Video Player & Bilingual Caption Stage matching Stitch */}
        <section ref={stageRef} className="cc-board overflow-hidden">
          {/* Video Stage Frame */}
          <div className="relative aspect-video bg-black/60 flex flex-col justify-between p-4">
            {mediaUrl && (
              <video
                ref={mediaRef}
                src={mediaUrl}
                playsInline
                preload="metadata"
                onTimeUpdate={(e) => setCurrentTimeSec(e.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                className={`absolute inset-0 w-full h-full object-contain ${isVideo ? "" : "opacity-0"}`}
              />
            )}
            <div className="relative flex items-center justify-between">
              <span className="cc-stamp text-chalk-pink bg-board/70">
                <span className="w-1.5 h-1.5 rounded-full bg-chalk-pink" />
                Rec · {lecture.classroom?.subject_code ?? (lecture.source === "live" ? "LIVE" : "UPLOAD")}
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCC(!showCC)}
                  className={`px-2 py-0.5 rounded text-xs font-bold text-white ${showCC ? "bg-white/20" : "bg-white/5 line-through opacity-60"}`}
                >
                  CC
                </button>
                <Maximize2
                  onClick={() => {
                    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
                    else stageRef.current?.requestFullscreen().catch(() => {});
                  }}
                  className="w-4 h-4 text-white cursor-pointer"
                />
              </div>
            </div>

            {/* Central Play Button */}
            <button
              onClick={() => setIsPlayingReal(!isPlaying)}
              disabled={totalTimeSec === 0}
              className={`relative w-14 h-14 rounded-full bg-chalk text-board hover:bg-white flex items-center justify-center mx-auto shadow-lg active:scale-95 transition disabled:opacity-50 ${isPlaying && isVideo ? "opacity-0 hover:opacity-100" : ""}`}
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </button>

            {/* Bilingual Synchronized Subtitle Box matching Stitch */}
            {showCC ? (
              <div className="relative bg-board/90 rounded-[10px] p-3 border border-board-line">
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-chalk-blue mb-1 inline-block">
                  {LANGUAGES.find((l) => l.code === selectedCaptionLang)?.name} + Original
                </span>
                <p lang={selectedCaptionLang} className={`${subtitleSize} font-medium text-chalk leading-snug`}>
                  &ldquo;{currentCue?.text ?? (segments.length ? "Press play to start subtitles." : ready ? "No speech found." : "Subtitles appear once processing finishes.")}&rdquo;
                </p>
                {currentCue && currentCue.original !== currentCue.text && (
                  <p className="text-xs font-heading italic text-chalk-dim mt-1">
                    &ldquo;{currentCue.original}&rdquo;
                  </p>
                )}
              </div>
            ) : (
              <div />
            )}
          </div>

          {/* Timeline and Scrubber with Confusion Hotspots matching Stitch */}
          <div className="p-4 space-y-3 border-t border-board-line">
            <div>
              <div
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  seek(((e.clientX - r.left) / r.width) * totalTimeSec);
                }}
                className="relative w-full bg-board-2 h-2 rounded-full overflow-hidden mb-1.5 cursor-pointer"
              >
                {/* Progress bar */}
                <div className="bg-chalk-blue h-full" style={{ width: `${totalTimeSec ? Math.min(100, (currentTimeSec / totalTimeSec) * 100) : 0}%` }} />
                {/* Yellow Confusion Hotspots Markers */}
                {totalTimeSec > 0 &&
                  hotspots.map((h) => (
                    <div
                      key={h.seq}
                      title={`${h.count} lost at ${mmss(h.offset_s)}`}
                      className="absolute top-0 bottom-0 w-1.5 bg-haldi"
                      style={{ left: `${Math.min(99, (h.offset_s / totalTimeSec) * 100)}%` }}
                    />
                  ))}
              </div>

              <div className="flex items-center justify-between text-xs text-chalk-dim font-mono font-semibold">
                <span>
                  {formatTime(currentTimeSec)} / {formatTime(totalTimeSec)}
                </span>
                <span className="flex items-center gap-1 text-chalk-yellow font-sans font-semibold">
                  <span className="w-2 h-2 bg-haldi rounded-xs" />
                  &ldquo;I&apos;m lost&rdquo; moments ({hotspots.length})
                </span>
              </div>
            </div>

            {/* Playback Controls & Language Tabs */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlayingReal(!isPlaying)}
                  className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => seek(currentTimeSec - 10)}
                  className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition text-xs"
                >
                  -10s
                </button>
                <button
                  onClick={() => seek(currentTimeSec + 10)}
                  className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition text-xs"
                >
                  +10s
                </button>
                <Volume2 className="w-4 h-4 text-chalk-dim" />
              </div>

              {/* Language Pill Selector inside Player */}
              <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl">
                {(["en", "hi", "ta", "te", "bn"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setSelectedCaptionLang(l)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold transition ${
                      selectedCaptionLang === l
                        ? "bg-chalk text-board"
                        : "text-chalk-dim hover:bg-white/10"
                    }`}
                  >
                    {l === "en" ? "English" : l === "hi" ? "हिंदी" : l === "ta" ? "தமிழ்" : l === "te" ? "తెలుగు" : "বাংলা"}
                  </button>
                ))}
              </div>
            </div>

            {/* Text Size & Speed Controls matching Stitch */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
              <div className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-xl">
                <span className="text-chalk-dim font-bold">TT</span>
                <button
                  onClick={() => setTextSize("sm")}
                  className={`px-1.5 rounded ${textSize === "sm" ? "bg-white/20 text-white font-bold" : "text-chalk-dim"}`}
                >
                  A
                </button>
                <button
                  onClick={() => setTextSize("md")}
                  className={`px-1.5 rounded ${textSize === "md" ? "bg-white/20 text-white font-bold" : "text-chalk-dim"}`}
                >
                  A+
                </button>
                <button
                  onClick={() => setTextSize("lg")}
                  className={`px-1.5 rounded ${textSize === "lg" ? "bg-white/20 text-white font-bold" : "text-chalk-dim"}`}
                >
                  A++
                </button>
              </div>

              <div className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-xl">
                <span className="text-chalk-dim font-semibold">Speed:</span>
                {["1.0x", "1.25x", "1.5x"].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`px-1.5 rounded ${
                      playbackSpeed === spd
                        ? "bg-white/20 text-white font-bold"
                        : "text-chalk-dim hover:text-white"
                    }`}
                  >
                    {spd}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Pace & Comprehension Telemetry Card matching Stitch */}
        <section className="cc-card p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-medium">How the class followed</h3>
            </div>
            <span className="text-xs font-semibold text-patta text-right">
              {paceText}
            </span>
          </div>

          <p className="text-sm text-ink-2 mb-4">
            {topHotspot ? (
              <>
                {topHotspot.count} &ldquo;I&apos;m lost&rdquo; tap{topHotspot.count === 1 ? "" : "s"} during the live class at{" "}
                <button onClick={() => seek(topHotspot.offset_s)} className="font-bold text-neel underline">
                  {mmss(topHotspot.offset_s)}
                </button>
              </>
            ) : (
              "No confusion pings were recorded for this lecture."
            )}
          </p>

          <button
            onClick={markLost}
            className="cc-btn cc-btn-haldi w-full h-12 text-sm"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Bookmark this moment to revise</span>
          </button>
        </section>

        {/* 4. Listen to Notes (Audio Narration) matching Stitch */}
        <section className="cc-card p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Headphones className="w-5 h-5 text-neel flex-shrink-0" />
            <div>
              <h3 className="text-lg font-medium leading-tight">Listen to the notes</h3>
              <p className="text-xs text-ink-3">
                Read aloud by your device · {LANGUAGES.find((l) => l.code === selectedCaptionLang)?.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink-3">1.2×</span>
            <button
              onClick={playAudioNarration}
              aria-label={isNarrating ? "Pause narration" : "Play narration"}
              className={`w-11 h-11 rounded-full flex items-center justify-center text-white border-[1.5px] border-ink shadow-[2px_2px_0_var(--color-ink)] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                isNarrating ? "bg-sindoor" : "bg-neel hover:bg-neel-deep"
              }`}
            >
              {isNarrating ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
          </div>
        </section>

        {/* 5. Multilingual Tab Navigation matching Stitch */}
        <section className="space-y-3">
          <div className="grid grid-cols-4 border-b border-rule" role="tablist">
            <button
              onClick={() => setActiveTab("transcript")}
              className={`${tabCls} ${activeTab === "transcript" ? tabOn : tabOff}`}
            >
              Transcript
            </button>
            <button
              onClick={() => setActiveTab("notes")}
              className={`${tabCls} ${activeTab === "notes" ? tabOn : tabOff}`}
            >
              Notes
            </button>
            <button
              onClick={() => setActiveTab("quiz")}
              className={`${tabCls} ${activeTab === "quiz" ? tabOn : tabOff}`}
            >
              Quiz <span className="font-mono text-xs text-ink-3">{conceptNotes?.quiz?.length ?? 0}</span>
            </button>
            <button
              onClick={() => setActiveTab("ask")}
              className={`${tabCls} ${activeTab === "ask" ? tabOn : tabOff}`}
            >
              Ask
            </button>
          </div>

          {/* TAB 1: AI NOTES CONTENT matching Stitch */}
          {activeTab === "notes" && (
            <div className="space-y-4">
              {!notesEn && (
                <div className="cc-card p-6 text-sm text-ink-2">
                  {ready ? (notesLoading ? "Generating AI notes in your language..." : "Notes could not be loaded. Try again in a moment.") : "AI notes are written as soon as the transcript is ready."}
                </div>
              )}

              {/* Lecture Summary High-Yield */}
              {notesEn && (
                <div className="cc-card cc-notebook py-6 pr-6 pl-14 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-normal">Summary</h3>
                    <span className="cc-eyebrow">Bilingual</span>
                  </div>

                  <div className="space-y-4 text-[15px] leading-[1.75rem] text-ink-2">
                    <div>
                      <strong className="cc-eyebrow">English</strong>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        {notesEn.summary.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </div>

                    {notes && (
                      <div lang={selectedCaptionLang === "en" ? "hi" : selectedCaptionLang} className="text-ink">
                        <p className="text-sindoor text-base mb-1">
                          {LANGUAGES.find((l) => l.code === (selectedCaptionLang === "en" ? "hi" : selectedCaptionLang))?.native}
                        </p>
                        <ul className="list-disc pl-5 space-y-1 text-[15px]">
                          {notes.summary.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* CONCEPT cards matching Stitch */}
              {conceptNotes?.key_terms.map((t, i) => (
                <div key={t.term} className="cc-card p-6 space-y-1.5">
                  <span className="font-mono text-xs text-sindoor">{String(i + 1).padStart(2, "0")}</span>

                  <h4 className="text-2xl font-normal leading-tight">{t.term}</h4>

                  <p className="text-[15px] text-ink-2 leading-relaxed">
                    {t.meaning}
                  </p>

                  <div className="pt-3 border-t border-rule flex items-center justify-between text-xs">
                    <span className="cc-eyebrow">Key term</span>
                    <button
                      onClick={() => handleAskAI(`Explain "${t.term}" from this lecture with an example`)}
                      className="font-semibold text-neel flex items-center gap-1 hover:underline"
                    >
                      <span>Ask AI</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Timeline */}
              {conceptNotes && conceptNotes.timeline.length > 0 && (
                <div className="cc-card p-6 space-y-2">
                  <h3 className="text-xl font-medium mb-1">Timeline</h3>
                  {conceptNotes.timeline.map((t, i) => (
                    <button key={i} onClick={() => seek(t.start_s)} className="flex gap-3 text-left text-sm text-ink-2 hover:text-ink py-1">
                      <span className="font-mono text-neel flex-shrink-0">{mmss(t.start_s)}</span> <span>{t.topic}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TRANSCRIPT */}
          {activeTab === "transcript" && (
            <div className="cc-card p-6 space-y-3">
              <h3 className="text-xl font-medium mb-2">Transcript</h3>
              <div className="space-y-2 text-[15px] leading-relaxed text-ink-2 max-h-[480px] overflow-y-auto">
                {cues.length === 0 && <p className="text-ink-3">The transcript appears once processing finishes.</p>}
                {cues.map((c) => (
                  <p
                    key={c.idx}
                    onClick={() => seek(c.start_s)}
                    className={`cursor-pointer rounded-md px-2 py-1 flex gap-3 ${currentCue?.idx === c.idx ? "bg-haldi-wash text-ink" : "hover:bg-paper"}`}
                  >
                    <span className="font-mono text-xs text-neel pt-1 flex-shrink-0">{mmss(c.start_s)}</span> <span>{c.text}</span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: AI QUIZ + exam practice */}
          {activeTab === "quiz" && (
            <div className="space-y-4">
              <div className="cc-card p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-medium">Quick quiz ({conceptNotes?.quiz.length ?? 0} questions)</h3>
                  {conceptNotes && Object.keys(answers).length > 0 && (
                    <span className="text-xs font-bold text-neel">
                      Score: {conceptNotes.quiz.filter((q, qi) => answers[qi] === q.answer_index).length} / {conceptNotes.quiz.length}
                    </span>
                  )}
                </div>
                {quizSaved && (
                  <p className="text-xs font-semibold text-patta-deep bg-patta-wash border border-patta-line rounded-xl px-3 py-2">
                    {quizJustSaved ? "Saved to your account. " : ""}Your best: {quizSaved.best}/{quizSaved.total} ({quizSaved.attempts} attempt
                    {quizSaved.attempts === 1 ? "" : "s"})
                  </p>
                )}
                {answeredAll && quizAccount === false && role === "student" && (
                  <p className="text-xs text-ink-2">
                    <Link href={`/student/login?next=${encodeURIComponent(`/student/lectures/${id}?tab=quiz`)}`} className="font-bold text-neel underline">
                      Sign in
                    </Link>{" "}
                    to save your quiz scores.
                  </p>
                )}
                {!conceptNotes && <p className="text-xs text-ink-3">{notesLoading ? "Writing the quiz..." : "The quiz is generated with the AI notes."}</p>}
                {conceptNotes?.quiz.map((q, qi) => {
                  const picked = answers[qi];
                  return (
                    <div key={qi} className="p-4 rounded-xl bg-paper border border-rule space-y-3">
                      <p className="text-[15px] font-semibold text-ink">
                        <span className="font-heading italic text-sindoor mr-1">{qi + 1}.</span> {q.question}
                      </p>
                      <div className="space-y-1.5 text-sm">
                        {q.options.map((opt, i) => {
                          const state = picked === undefined ? "" : i === q.answer_index ? "border-patta bg-patta-wash" : i === picked ? "border-sindoor bg-sindoor-wash" : "opacity-70";
                          return (
                            <button
                              key={i}
                              disabled={picked !== undefined}
                              onClick={() => setAnswers((a) => ({ ...a, [qi]: i }))}
                              className={`w-full text-left px-3 py-2.5 rounded-[10px] border border-rule-strong bg-card hover:border-ink transition ${state}`}
                            >
                              {String.fromCharCode(65 + i)}. {opt}
                            </button>
                          );
                        })}
                      </div>
                      {picked !== undefined && (
                        <p className={`text-sm p-3 rounded-[10px] ${picked === q.answer_index ? "bg-patta-wash text-patta-deep" : "bg-sindoor-wash text-sindoor-deep"}`}>
                          <span className="font-bold">{picked === q.answer_index ? "Correct. " : `Not quite: the answer is ${String.fromCharCode(65 + q.answer_index)}. `}</span>
                          {q.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
                {conceptNotes && Object.keys(answers).length > 0 && (
                  <button
                    onClick={() => {
                      setAnswers({});
                      setQuizJustSaved(false);
                    }}
                    className="text-xs font-bold text-neel hover:underline"
                  >
                    Try the quiz again
                  </button>
                )}
              </div>

              {!!conceptNotes?.practice_questions?.length && (
                <div className="cc-card p-6 space-y-3">
                  <div>
                    <h3 className="text-lg font-medium">Exam practice</h3>
                    <p className="text-xs text-ink-3">Write your answer first, then compare it with the model answer.</p>
                  </div>
                  {conceptNotes.practice_questions.map((q, qi) => (
                    <div key={qi} className="p-4 rounded-xl bg-paper border border-rule space-y-2">
                      <p className="text-sm font-bold text-ink">
                        {qi + 1}. {q.question}
                      </p>
                      {revealed[qi] ? (
                        <p className="text-xs text-ink-2 leading-relaxed p-3 rounded-xl bg-card border border-rule">{q.answer}</p>
                      ) : (
                        <button onClick={() => setRevealed((r) => ({ ...r, [qi]: true }))} className="text-xs font-bold text-neel hover:underline">
                          Show model answer
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ASK AI CHAT */}
          {activeTab === "ask" && (
            <div className="cc-card p-6 space-y-4">
              <h3 className="text-xl font-medium">Ask the lecture</h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {aiChat.length === 0 && (
                  <p className="text-xs text-ink-3">
                    Ask anything about this lecture in any language. Answers come only from what was said in class, with timestamps.
                  </p>
                )}
                {aiChat.map((chat, i) => (
                  <div key={i} className="space-y-2">
                    <div className="bg-neel text-white px-3.5 py-2.5 rounded-[12px] rounded-br-sm text-sm w-fit max-w-[85%] ms-auto">
                      {chat.q}
                    </div>
                    <div className="bg-paper border border-rule text-ink p-3.5 rounded-[12px] rounded-bl-sm text-sm leading-relaxed mr-8">
                      {chat.a}
                      {chat.citations && chat.citations.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {chat.citations.map((c, ci) => (
                            <button
                              key={ci}
                              onClick={() => seek(c.start_s)}
                              title={c.quote}
                              className="px-2 py-0.5 rounded-md border border-neel-line text-neel font-mono text-[11px] hover:bg-neel-wash"
                            >
                              ▶ {mmss(c.start_s)}
                            </button>
                          ))}
                        </div>
                      )}
                      {chat.via && <p className="mt-2 text-[10px] text-ink-3">{chat.via}</p>}
                    </div>
                  </div>
                ))}
                {isAsking && <p className="text-xs text-ink-3">Searching the lecture...</p>}
              </div>
            </div>
          )}
        </section>

        {/* 6. Sticky Bottom "Ask AI" Prompt Bar matching Stitch */}
        <section className="cc-card p-4 space-y-2.5 !border-ink/30">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar text-xs">
            <span className="cc-eyebrow flex-shrink-0">
              Try
            </span>
            {(notesEn?.key_terms.slice(0, 2) ?? []).flatMap((t, k) => [
              <button
                key={`w${k}`}
                onClick={() => handleAskAI(`What is ${t.term}?`)}
                className="px-3 py-1 rounded-full border border-rule-strong text-ink-2 whitespace-nowrap hover:border-ink hover:text-ink transition"
              >
                &ldquo;What is {t.term}?&rdquo;
              </button>,
              <button
                key={`h${k}`}
                onClick={() => handleAskAI(`Explain ${t.term} in Hindi`)}
                className="px-3 py-1 rounded-full border border-rule-strong text-ink-2 whitespace-nowrap hover:border-ink hover:text-ink transition"
              >
                &ldquo;Explain {t.term} in Hindi&rdquo;
              </button>,
            ])}
            {!notesEn && (
              <button
                onClick={() => handleAskAI("Summarise this lecture in 3 points")}
                className="px-3 py-1 rounded-full border border-rule-strong text-ink-2 whitespace-nowrap hover:border-ink hover:text-ink transition"
              >
                &ldquo;Summarise this lecture in 3 points&rdquo;
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-12 px-3.5 rounded-[10px] border-[1.5px] border-rule-strong bg-card flex items-center gap-2 focus-within:border-neel focus-within:ring-2 focus-within:ring-neel-wash">
              <Bot className="w-4 h-4 text-ink-3" />
              <input
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAskAI()}
                placeholder="Ask anything from this lecture..."
                className="w-full text-sm text-ink bg-transparent outline-none placeholder:text-ink-4"
              />
              <button
                onClick={() => {
                  if (typeof window !== "undefined") {
                    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                    if (SR) {
                      const r = new SR();
                      r.lang = speechLocale(selectedCaptionLang);
                      r.onresult = (ev: any) => setAiQuestion(ev.results[0][0].transcript);
                      r.start();
                    }
                  }
                }}
                className="text-ink-3 hover:text-neel"
              >
                <Mic className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => handleAskAI()}
              disabled={isAsking || !aiQuestion.trim() || !ready}
              className="cc-btn cc-btn-primary h-12 px-4 text-xs flex items-center gap-1.5"
            >
              <span>{isAsking ? "..." : "Ask"}</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      </main>

      <BottomNav currentTab="notes" />
    </div>
  );
}

export default function RecordedLecturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-ink-2">Loading lecture hub...</div>}>
      <RecordedLectureContent paramsPromise={params} />
    </Suspense>
  );
}
