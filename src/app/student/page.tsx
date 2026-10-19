"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navigation/Navbar";
import { BottomNav } from "@/components/navigation/BottomNav";
import { api, pref, setPref, sourceLabel } from "@/lib/client/api";
import { LANGUAGES } from "@/lib/languages";
import { Sparkles, Volume2, QrCode, ArrowRight, BookOpen, Radio, LogOut, ShieldCheck, Video } from "lucide-react";

type Room = {
  id: string;
  name: string;
  subject_code: string | null;
  room: string | null;
  teacher: { name: string; institution: string | null } | null;
  live_class: { id: string; title: string; started_at: string } | null;
  lecture_count: number;
};
type LectureItem = { id: string; title: string; status: string; source: string; duration_s: number | null; created_at: string; classroom_id: string | null };
type Term = { term: string; meaning: string };
type Home = { student: { name: string } | null; classrooms: Room[]; lectures: LectureItem[] };

export default function StudentHomePage() {
  const router = useRouter();
  const [home, setHome] = useState<Home | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ text: string; display: string; source_lang: string } | null>(null);
  const [terms, setTerms] = useState<{ lecture: LectureItem; terms: Term[] } | null>(null);
  const [termsLoading, setTermsLoading] = useState(false);
  const [lang, setLang] = useState("hi");
  const [pin, setPin] = useState("");
  const [openDetails, setOpenDetails] = useState<string | null>(null);
  const [tested, setTested] = useState(false);
  const [now, setNow] = useState(Date.now());

  const langInfo = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
  const live = home?.classrooms.find((r) => r.live_class) ?? null;

  useEffect(() => {
    setLang(pref("lang", "hi"));
  }, []);

  // My classrooms (only the ones this device joined with a PIN), refreshed so a class going live shows up.
  useEffect(() => {
    const load = async () => {
      try {
        const t0 = performance.now();
        const d = await api<Home>("/api/student/home");
        setLatencyMs(Math.round(performance.now() - t0));
        setHome(d);
        setNow(Date.now());
      } catch {}
    };
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, []);

  // Latest caption of the live class, in my language
  const liveId = live?.live_class?.id;
  useEffect(() => {
    if (!liveId) return setPreview(null);
    api<{ class: { source_lang: string }; captions: { text: string; display: string }[] }>(`/api/class/${liveId}?lang=${lang}&limit=1`)
      .then((d) => setPreview(d.captions.at(-1) ? { ...d.captions.at(-1)!, source_lang: d.class.source_lang } : null))
      .catch(() => {});
  }, [liveId, lang, now]);

  // Glossary: key terms from the most recent finished lecture, in my language
  const latestReady = home?.lectures.find((l) => l.status === "ready");
  useEffect(() => {
    if (!latestReady) return;
    setTermsLoading(true);
    api<{ notes: { key_terms: Term[] } }>(`/api/lectures/${latestReady.id}/notes?lang=${lang}`)
      .then((d) => setTerms({ lecture: latestReady, terms: d.notes.key_terms ?? [] }))
      .catch(() => {})
      .finally(() => setTermsLoading(false));
  }, [latestReady?.id, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeLang = (code: string) => {
    setLang(code);
    setPref("lang", code);
  };

  const sendLost = async () => {
    if (!liveId) return;
    try {
      await api(`/api/class/${liveId}/react`, { json: { kind: "lost" } });
      alert("Sent. Your teacher sees an anonymous \"I'm lost\" tap.");
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const testOutput = () => {
    setTested(true);
    if ("vibrate" in navigator) navigator.vibrate([100, 50, 100]);
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance("Sound check. If you can hear this, read-aloud works on this device.");
      u.lang = langInfo.speech ?? "en-IN";
      window.speechSynthesis.speak(u);
    }
    setTimeout(() => setTested(false), 3000);
  };

  const leave = async () => {
    if (!confirm("Leave all classrooms on this device? You will need the PIN again to rejoin.")) return;
    await api("/api/auth/logout", { json: { as: "student" } }).catch(() => {});
    router.replace("/join");
  };

  const liveMins = live?.live_class ? Math.max(0, Math.floor((now - new Date(live.live_class.started_at).getTime()) / 60000)) : 0;
  const name = home?.student?.name;
  const roomName = (id: string | null) => home?.classrooms.find((r) => r.id === id)?.name ?? "";

  if (home && !home.classrooms.length) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] pb-24 text-[#0F172A]">
        <Navbar title="ClassCaption" subtitle="Assistive Lecture Stream" />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs text-center space-y-3">
            <h1 className="text-2xl font-extrabold font-heading">{name ? `Namaste, ${name}` : "Welcome to ClassCaption"}</h1>
            <p className="text-sm text-[#475569]">Join your first class with the PIN or QR code your teacher shows on the screen.</p>
            <Link href="/join" className="inline-flex h-12 px-6 rounded-2xl bg-[#1E3A8A] text-white font-extrabold text-sm items-center gap-2">
              <QrCode className="w-4 h-4" />
              Join a class
            </Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 text-[#0F172A]">
      <Navbar title="ClassCaption" subtitle="Assistive Lecture Stream" />

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* 1. Greeting */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight font-heading mb-2">
            {name ? `Namaste, ${name}` : " "}
          </h1>
          <p className="text-sm text-[#475569] leading-relaxed mb-4">
            {home
              ? `You're in ${home.classrooms.length} classroom${home.classrooms.length === 1 ? "" : "s"}. Captions arrive in ${langInfo.name} (${langInfo.native}).`
              : "Loading your classes..."}
          </p>
          <div className="pt-3 border-t border-[#E2E8F0] flex items-center gap-2 text-xs font-semibold text-[#059669]">
            <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
            <span>Server: {latencyMs === null ? "Connecting..." : `connected (${latencyMs} ms)`}</span>
          </div>
        </section>

        {/* 2. Live right now */}
        <section className={`bg-white rounded-3xl border-2 overflow-hidden shadow-md ${live ? "border-[#059669]" : "border-[#CBD5E1]"}`}>
          <div className={`${live ? "bg-[#059669]" : "bg-[#64748B]"} text-white px-5 py-3 flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full bg-white ${live ? "animate-live-pulse" : ""}`} />
              <span className="font-extrabold text-xs uppercase tracking-wider">{live ? "LIVE RIGHT NOW" : "NO LIVE LECTURE"}</span>
            </div>
            <span className="text-xs font-bold bg-white/20 px-2.5 py-0.5 rounded-full">
              {live ? `${liveMins} min in` : "Checking every few seconds"}
            </span>
          </div>

          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              {live?.subject_code && (
                <span className="px-2.5 py-0.5 rounded-md bg-[#EFF6FF] text-[#1E40AF] font-bold text-xs">{live.subject_code}</span>
              )}
              <h2 className="text-xl font-bold text-[#0F172A] font-heading">{live ? live.name : "Waiting for your teacher"}</h2>
            </div>
            <p className="text-sm font-semibold text-[#475569] mb-4">
              {live
                ? `${live.live_class!.title}${live.teacher ? ` • ${live.teacher.name}` : ""}`
                : "When one of your teachers starts a class, it shows up here."}
            </p>

            {live && (
              <>
                <div className="bg-[#0B0F19] rounded-2xl p-4 mb-4 text-[#F8FAFC]">
                  <div className="text-[11px] font-mono text-[#60A5FA] mb-1">
                    Latest caption ({sourceLabel(preview?.source_lang)} → {langInfo.name}):
                  </div>
                  {preview ? (
                    <>
                      <p className="text-xs text-gray-300 italic mb-2">&ldquo;{preview.text}&rdquo;</p>
                      <p className="text-sm font-semibold text-white">&ldquo;{preview.display}&rdquo;</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-300 italic">Waiting for the teacher to speak...</p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <Link
                    href={`/student/live/${live.live_class!.id}`}
                    className="w-full h-14 bg-[#1E3A8A] hover:bg-[#00236F] text-white font-extrabold text-base rounded-2xl flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
                  >
                    <span>Open Live Captions</span>
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={sendLost}
                      className="h-12 rounded-xl bg-[#FEF3C7] border-2 border-[#D97706] text-[#92400E] font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-[#FDE68A] transition active:scale-95"
                    >
                      ❓ I&apos;m Lost (anonymous)
                    </button>
                    <Link
                      href={`/student/live/${live.live_class!.id}?openSpeak=true`}
                      className="h-12 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-[#DBEAFE] transition active:scale-95"
                    >
                      <Volume2 className="w-4 h-4" />
                      Speak for Me
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* 3. Join another class */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs">
          <h3 className="text-base font-bold text-[#0F172A] font-heading mb-1">Join another class</h3>
          <p className="text-xs text-[#64748B] mb-4">Enter the 6-character PIN on your teacher&apos;s screen, or scan their QR code with your camera.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/join?pin=${pin}`);
            }}
            className="grid grid-cols-[1fr_auto] gap-2"
          >
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              placeholder="PIN"
              aria-label="Classroom PIN"
              className="h-12 px-4 rounded-xl border-2 border-[#CBD5E1] bg-white text-base font-mono font-bold tracking-widest uppercase placeholder:text-[#94A3B8] focus:border-[#1E3A8A] outline-none"
            />
            <button type="submit" className="h-12 px-5 rounded-xl bg-[#1E3A8A] hover:bg-[#00236F] text-white font-bold text-sm flex items-center gap-1.5">
              <QrCode className="w-4 h-4" />
              Join
            </button>
          </form>
        </section>

        {/* 4. My classrooms */}
        <section id="classes" className="space-y-3 pt-2 scroll-mt-20">
          <h2 className="text-lg font-bold text-[#0F172A] font-heading">My Classrooms</h2>
          {home?.classrooms.map((room) => {
            const roomLectures = home.lectures.filter((l) => l.classroom_id === room.id);
            return (
              <div key={room.id} className={`bg-white rounded-3xl border p-5 shadow-xs ${room.live_class ? "border-2 border-[#059669]/50" : "border-[#E2E8F0]"}`}>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-[#F1F5F9] text-[#475569] text-xs font-semibold">
                    {room.subject_code || "Classroom"}
                    {room.room ? ` • ${room.room}` : ""}
                  </span>
                  {room.live_class && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#065F46] text-xs font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse" />
                      LIVE NOW
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-[#0F172A] font-heading">{room.name}</h3>
                {room.teacher && (
                  <p className="text-xs text-[#475569]">
                    {room.teacher.name}
                    {room.teacher.institution ? ` • ${room.teacher.institution}` : ""}
                  </p>
                )}
                <p className="text-xs text-[#64748B] flex items-center gap-1.5 mt-2 mb-3">
                  <BookOpen className="w-3.5 h-3.5 text-[#1E3A8A]" />
                  {room.lecture_count} recorded lecture{room.lecture_count === 1 ? "" : "s"} with subtitles and notes
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {room.live_class ? (
                    <Link href={`/student/live/${room.live_class.id}`} className="h-10 bg-[#059669] hover:bg-[#047857] text-white font-bold text-xs rounded-xl flex items-center justify-center">
                      Open Live Captions
                    </Link>
                  ) : (
                    <Link href={`/student/live/classroom-${room.id}`} className="h-10 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] font-bold text-xs rounded-xl flex items-center justify-center">
                      Wait for next class
                    </Link>
                  )}
                  <button
                    onClick={() => setOpenDetails(openDetails === room.id ? null : room.id)}
                    className="h-10 bg-[#F8FAFC] border border-[#E2E8F0] text-[#475569] font-semibold text-xs rounded-xl"
                  >
                    {openDetails === room.id ? "Hide lectures" : "Lectures"}
                  </button>
                </div>
                {openDetails === room.id && <LectureList items={roomLectures} />}
              </div>
            );
          })}
        </section>

        {/* 5. Recent recordings */}
        <section id="recordings" className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs scroll-mt-20">
          <div className="flex items-center gap-2 mb-1">
            <Video className="w-4 h-4 text-[#1E3A8A]" />
            <h3 className="text-base font-bold text-[#0F172A] font-heading">Recent Lectures</h3>
          </div>
          <p className="text-xs text-[#64748B] mb-3">Subtitles, AI notes, a quiz and Ask-the-lecture, in your language.</p>
          <LectureList items={(home?.lectures ?? []).slice(0, 6)} label={(l) => roomName(l.classroom_id)} />
        </section>

        {/* 6. Glossary */}
        <section id="glossary" className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs scroll-mt-20">
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#1E3A8A]" />
              <h3 className="text-base font-bold text-[#0F172A] font-heading">Key Terms</h3>
            </div>
            {terms && (
              <Link href={`/student/lectures/${terms.lecture.id}?tab=notes`} className="text-xs font-bold text-[#059669] truncate max-w-[50%]">
                {terms.lecture.title}
              </Link>
            )}
          </div>
          <p className="text-xs text-[#64748B] mb-4">Technical terms from your latest lecture, explained in {langInfo.name}.</p>
          <div className="space-y-3">
            {termsLoading && !terms && <p className="text-xs text-[#64748B]">Preparing the glossary...</p>}
            {!termsLoading && !terms && <p className="text-xs text-[#64748B]">Terms appear here after your first finished lecture.</p>}
            {terms?.terms.slice(0, 6).map((t) => (
              <div key={t.term} className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <span className="font-bold text-sm text-[#0F172A] block mb-1">{t.term}</span>
                <p className="text-xs text-[#475569]">{t.meaning}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 7. Profile & accessibility */}
        <section id="profile" className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-4 scroll-mt-20">
          <h3 className="text-base font-bold text-[#0F172A] font-heading">This device</h3>
          <div>
            <label htmlFor="lang" className="text-xs font-bold uppercase tracking-wider text-[#475569] block mb-1">Caption language</label>
            <select
              id="lang"
              value={lang}
              onChange={(e) => changeLang(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.native})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={testOutput}
            className={`w-full h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition active:scale-95 ${
              tested ? "bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]" : "bg-white border-[#CBD5E1] text-[#0F172A] hover:bg-[#F1F5F9]"
            }`}
          >
            <Volume2 className="w-4 h-4 text-[#1E3A8A]" />
            {tested ? "Playing sound check..." : "Test read-aloud and vibration"}
          </button>
          <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between gap-2 text-xs text-[#64748B]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#059669]" />
              Signed in as {name ?? "..."} on this device
            </span>
            <button onClick={leave} className="font-bold text-[#64748B] hover:text-[#DC2626] flex items-center gap-1">
              <LogOut className="w-3.5 h-3.5" />
              Leave
            </button>
          </div>
        </section>
      </main>

      <BottomNav currentTab="home" />
    </div>
  );
}

function LectureList({ items, label }: { items: LectureItem[]; label?: (l: LectureItem) => string }) {
  if (!items.length) return <p className="text-xs text-[#64748B] mt-3">No recordings yet.</p>;
  return (
    <div className="mt-3 space-y-1.5">
      {items.map((l) => (
        <Link
          key={l.id}
          href={`/student/lectures/${l.id}`}
          className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#EFF6FF] text-xs"
        >
          <span className="min-w-0">
            <span className="font-semibold text-[#0F172A] truncate block">{l.title}</span>
            {label && <span className="text-[#64748B] truncate block">{label(l)}</span>}
          </span>
          <span className="text-[#64748B] flex-shrink-0">{l.status === "ready" ? new Date(l.created_at).toLocaleDateString() : l.status}</span>
        </Link>
      ))}
    </div>
  );
}
