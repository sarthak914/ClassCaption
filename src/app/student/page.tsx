"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navigation/Navbar";
import { BottomNav } from "@/components/navigation/BottomNav";
import { api, pref, sourceLabel } from "@/lib/client/api";
import { LANGUAGES } from "@/lib/languages";
import {
  GraduationCap,
  Sparkles,
  CheckCircle2,
  Volume2,
  QrCode,
  ArrowRight,
  BookOpen,
  Activity,
  Layers,
  Radio,
  Sliders,
  Check,
  Zap,
} from "lucide-react";

type LiveClass = {
  id: string;
  title: string;
  join_code: string;
  source_lang: string;
  started_at: string;
  classroom: { id: string; name: string; subject_code: string | null; room: string | null; join_code: string } | null;
};
type Room = {
  id: string;
  name: string;
  subject_code: string | null;
  room: string | null;
  join_code: string;
  live_class: { id: string; title: string; started_at: string } | null;
  lecture_count: number;
};
type LectureItem = { id: string; title: string; status: string; created_at: string; classroom_id: string | null };
type Term = { term: string; meaning: string };

export default function StudentHomePage() {
  const router = useRouter();
  const [classCode, setClassCode] = useState("");
  const [live, setLive] = useState<LiveClass | null>(null);
  const [liveStats, setLiveStats] = useState<{ wpm: number; pace: string } | null>(null);
  const [preview, setPreview] = useState<{ text: string; display: string } | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [lectures, setLectures] = useState<LectureItem[]>([]);
  const [openDetails, setOpenDetails] = useState<string | null>(null);
  const [terms, setTerms] = useState<{ lecture: LectureItem; terms: Term[] } | null>(null);
  const [termsLoading, setTermsLoading] = useState(false);
  const [lang, setLang] = useState("hi");
  const [name, setName] = useState("Rahul Verma");
  const [filter, setFilter] = useState<"all" | "today">("all");
  const [hapticTested, setHapticTested] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [now, setNow] = useState(Date.now());

  const activeLectureId = live?.id ?? "demo-live-01";
  const langInfo = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  useEffect(() => {
    setLang(pref("lang", "hi"));
    setName(pref("name", "Rahul Verma"));
  }, []);

  // The class that is live right now (if any) + a preview of its latest caption in my language
  useEffect(() => {
    const load = async () => {
      try {
        const t0 = performance.now();
        const { classes } = await api<{ classes: LiveClass[] }>("/api/class?status=live&limit=1");
        setLatencyMs(Math.round(performance.now() - t0));
        const c = classes[0] ?? null;
        setLive(c);
        setNow(Date.now());
        if (!c) return;
        const l = pref("lang", "hi");
        const [st, cap] = await Promise.all([
          api<{ wpm: number; pace: string }>(`/api/class/${c.id}/stats`),
          api<{ captions: { text: string; display: string }[] }>(`/api/class/${c.id}?lang=${l}&limit=1`),
        ]);
        setLiveStats(st);
        setPreview(cap.captions.at(-1) ?? null);
      } catch {}
    };
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, []);

  // Classrooms + recordings
  useEffect(() => {
    api<{ classrooms: Room[] }>("/api/classrooms").then((d) => setRooms(d.classrooms)).catch(() => {});
    api<{ lectures: LectureItem[] }>("/api/lectures").then((d) => setLectures(d.lectures)).catch(() => {});
  }, []);

  // Glossary: key terms from the most recent finished lecture, in my language
  useEffect(() => {
    const latest = lectures.find((l) => l.status === "ready");
    if (!latest) return;
    setTermsLoading(true);
    api<{ notes: { key_terms: Term[] } }>(`/api/lectures/${latest.id}/notes?lang=${lang}`)
      .then((d) => setTerms({ lecture: latest, terms: d.notes.key_terms ?? [] }))
      .catch(() => {})
      .finally(() => setTermsLoading(false));
  }, [lectures, lang]);

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classCode.trim()) return;

    setJoining(true);
    setJoinError("");

    try {
      const data = await api<{ class: { id: string } }>("/api/class/join", {
        json: { code: classCode.trim().toUpperCase(), lang },
      });
      router.push(`/student/live/${data.class.id}`);
    } catch (err) {
      setJoinError((err as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const sendLost = async () => {
    if (!live) return alert("No lecture is live right now.");
    try {
      await api(`/api/class/${live.id}/react`, { json: { kind: "lost" } });
      alert("Anonymous 'I'm Lost' ping sent to the instructor pace monitor!");
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const latestLectureFor = (roomId: string) => lectures.find((l) => l.classroom_id === roomId && l.status === "ready") ?? lectures.find((l) => l.classroom_id === roomId);
  const isToday = (iso?: string | null) => !!iso && new Date(iso).toDateString() === new Date().toDateString();
  const visibleRooms = rooms
    .filter((r) => filter === "all" || r.live_class || lectures.some((l) => l.classroom_id === r.id && isToday(l.created_at)))
    .sort((a, b) => Number(!!b.live_class) - Number(!!a.live_class));
  const liveMins = live ? Math.max(0, Math.floor((now - new Date(live.started_at).getTime()) / 60000)) : 0;
  const paceLabel = !liveStats || liveStats.wpm === 0 ? "Waiting for speech" : `${liveStats.wpm} WPM (${liveStats.pace === "good" ? "Optimal" : liveStats.pace === "too_fast" ? "Too Fast" : "Slow"})`;

  const triggerHapticTest = () => {
    setHapticTested(true);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance("Hearing loop sync and haptic alert verified.");
      window.speechSynthesis.speak(u);
    }
    setTimeout(() => setHapticTested(false), 3000);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 text-[#0F172A]">
      <Navbar title="ClassCaption" subtitle="Assistive Lecture Stream" />

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* 1. Student Profile Header Card */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFF6FF] text-[#1E40AF] text-xs font-bold">
              <GraduationCap className="w-3.5 h-3.5" />
              B.Tech Computer Science • Semester 5
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] text-[#475569] text-xs font-mono font-bold">
              Roll No: 2024CS042
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight font-heading mb-2">
            Namaste, {name}
          </h1>

          <p className="text-sm text-[#475569] leading-relaxed mb-4">
            Your live accessibility channels are synchronized. Captions and translated terminology
            are streaming in Real-time.
          </p>

          <div className="pt-3 border-t border-[#E2E8F0] flex items-center gap-2 text-xs font-semibold text-[#059669]">
            <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
            <span>Live Server Connection: {latencyMs === null ? "Connecting..." : `OK (${latencyMs}ms)`}</span>
          </div>
        </section>

        {/* 2. Hard of Hearing Accommodations Status */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] flex items-center justify-center text-[#1E3A8A]">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                  Accommodations
                </span>
                <h3 className="text-base font-bold text-[#0F172A] font-heading">
                  Hard of Hearing Profile
                </h3>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-[#ECFDF5] text-[#065F46] text-xs font-bold border border-[#A7F3D0]">
              ACTIVE
            </span>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5 text-xs font-medium text-[#0F172A]">
              <CheckCircle2 className="w-4 h-4 text-[#059669] flex-shrink-0" />
              <span>Dynamic Large Captions (24px, Indic Script Native)</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs font-medium text-[#0F172A]">
              <CheckCircle2 className="w-4 h-4 text-[#059669] flex-shrink-0" />
              <span>WCAG AAA Dark Stage Projection with 4.5:1+ Contrast</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs font-medium text-[#0F172A]">
              <CheckCircle2 className="w-4 h-4 text-[#059669] flex-shrink-0" />
              <span>Haptic Auto-Vibrate on teacher speed warning & confusion pings</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
            <button className="flex items-center gap-1.5 font-semibold text-[#1E3A8A] hover:underline">
              <Sliders className="w-3.5 h-3.5" />
              Configure Assistive Presets
            </button>
            <span className="font-mono">Anonymous ID: #8892</span>
          </div>
        </section>

        {/* 3. LIVE RIGHT NOW Card (Emerald Focus Header) */}
        <section className={`bg-white rounded-3xl border-2 overflow-hidden shadow-md ${live ? "border-[#059669]" : "border-[#CBD5E1]"}`}>
          <div className={`${live ? "bg-[#059669]" : "bg-[#64748B]"} text-white px-5 py-3 flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full bg-white ${live ? "animate-live-pulse" : ""}`} />
              <span className="font-extrabold text-xs uppercase tracking-wider">{live ? "LIVE RIGHT NOW" : "NO LIVE LECTURE"}</span>
            </div>
            <span className="text-xs font-bold bg-white/20 px-2.5 py-0.5 rounded-full">
              {live ? `Teacher Pace: ${paceLabel}` : "Checking every few seconds"}
            </span>
          </div>

          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-md bg-[#EFF6FF] text-[#1E40AF] font-bold text-xs">
                {live?.classroom?.subject_code || "LIVE"}
              </span>
              <h2 className="text-xl font-bold text-[#0F172A] font-heading">
                {live ? live.classroom?.name ?? live.title : "Waiting for your teacher"}
              </h2>
            </div>

            <p className="text-sm font-semibold text-[#0F172A] mb-3">
              {live
                ? `Lecture in progress: ${live.title}`
                : "When a teacher starts a class it shows up here. You can also join with the classroom PIN below."}
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] text-[#475569] text-xs font-medium">
                ⏱ {live ? `${liveMins} mins elapsed` : "Not started"}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#EFF6FF] text-[#1E40AF] text-xs font-bold">
                🌐 Live Receiving: {langInfo.name} ({langInfo.native})
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#ECFDF5] text-[#065F46] text-xs font-semibold">
                ⚡ Latency: {latencyMs === null ? "--" : `${latencyMs}ms`}
              </span>
            </div>

            {/* Live Preview Stage */}
            <div className="bg-[#0B0F19] rounded-2xl p-4 mb-4 text-[#F8FAFC]">
              <div className="text-[11px] font-mono text-[#60A5FA] mb-1">
                Live Spoken Audio Caption ({sourceLabel(live?.source_lang)} → {langInfo.name}):
              </div>
              <p className="text-xs text-gray-300 italic mb-2">
                &ldquo;{preview?.text ?? (live ? "Waiting for the teacher to speak..." : "No lecture is live right now.")}&rdquo;
              </p>
              {preview && (
                <p className="text-sm font-semibold text-white">
                  &ldquo;{preview.display}&rdquo;
                </p>
              )}
            </div>

            {/* Action Buttons matching Stitch */}
            <div className="space-y-2.5">
              <Link
                href={`/student/live/${activeLectureId}`}
                className="w-full h-14 bg-[#1E3A8A] hover:bg-[#00236F] text-white font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
              >
                <span>Join Live Lecture Now</span>
                <ArrowRight className="w-5 h-5" />
              </Link>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={sendLost}
                  className="h-12 rounded-xl bg-[#FEF3C7] border-2 border-[#D97706] text-[#92400E] font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-[#FDE68A] transition active:scale-95"
                >
                  <span>❓ I&apos;m Lost (Ping)</span>
                </button>

                <Link
                  href={`/student/live/${activeLectureId}?openSpeak=true`}
                  className="h-12 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-[#DBEAFE] transition active:scale-95"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Speak for Me</span>
                </Link>
              </div>
            </div>

            <p className="text-center text-[11px] text-[#64748B] mt-2.5">
              Single-tap launches full-screen accessible caption viewport.
            </p>
          </div>
        </section>

        {/* 4. Join with Classroom Code or QR */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs">
          <h3 className="text-base font-bold text-[#0F172A] font-heading mb-1">
            Join with Classroom Code or QR
          </h3>
          <p className="text-xs text-[#64748B] mb-4">
            Enter the 6-character room PIN displayed on the lecture hall blackboard or podium tablet.
          </p>

          <form onSubmit={handleJoinByCode} className="space-y-3">
            <div className="relative">
              <input
                type="text"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="E.G. CC-8492"
                className="w-full h-13 px-4 rounded-xl border-2 border-[#CBD5E1] bg-white text-base font-mono font-bold tracking-widest text-[#0F172A] uppercase placeholder:text-[#94A3B8] focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/20 outline-none"
              />
            </div>

            {joinError && (
              <p className="text-xs text-[#DC2626] font-semibold">{joinError}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="submit"
                disabled={joining || !classCode.trim()}
                className="h-12 rounded-xl bg-[#1E3A8A] hover:bg-[#00236F] text-white font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-50 transition active:scale-95"
              >
                <span>{joining ? "Joining..." : "Enter Room →"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  // No camera QR reader yet: fill the PIN of the classroom that is live now.
                  const pin = live?.classroom?.join_code ?? live?.join_code;
                  if (pin) setClassCode(pin);
                  else setJoinError("No class is live right now, so there is no code to scan.");
                }}
                className="h-12 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] hover:bg-[#EFF6FF] text-[#0F172A] font-semibold text-sm flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <QrCode className="w-4 h-4 text-[#1E3A8A]" />
                <span>Scan QR</span>
              </button>
            </div>
          </form>
        </section>

        {/* 5. Hearing Loop / Auracast Sync Status */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#1E3A8A]" />
              <span className="text-sm font-bold text-[#0F172A] font-heading">
                Telecoil / Bluetooth Sync
              </span>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-[#059669]" />
          </div>

          <p className="text-xs text-[#475569] mb-4">
            Campus Broadcast Channel #4 is connected via low-latency Auracast.
          </p>

          <button
            onClick={triggerHapticTest}
            className={`w-full h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition active:scale-95 ${
              hapticTested
                ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]"
                : "bg-white border-[#CBD5E1] text-[#0F172A] hover:bg-[#F1F5F9]"
            }`}
          >
            <Volume2 className="w-4 h-4 text-[#1E3A8A]" />
            <span>{hapticTested ? "Verified! Sound & Haptic OK" : "Run 3-Sec Sound & Haptic Test"}</span>
          </button>
        </section>

        {/* 6. Enrolled Classrooms (Semester V) */}
        <section id="classes" className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#0F172A] font-heading">
                Enrolled Classrooms
              </h2>
              <p className="text-xs text-[#64748B]">
                Courses with synchronized real-time multi-lingual transcriptions and AI smart summaries.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                filter === "all" ? "bg-[#1E3A8A] text-white" : "bg-white text-[#475569] border border-[#E2E8F0]"
              }`}
            >
              All ({rooms.length})
            </button>
            <button
              onClick={() => setFilter("today")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                filter === "today" ? "bg-[#1E3A8A] text-white" : "bg-white text-[#475569] border border-[#E2E8F0]"
              }`}
            >
              Today
            </button>
          </div>

          {visibleRooms.length === 0 && (
            <div className="bg-white rounded-3xl border border-dashed border-[#CBD5E1] p-5 text-center text-xs text-[#475569]">
              {filter === "today" ? "No classes today." : "No classrooms yet. Your teacher creates them from the instructor dashboard."}
            </div>
          )}

          {visibleRooms.map((room) => {
            const lec = latestLectureFor(room.id);
            const roomLectures = lectures.filter((l) => l.classroom_id === room.id);
            return room.live_class ? (
              <div key={room.id} className="bg-white rounded-3xl border-2 border-[#059669]/50 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#065F46] text-xs font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse" />
                    LIVE NOW
                  </span>
                  <span className="text-xs font-mono font-bold text-[#059669]">PIN {room.join_code}</span>
                </div>

                <h3 className="text-lg font-bold text-[#0F172A] font-heading">
                  {room.name}
                </h3>
                <p className="text-xs text-[#475569] mb-3">{room.live_class.title}{room.room ? ` • ${room.room}` : ""}</p>

                <p className="text-xs text-[#64748B] flex items-center gap-1.5 mb-4">
                  <BookOpen className="w-3.5 h-3.5 text-[#1E3A8A]" />
                  <span>{room.lecture_count} recorded lecture{room.lecture_count === 1 ? "" : "s"} with searchable subtitles in every language</span>
                </p>

                <div className="grid grid-cols-3 gap-2">
                  <Link
                    href={`/student/live/${room.live_class.id}`}
                    className="col-span-3 h-11 bg-[#059669] hover:bg-[#047857] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition"
                  >
                    <span>Join Active Stream</span>
                  </Link>
                  <Link
                    href={lec ? `/student/lectures/${lec.id}?tab=notes` : "#"}
                    className={`col-span-2 h-10 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] font-semibold text-xs rounded-xl flex items-center justify-center gap-1 transition ${lec ? "" : "opacity-50 pointer-events-none"}`}
                  >
                    <span>Notes & Quizzes</span>
                  </Link>
                  <button
                    onClick={() => setOpenDetails(openDetails === room.id ? null : room.id)}
                    className="h-10 bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] font-medium text-xs rounded-xl flex items-center justify-center transition"
                  >
                    Details
                  </button>
                </div>
                {openDetails === room.id && <LectureList items={roomLectures} />}
              </div>
            ) : (
              <div key={room.id} className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-[#F1F5F9] text-[#475569] text-xs font-semibold">
                    {room.subject_code || "Classroom"}{room.room ? ` • ${room.room}` : ""}
                  </span>
                  <span className="text-xs font-mono font-bold text-[#1E3A8A]">PIN {room.join_code}</span>
                </div>

                <h3 className="text-base font-bold text-[#0F172A] font-heading">
                  {room.name}
                </h3>

                <p className="text-xs text-[#64748B] flex items-center gap-1.5 mb-4 mt-2">
                  <BookOpen className="w-3.5 h-3.5 text-[#1E3A8A]" />
                  <span>
                    {room.lecture_count} recording{room.lecture_count === 1 ? "" : "s"}
                    {lec ? ` • Latest: ${lec.title}` : ""}
                  </span>
                </p>

                <button
                  onClick={() => setOpenDetails(openDetails === room.id ? null : room.id)}
                  className="w-full h-10 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition"
                >
                  <span>View Lectures & Captions</span>
                </button>
                {openDetails === room.id && <LectureList items={roomLectures} />}
              </div>
            );
          })}
        </section>

        {/* 7. Auto-Captured Technical Terms (Glossary) */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#1E3A8A]" />
              <h3 className="text-base font-bold text-[#0F172A] font-heading">
                Auto-Captured Technical Terms
              </h3>
            </div>
            <Link href={terms ? `/student/lectures/${terms.lecture.id}?tab=notes` : "#"} className="text-xs font-bold text-[#059669] truncate max-w-[45%]">
              {terms ? terms.lecture.title : "Latest Lecture"}
            </Link>
          </div>

          <p className="text-xs text-[#64748B] mb-4">
            1-sentence contextual definitions in {langInfo.name} to assist comprehension during lectures.
          </p>

          <div className="space-y-3">
            {termsLoading && !terms && (
              <p className="text-xs text-[#64748B]">Generating glossary from the latest lecture...</p>
            )}
            {!termsLoading && !terms && (
              <p className="text-xs text-[#64748B]">Terms appear here after your first recorded or finished live lecture.</p>
            )}
            {terms?.terms.slice(0, 5).map((t) => (
              <div key={t.term} className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm text-[#0F172A]">
                    {t.term}
                  </span>
                  <span className="text-[11px] font-mono text-[#64748B]">
                    {new Date(terms.lecture.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-xs text-[#475569]">
                  &ldquo;{t.meaning}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 8. Accessible Onboarding Status Checklist */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs">
          <h3 className="text-base font-bold text-[#0F172A] font-heading mb-1">
            Accessible Onboarding Status
          </h3>
          <p className="text-xs text-[#64748B] mb-4">
            Ensure your hardware is prepared for zero-friction accommodation in lecture theatres.
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                <span className="text-xs font-semibold text-[#0F172A]">
                  IIT Delhi Disability Support Services Verification
                </span>
              </div>
              <span className="text-xs font-bold text-[#059669]">Verified</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                <span className="text-xs font-semibold text-[#0F172A]">
                  Devanagari Font Rendering & Indic Grammar Pack
                </span>
              </div>
              <span className="text-xs font-bold text-[#059669]">Installed</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full border-2 border-[#CBD5E1]" />
                <span className="text-xs font-semibold text-[#0F172A]">
                  Pair Classroom Smart Vibrating Wristband
                </span>
              </div>
              <button
                onClick={triggerHapticTest}
                className="px-2.5 py-1 rounded-lg bg-[#1E3A8A] text-white text-xs font-bold"
              >
                Pair (BLE)
              </button>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E2E8F0] text-center">
            <span className="text-xs text-[#64748B]">
              Need help? Contact DS-Cell Desk{" "}
              <span className="font-bold text-[#1E3A8A]">Toll-Free 1800-IITD-ACCESS</span>
            </span>
          </div>
        </section>
      </main>

      <BottomNav currentTab="home" />
    </div>
  );
}

function LectureList({ items }: { items: LectureItem[] }) {
  if (!items.length) return <p className="text-xs text-[#64748B] mt-3">No recordings in this classroom yet.</p>;
  return (
    <div className="mt-3 space-y-1.5">
      {items.map((l) => (
        <Link
          key={l.id}
          href={`/student/lectures/${l.id}`}
          className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#EFF6FF] text-xs"
        >
          <span className="font-semibold text-[#0F172A] truncate">{l.title}</span>
          <span className="text-[#64748B] flex-shrink-0">{l.status === "ready" ? new Date(l.created_at).toLocaleDateString() : l.status}</span>
        </Link>
      ))}
    </div>
  );
}
