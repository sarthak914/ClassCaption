"use client";

import { use, useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navigation/Navbar";
import { BottomNav } from "@/components/navigation/BottomNav";
import { api, isUuid, mmss, pref, speak } from "@/lib/client/api";
import { LANGUAGES } from "@/lib/languages";
import {
  Play,
  Pause,
  Volume2,
  Maximize2,
  Download,
  CheckCircle2,
  Sparkles,
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
  const initialTab = searchParams?.get("tab") === "notes" ? "notes" : "notes";

  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [cues, setCues] = useState<Cue[]>([]);
  const [notes, setNotes] = useState<Notes | null>(null);
  const [notesEn, setNotesEn] = useState<Notes | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [showCC, setShowCC] = useState(true);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [activeTab, setActiveTab] = useState<"transcript" | "notes" | "quiz" | "ask">(initialTab);
  const [selectedCaptionLang, setSelectedCaptionLang] = useState<PlayerLang>("hi");
  const [playbackSpeed, setPlaybackSpeed] = useState("1.0x");
  const [textSize, setTextSize] = useState<"sm" | "md" | "lg">("md");

  // AI Q&A State
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiChat, setAiChat] = useState<Array<{ q: string; a: string; citations?: Citation[] }>>([]);
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

  // Resolve demo links ("demo", "demo-live-01") to the latest finished lecture.
  useEffect(() => {
    if (isUuid(id)) return;
    api<{ lectures: { id: string }[] }>("/api/lectures?status=ready")
      .then(({ lectures }) => {
        if (lectures[0]) router.replace(`/student/lectures/${lectures[0].id}${searchParams?.get("tab") ? `?tab=${searchParams.get("tab")}` : ""}`);
        else setLoadError("No recorded lectures yet. End a live class or upload a recording from the teacher dashboard.");
      })
      .catch((err) => setLoadError((err as Error).message));
  }, [id, router, searchParams]);

  // Lecture + segments; poll while it is still being transcribed / summarised.
  useEffect(() => {
    if (!isUuid(id)) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const data = await api<{ lecture: Lecture; segments: Segment[]; mediaUrl: string | null }>(`/api/lectures/${id}`);
        if (stop) return;
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
  const paceText = lectureWpm === 0 ? "Pace: n/a" : lectureWpm > 160 ? `Too Fast (${lectureWpm} WPM)` : lectureWpm < 90 ? `Slow Pace (${lectureWpm} WPM)` : `Optimal Pace (${lectureWpm} WPM)`;
  const langLabel = (l: string) => LANGUAGES.find((x) => x.code === l)?.native ?? l;
  const speechLocale = (l: string) => LANGUAGES.find((x) => x.code === l)?.speech ?? "en-IN";
  const subtitleSize = textSize === "sm" ? "text-xs" : textSize === "lg" ? "text-lg" : "text-sm";
  const conceptNotes = selectedCaptionLang === "en" ? notesEn : notes;

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
      const data = await api<{ answer: string; citations: Citation[] }>(`/api/lectures/${lecture.id}/ask`, {
        json: { question: query, lang: selectedCaptionLang },
      });
      setAiChat((prev) => [...prev, { q: query, a: data.answer, citations: data.citations }]);
      setAiQuestion("");
    } catch (err) {
      setAiChat((prev) => [...prev, { q: query, a: `⚠ ${(err as Error).message}` }]);
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
    alert(`Marked ${mmss(currentTimeSec)} for your personal review revision notes.`);
  };

  if (!lecture) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-8 text-center text-sm text-[#475569]">
        {loadError || "Loading lecture hub..."}{" "}
        {loadError && (
          <Link href="/student" className="text-[#1E3A8A] underline font-bold">
            Back
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-32 text-[#0F172A]">
      {/* Top Navbar with Back navigation matching Stitch */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-[#E2E8F0] px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/student"
              className="w-9 h-9 rounded-xl border border-[#E2E8F0] flex items-center justify-center text-[#475569] hover:bg-[#F1F5F9] transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="font-extrabold text-lg tracking-tight text-[#0F172A] font-heading">
              ClassCaption
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedCaptionLang(selectedCaptionLang === "en" ? "hi" : "en")}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-[#F1F5F9] text-[#0F172A] font-semibold text-xs border border-[#CBD5E1]"
            >
              <Languages className="w-3.5 h-3.5 text-[#1E3A8A]" />
              <span>{langLabel(selectedCaptionLang)}</span>
            </button>
            <button onClick={shareLecture} className="w-9 h-9 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-[#475569]">
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* 1. Header Information matching Stitch */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs">
          <p className="text-xs font-bold text-[#1E40AF] mb-1">
            {lecture.classroom?.name ?? (lecture.source === "live" ? "Live class recording" : "Uploaded recording")}
            {lecture.classroom?.room ? ` • ${lecture.classroom.room}` : ""}
          </p>

          <h1 className="text-xl sm:text-2xl font-extrabold text-[#0F172A] font-heading mb-3">
            {lecture.title}
          </h1>

          <div className="flex flex-wrap items-center gap-2">
            {ready ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ECFDF5] text-[#065F46] text-xs font-bold border border-[#A7F3D0]">
                <span className="w-2 h-2 rounded-full bg-[#059669]" />
                Ready • {formatTime(totalTimeSec)} • {segments.length} lines
              </span>
            ) : lecture.status === "failed" ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF2F2] text-[#DC2626] text-xs font-bold border border-[#FECACA]">
                Failed: {(lecture.error ?? "processing error").slice(0, 80)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF3C7] text-[#92400E] text-xs font-bold border border-[#FDE68A]">
                <span className="w-2 h-2 rounded-full bg-[#D97706] animate-pulse" />
                {lecture.status === "summarising" ? "Writing AI notes" : "Processing"} • {lecture.progress ?? 0}%
              </span>
            )}

            <button
              onClick={downloadTranscript}
              disabled={segments.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] text-xs font-bold transition"
            >
              <Download className="w-3.5 h-3.5 text-[#1E3A8A]" />
              <span>Transcript (TXT)</span>
            </button>
          </div>
        </section>

        {/* 2. Video Player & Bilingual Caption Stage matching Stitch */}
        <section ref={stageRef} className="bg-[#0B0F19] text-[#F8FAFC] rounded-3xl border border-white/10 overflow-hidden shadow-xl">
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
              <span className="px-2.5 py-1 rounded-md bg-black/60 text-xs font-mono font-bold text-white flex items-center gap-1.5 border border-white/10">
                <span className="w-2 h-2 rounded-full bg-[#DC2626] animate-pulse" />
                REC • {lecture.classroom?.subject_code ?? (lecture.source === "live" ? "LIVE" : "UPLOAD")}
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
              className={`relative w-14 h-14 rounded-full bg-[#1E3A8A] hover:bg-[#2563EB] text-white flex items-center justify-center mx-auto shadow-lg active:scale-95 transition disabled:opacity-50 ${isPlaying && isVideo ? "opacity-0 hover:opacity-100" : ""}`}
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </button>

            {/* Bilingual Synchronized Subtitle Box matching Stitch */}
            {showCC ? (
              <div className="relative bg-black/80 backdrop-blur-md rounded-2xl p-3 border border-white/15">
                <span className="px-2 py-0.5 rounded bg-[#1E3A8A] text-[10px] font-bold text-[#90A8FF] mb-1 inline-block">
                  BILINGUAL SYNC • {LANGUAGES.find((l) => l.code === selectedCaptionLang)?.name} + Original
                </span>
                <p className={`${subtitleSize} font-semibold text-white leading-snug`}>
                  &ldquo;{currentCue?.text ?? (segments.length ? "Press play to start subtitles." : ready ? "No speech found." : "Subtitles appear once processing finishes.")}&rdquo;
                </p>
                {currentCue && currentCue.original !== currentCue.text && (
                  <p className="text-xs font-medium text-[#34D399] mt-0.5">
                    &ldquo;{currentCue.original}&rdquo;
                  </p>
                )}
              </div>
            ) : (
              <div />
            )}
          </div>

          {/* Timeline and Scrubber with Confusion Hotspots matching Stitch */}
          <div className="p-4 space-y-3 bg-white/5 border-t border-white/10">
            <div>
              <div
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  seek(((e.clientX - r.left) / r.width) * totalTimeSec);
                }}
                className="relative w-full bg-gray-700 h-2 rounded-full overflow-hidden mb-1.5 cursor-pointer"
              >
                {/* Progress bar */}
                <div className="bg-[#3B82F6] h-full" style={{ width: `${totalTimeSec ? Math.min(100, (currentTimeSec / totalTimeSec) * 100) : 0}%` }} />
                {/* Yellow Confusion Hotspots Markers */}
                {totalTimeSec > 0 &&
                  hotspots.map((h) => (
                    <div
                      key={h.seq}
                      title={`${h.count} lost at ${mmss(h.offset_s)}`}
                      className="absolute top-0 bottom-0 w-1.5 bg-[#F59E0B]"
                      style={{ left: `${Math.min(99, (h.offset_s / totalTimeSec) * 100)}%` }}
                    />
                  ))}
              </div>

              <div className="flex items-center justify-between text-xs text-gray-300 font-mono font-semibold">
                <span>
                  {formatTime(currentTimeSec)} / {formatTime(totalTimeSec)}
                </span>
                <span className="flex items-center gap-1 text-[#F59E0B] font-sans font-bold">
                  <span className="w-2 h-2 bg-[#F59E0B] rounded-xs" />
                  Class Confusion Hotspots ({hotspots.length})
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
                <Volume2 className="w-4 h-4 text-gray-400" />
              </div>

              {/* Language Pill Selector inside Player */}
              <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl">
                {(["en", "hi", "ta", "te", "bn"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setSelectedCaptionLang(l)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold transition ${
                      selectedCaptionLang === l
                        ? "bg-[#1E3A8A] text-white"
                        : "text-gray-300 hover:bg-white/10"
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
                <span className="text-gray-400 font-bold">TT</span>
                <button
                  onClick={() => setTextSize("sm")}
                  className={`px-1.5 rounded ${textSize === "sm" ? "bg-white/20 text-white font-bold" : "text-gray-400"}`}
                >
                  A
                </button>
                <button
                  onClick={() => setTextSize("md")}
                  className={`px-1.5 rounded ${textSize === "md" ? "bg-[#1E3A8A] text-white font-bold underline" : "text-gray-400"}`}
                >
                  A+
                </button>
                <button
                  onClick={() => setTextSize("lg")}
                  className={`px-1.5 rounded ${textSize === "lg" ? "bg-white/20 text-white font-bold" : "text-gray-400"}`}
                >
                  A++
                </button>
              </div>

              <div className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-xl">
                <span className="text-gray-400 font-semibold">Speed:</span>
                {["1.0x", "1.25x", "1.5x"].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`px-1.5 rounded ${
                      playbackSpeed === spd
                        ? "bg-[#1E3A8A] text-white font-bold underline"
                        : "text-gray-300 hover:text-white"
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
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#FEF3C7] flex items-center justify-center text-[#D97706]">
                <HelpCircle className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-[#0F172A] font-heading">
                Pace &amp; Comprehension Telemetry
              </h3>
            </div>
            <span className="px-3 py-1 rounded-full bg-[#ECFDF5] text-[#065F46] text-xs font-bold border border-[#A7F3D0]">
              {paceText}
            </span>
          </div>

          <p className="text-xs text-[#475569] mb-4">
            {topHotspot ? (
              <>
                {topHotspot.count} student{topHotspot.count === 1 ? "" : "s"} requested review at timestamp{" "}
                <button onClick={() => seek(topHotspot.offset_s)} className="font-bold text-[#1E3A8A] underline">
                  {mmss(topHotspot.offset_s)}
                </button>
              </>
            ) : (
              "No confusion pings were recorded for this lecture."
            )}
          </p>

          <button
            onClick={markLost}
            className="w-full h-12 rounded-2xl bg-[#FEF3C7] border-2 border-[#D97706] text-[#92400E] font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#FDE68A] transition active:scale-95"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Tap if Lost (Anonymous)</span>
          </button>
        </section>

        {/* 4. Listen to Notes (Audio Narration) matching Stitch */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#EFF6FF] flex items-center justify-center text-[#1E3A8A]">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0F172A] font-heading">
                Listen to Notes (Audio Narration)
              </h3>
              <p className="text-xs text-[#64748B]">
                Device AI Voice • {LANGUAGES.find((l) => l.code === selectedCaptionLang)?.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] text-xs font-semibold text-[#0F172A]">
              1.2x Speed
            </span>
            <button
              onClick={playAudioNarration}
              className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition active:scale-95 shadow-xs ${
                isNarrating ? "bg-[#DC2626]" : "bg-[#1E3A8A] hover:bg-[#00236F]"
              }`}
            >
              {isNarrating ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
          </div>
        </section>

        {/* 5. Multilingual Tab Navigation matching Stitch */}
        <section className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-[#F1F5F9] border border-[#E2E8F0]">
            <button
              onClick={() => setActiveTab("transcript")}
              className={`py-2 rounded-xl text-xs font-bold transition ${
                activeTab === "transcript" ? "bg-white text-[#0F172A] shadow-xs" : "text-[#64748B]"
              }`}
            >
              Transcript
            </button>
            <button
              onClick={() => setActiveTab("notes")}
              className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition ${
                activeTab === "notes" ? "bg-[#1E3A8A] text-white shadow-xs" : "text-[#64748B]"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Notes</span>
            </button>
            <button
              onClick={() => setActiveTab("quiz")}
              className={`py-2 rounded-xl text-xs font-bold transition ${
                activeTab === "quiz" ? "bg-white text-[#0F172A] shadow-xs" : "text-[#64748B]"
              }`}
            >
              AI Quiz ({conceptNotes?.quiz?.length ?? 0})
            </button>
            <button
              onClick={() => setActiveTab("ask")}
              className={`py-2 rounded-xl text-xs font-bold transition ${
                activeTab === "ask" ? "bg-white text-[#0F172A] shadow-xs" : "text-[#64748B]"
              }`}
            >
              Ask AI
            </button>
          </div>

          {/* TAB 1: AI NOTES CONTENT matching Stitch */}
          {activeTab === "notes" && (
            <div className="space-y-4">
              {!notesEn && (
                <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs text-sm text-[#475569]">
                  {ready ? (notesLoading ? "Generating AI notes in your language..." : "Notes could not be loaded. Try again in a moment.") : "AI notes are written as soon as the transcript is ready."}
                </div>
              )}

              {/* Lecture Summary High-Yield */}
              {notesEn && (
                <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-[#0F172A] font-heading">
                      1. Lecture Summary (High-Yield)
                    </h3>
                    <span className="px-3 py-1 rounded-full bg-[#EFF6FF] text-[#1E40AF] text-xs font-bold">
                      Bilingual
                    </span>
                  </div>

                  <div className="space-y-3 text-sm leading-relaxed text-[#334155]">
                    <div>
                      <strong className="text-[#0F172A]">English:</strong>
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        {notesEn.summary.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </div>

                    {notes && (
                      <div className="p-4 rounded-2xl bg-[#EFF6FF] border-l-4 border-[#1E3A8A] text-[#1E3A8A]">
                        <p className="font-semibold text-xs mb-1">
                          {LANGUAGES.find((l) => l.code === (selectedCaptionLang === "en" ? "hi" : selectedCaptionLang))?.native} सारांश / Summary:
                        </p>
                        <ul className="list-disc pl-5 space-y-1 text-sm font-medium">
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
                <div key={t.term} className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase ${
                        i % 2 === 0 ? "bg-[#ECFDF5] text-[#065F46]" : "bg-[#EFF6FF] text-[#1E40AF]"
                      }`}
                    >
                      CONCEPT {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <h4 className="text-base font-bold text-[#0F172A] font-heading">
                    {t.term}
                  </h4>

                  <p className="text-xs text-[#475569]">
                    {t.meaning}
                  </p>

                  <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs">
                    <span className="font-mono font-semibold text-[#64748B]">Key Term</span>
                    <button
                      onClick={() => handleAskAI(`Explain "${t.term}" from this lecture with an example`)}
                      className="font-bold text-[#1E3A8A] flex items-center gap-1 hover:underline"
                    >
                      <span>Ask AI</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Timeline */}
              {conceptNotes && conceptNotes.timeline.length > 0 && (
                <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-2">
                  <h3 className="text-base font-bold text-[#0F172A] font-heading">Lecture Timeline</h3>
                  {conceptNotes.timeline.map((t, i) => (
                    <button key={i} onClick={() => seek(t.start_s)} className="block text-left text-xs text-[#334155] hover:underline">
                      <span className="font-mono font-bold text-[#1E3A8A]">[{mmss(t.start_s)}]</span> {t.topic}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TRANSCRIPT */}
          {activeTab === "transcript" && (
            <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-3">
              <h3 className="text-base font-bold text-[#0F172A] font-heading mb-2">
                Complete Lecture Transcript
              </h3>
              <div className="space-y-3 text-xs leading-relaxed text-[#334155] max-h-[480px] overflow-y-auto">
                {cues.length === 0 && <p className="text-[#64748B]">The transcript appears once processing finishes.</p>}
                {cues.map((c) => (
                  <p
                    key={c.idx}
                    onClick={() => seek(c.start_s)}
                    className={`cursor-pointer rounded-lg px-1 ${currentCue?.idx === c.idx ? "bg-[#EFF6FF]" : "hover:bg-[#F8FAFC]"}`}
                  >
                    <span className="font-mono font-bold text-[#1E3A8A]">[{mmss(c.start_s)}]</span> {c.text}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: AI QUIZ */}
          {activeTab === "quiz" && (
            <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-[#0F172A] font-heading">
                AI Knowledge Check Quiz ({conceptNotes?.quiz.length ?? 0} Questions)
              </h3>
              {!conceptNotes && <p className="text-xs text-[#64748B]">The quiz is generated with the AI notes.</p>}
              {conceptNotes?.quiz.map((q, qi) => (
                <div key={qi} className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
                  <p className="text-sm font-bold text-[#0F172A]">
                    Q{qi + 1}. {q.question}
                  </p>
                  <div className="space-y-1.5 text-xs">
                    {q.options.map((opt, i) => {
                      const picked = answers[qi];
                      const state = picked === undefined ? "" : i === q.answer_index ? "border-[#059669] bg-[#ECFDF5]" : i === picked ? "border-[#DC2626] bg-[#FEF2F2]" : "";
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            setAnswers((a) => ({ ...a, [qi]: i }));
                            alert(i === q.answer_index ? `Correct! ${q.explanation}` : `Try again! ${q.explanation}`);
                          }}
                          className={`w-full text-left p-2.5 rounded-xl border border-[#CBD5E1] bg-white hover:bg-[#EFF6FF] font-medium transition ${state}`}
                        >
                          {String.fromCharCode(65 + i)}. {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: ASK AI CHAT */}
          {activeTab === "ask" && (
            <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-[#0F172A] font-heading">
                Lecture AI Assistant Q&amp;A
              </h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {aiChat.length === 0 && (
                  <p className="text-xs text-[#64748B]">
                    Ask anything about this lecture in any language. Answers come only from what was said in class, with timestamps.
                  </p>
                )}
                {aiChat.map((chat, i) => (
                  <div key={i} className="space-y-2">
                    <div className="bg-[#EFF6FF] text-[#1E40AF] p-3 rounded-2xl text-xs font-bold text-right ml-12">
                      {chat.q}
                    </div>
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] p-3.5 rounded-2xl text-xs leading-relaxed mr-8">
                      {chat.a}
                      {chat.citations && chat.citations.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {chat.citations.map((c, ci) => (
                            <button
                              key={ci}
                              onClick={() => seek(c.start_s)}
                              title={c.quote}
                              className="px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#1E40AF] font-mono font-bold text-[11px] hover:bg-[#DBEAFE]"
                            >
                              ▶ {mmss(c.start_s)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isAsking && <p className="text-xs text-[#64748B]">Searching the lecture...</p>}
              </div>
            </div>
          )}
        </section>

        {/* 6. Sticky Bottom "Ask AI" Prompt Bar matching Stitch */}
        <section className="bg-white rounded-3xl border-2 border-[#1E3A8A]/30 p-4 shadow-lg space-y-2.5">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar text-xs">
            <span className="flex items-center gap-1 font-bold text-[#1E3A8A] flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
              Prompts:
            </span>
            {(notesEn?.key_terms.slice(0, 2) ?? []).flatMap((t, k) => [
              <button
                key={`w${k}`}
                onClick={() => handleAskAI(`What is ${t.term}?`)}
                className="px-3 py-1 rounded-full bg-[#EFF6FF] text-[#1E40AF] font-medium whitespace-nowrap hover:bg-[#DBEAFE] transition"
              >
                &ldquo;What is {t.term}?&rdquo;
              </button>,
              <button
                key={`h${k}`}
                onClick={() => handleAskAI(`Explain ${t.term} in Hindi`)}
                className="px-3 py-1 rounded-full bg-[#EFF6FF] text-[#1E40AF] font-medium whitespace-nowrap hover:bg-[#DBEAFE] transition"
              >
                &ldquo;Explain {t.term} in Hindi&rdquo;
              </button>,
            ])}
            {!notesEn && (
              <button
                onClick={() => handleAskAI("Summarise this lecture in 3 points")}
                className="px-3 py-1 rounded-full bg-[#EFF6FF] text-[#1E40AF] font-medium whitespace-nowrap hover:bg-[#DBEAFE] transition"
              >
                &ldquo;Summarise this lecture in 3 points&rdquo;
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-12 px-3.5 rounded-2xl border border-[#CBD5E1] bg-white flex items-center gap-2 focus-within:border-[#1E3A8A] focus-within:ring-2 focus-within:ring-[#1E3A8A]/20">
              <Bot className="w-4 h-4 text-[#64748B]" />
              <input
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAskAI()}
                placeholder="Ask anything from lecture..."
                className="w-full text-xs font-medium text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
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
                className="text-[#64748B] hover:text-[#1E3A8A]"
              >
                <Mic className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => handleAskAI()}
              disabled={isAsking || !aiQuestion.trim() || !ready}
              className="h-12 px-4 rounded-2xl bg-[#1E3A8A] hover:bg-[#00236F] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition active:scale-95"
            >
              <span>{isAsking ? "..." : "Ask AI"}</span>
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
    <Suspense fallback={<div className="p-8 text-center text-sm text-[#475569]">Loading lecture hub...</div>}>
      <RecordedLectureContent paramsPromise={params} />
    </Suspense>
  );
}
