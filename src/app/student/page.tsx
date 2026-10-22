"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navigation/Navbar";
import { BottomNav } from "@/components/navigation/BottomNav";
import { api, pref, setPref, sourceLabel } from "@/lib/client/api";
import { LANGUAGES } from "@/lib/languages";
import { Sparkles, Volume2, QrCode, HelpCircle, ArrowRight, BookOpen, LogOut, ShieldCheck, Video, Search, FileText, ListChecks, MessageCircleQuestion, UserPlus } from "lucide-react";

type Room = {
  id: string;
  name: string;
  subject_code: string | null;
  room: string | null;
  teacher: { name: string; institution: string | null } | null;
  live_class: { id: string; title: string; started_at: string } | null;
  lecture_count: number;
};
type LectureItem = {
  id: string;
  title: string;
  status: string;
  source: string;
  duration_s: number | null;
  created_at: string;
  classroom_id: string | null;
  quiz?: { best: number; total: number } | null; // my best saved quiz score (student accounts)
};
type Term = { term: string; meaning: string };
type Home = {
  student: { name: string; account: boolean; email: string | null; roll_no: string | null } | null;
  classrooms: Room[];
  lectures: LectureItem[];
};

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

  const account = !!home?.student?.account;
  const leave = async () => {
    const msg = account
      ? "Sign out on this device? Your classes and lectures stay in your account."
      : "Leave all classrooms on this device? You will need the PIN again to rejoin.";
    if (!confirm(msg)) return;
    await api("/api/auth/logout", { json: { as: "student" } }).catch(() => {});
    router.replace(account ? "/student/login" : "/join");
  };

  const liveMins = live?.live_class ? Math.max(0, Math.floor((now - new Date(live.live_class.started_at).getTime()) / 60000)) : 0;
  const name = home?.student?.name;

  if (home && !home.classrooms.length) {
    return (
      <div className="min-h-screen bg-paper pb-24 text-ink">
        <Navbar title="ClassCaption" subtitle="Your classes" />
        <main className="max-w-2xl mx-auto px-4 py-8">
          <section className="cc-card p-6 text-center space-y-3">
            <h1 className="text-3xl font-normal">{name ? `Namaste, ${name}` : "Welcome to ClassCaption"}</h1>
            <p className="text-sm text-ink-2">Join your first class with the PIN or QR code your teacher shows on the screen.</p>
            <Link href="/join" className="cc-btn cc-btn-primary inline-flex h-12 px-6 text-sm items-center gap-2">
              <QrCode className="w-4 h-4" />
              Join a class
            </Link>
            {!home.student?.account && (
              <p className="text-xs text-ink-3">
                Already have a student account? <Link href="/student/login" className="font-bold text-neel hover:underline">Sign in</Link> to see your classes and past lectures.
              </p>
            )}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper pb-24 text-ink">
      <Navbar title="ClassCaption" subtitle="Your classes" />

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* 1. Greeting */}
        <section className="pt-2 pb-1">
          <p className="font-[family-name:var(--font-tiro-deva)] text-sindoor text-lg leading-none mb-1" lang="hi">नमस्ते</p>
          <h1 className="text-3xl sm:text-4xl font-normal tracking-tight mb-2">
            {name ? name : "\u00a0"}
          </h1>
          <p className="text-[15px] text-ink-2 leading-relaxed">
            {home ? (
              <>
                You&apos;re in {home.classrooms.length} classroom{home.classrooms.length === 1 ? "" : "s"}. Captions arrive in{" "}
                <span className="font-semibold text-ink">{langInfo.name}</span> <span lang={langInfo.code}>({langInfo.native})</span>.
              </>
            ) : (
              "Loading your classes..."
            )}
          </p>
          <p className="mt-2 flex items-center gap-2 text-xs text-ink-3">
            <span className="w-1.5 h-1.5 rounded-full bg-patta animate-pulse" />
            {latencyMs === null ? "Connecting..." : `Connected · ${latencyMs} ms`}
          </p>
        </section>

        {/* 2. Live right now */}
        {live ? (
          <section className="cc-board overflow-hidden">
            <div className="px-5 pt-5 flex items-center justify-between gap-2">
              <span className="cc-stamp text-chalk-pink">
                <span className="w-1.5 h-1.5 rounded-full bg-chalk-pink animate-live-pulse" />
                Live now
              </span>
              <span className="font-mono text-xs text-chalk-dim">{liveMins} min in</span>
            </div>
            <div className="px-5 pt-3 pb-5">
              <h2 className="text-2xl font-normal text-chalk leading-tight">
                {live.name}
                {live.subject_code && <span className="ml-2 align-middle font-mono text-xs text-chalk-blue">{live.subject_code}</span>}
              </h2>
              <p className="text-sm text-chalk-dim mt-1 mb-4">
                {live.live_class!.title}
                {live.teacher ? ` · ${live.teacher.name}` : ""}
              </p>

              <div className="border-l-2 border-chalk-blue/50 pl-3 mb-5">
                <div className="text-[11px] font-mono text-chalk-blue mb-1">
                  {sourceLabel(preview?.source_lang)} → {langInfo.name}
                </div>
                {preview ? (
                  <>
                    <p className="font-heading italic text-sm text-chalk/60 mb-1">&ldquo;{preview.text}&rdquo;</p>
                    <p lang={lang} className="text-lg text-chalk leading-snug">{preview.display}</p>
                  </>
                ) : (
                  <p className="font-heading italic text-sm text-chalk-dim">Waiting for the teacher to speak...</p>
                )}
              </div>

              <Link href={`/student/live/${live.live_class!.id}`} className="cc-btn cc-btn-haldi w-full h-13 text-base">
                Open live captions
                <ArrowRight className="w-5 h-5" />
              </Link>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  onClick={sendLost}
                  className="h-11 rounded-[10px] border border-board-line text-chalk text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-white/5 transition"
                >
                  <HelpCircle className="w-4 h-4 text-chalk-yellow" />
                  I&apos;m lost
                </button>
                <Link
                  href={`/student/live/${live.live_class!.id}?openSpeak=true`}
                  className="h-11 rounded-[10px] border border-board-line text-chalk text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-white/5 transition"
                >
                  <Volume2 className="w-4 h-4 text-chalk-blue" />
                  Speak for me
                </Link>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-card border border-dashed border-rule-strong px-5 py-6 text-center cc-kolam">
            <p className="cc-eyebrow mb-1">No live lecture</p>
            <p className="text-sm text-ink-2">When one of your teachers starts a class, it shows up here. Checking every few seconds.</p>
          </section>
        )}

        {/* 3. Join another class */}
        <section className="cc-card p-5">
          <h3 className="text-lg font-medium mb-0.5">Join another class</h3>
          <p className="text-sm text-ink-3 mb-4">Enter the 6-character PIN on your teacher&apos;s screen, or scan their QR code.</p>
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
              className="cc-input min-w-0 h-12 px-4 text-lg font-mono font-bold tracking-[0.3em] uppercase placeholder:tracking-normal placeholder:normal-case"
            />
            <button type="submit" className="cc-btn cc-btn-primary h-12 px-5 text-sm">
              <QrCode className="w-4 h-4" />
              Join
            </button>
          </form>
        </section>

        {/* 4. My classrooms */}
        <section id="classes" className="space-y-3 pt-2 scroll-mt-20">
          <h2 className="cc-eyebrow px-0.5">My classrooms</h2>
          {home?.classrooms.map((room) => {
            const roomLectures = home.lectures.filter((l) => l.classroom_id === room.id);
            return (
              <div key={room.id} className={`cc-card p-5 ${room.live_class ? "!border-sindoor-line" : ""}`}>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <span className="font-mono text-xs text-ink-3">
                    {room.subject_code || "Classroom"}
                    {room.room ? ` • ${room.room}` : ""}
                  </span>
                  {room.live_class && (
                    <span className="cc-stamp text-sindoor">
                      <span className="w-1.5 h-1.5 rounded-full bg-sindoor animate-live-pulse" />
                      Live
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-medium">{room.name}</h3>
                {room.teacher && (
                  <p className="text-xs text-ink-2">
                    {room.teacher.name}
                    {room.teacher.institution ? ` • ${room.teacher.institution}` : ""}
                  </p>
                )}
                <p className="text-xs text-ink-3 flex items-center gap-1.5 mt-2 mb-3">
                  <BookOpen className="w-3.5 h-3.5 text-neel" />
                  {room.lecture_count} recorded lecture{room.lecture_count === 1 ? "" : "s"} with subtitles and notes
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {room.live_class ? (
                    <Link href={`/student/live/${room.live_class.id}`} className="cc-btn cc-btn-primary h-10 text-xs flex items-center justify-center">
                      Open Live Captions
                    </Link>
                  ) : (
                    <Link href={`/student/live/classroom-${room.id}`} className="cc-btn h-10 text-xs">
                      Wait for next class
                    </Link>
                  )}
                  <button
                    onClick={() => setOpenDetails(openDetails === room.id ? null : room.id)}
                    className="cc-btn h-10 text-xs"
                  >
                    {openDetails === room.id ? "Hide lectures" : "Lectures"}
                  </button>
                </div>
                {openDetails === room.id && <LectureList items={roomLectures} />}
              </div>
            );
          })}
        </section>

        {/* 5. Lecture library: every past lecture of my classrooms */}
        <section id="recordings" className="cc-card p-6 scroll-mt-20">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-neel" />
              <h3 className="text-lg font-medium">My lectures</h3>
            </div>
            <span className="text-xs font-bold text-ink-3">{home?.lectures.length ?? 0} total</span>
          </div>
          <p className="text-xs text-ink-3 mb-3">Every class you attended or missed: AI notes and summary, a quiz, and Ask-the-lecture, in {langInfo.name}.</p>
          <LectureLibrary lectures={home?.lectures ?? []} rooms={home?.classrooms ?? []} />
        </section>

        {/* 6. Glossary */}
        <section id="glossary" className="cc-card p-6 scroll-mt-20">
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-neel" />
              <h3 className="text-lg font-medium">Key terms</h3>
            </div>
            {terms && (
              <Link href={`/student/lectures/${terms.lecture.id}?tab=notes`} className="text-xs font-bold text-patta truncate max-w-[50%]">
                {terms.lecture.title}
              </Link>
            )}
          </div>
          <p className="text-xs text-ink-3 mb-4">Technical terms from your latest lecture, explained in {langInfo.name}.</p>
          <div className="space-y-3">
            {termsLoading && !terms && <p className="text-xs text-ink-3">Preparing the glossary...</p>}
            {!termsLoading && !terms && <p className="text-xs text-ink-3">Terms appear here after your first finished lecture.</p>}
            {terms?.terms.slice(0, 6).map((t) => (
              <div key={t.term} className="p-3.5 rounded-xl bg-paper border border-rule">
                <span className="font-bold text-sm text-ink block mb-1">{t.term}</span>
                <p className="text-xs text-ink-2">{t.meaning}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 7. Profile & accessibility */}
        <section id="profile" className="cc-card p-6 space-y-4 scroll-mt-20">
          <h3 className="text-lg font-medium">{account ? "My account" : "This device"}</h3>
          {account ? (
            <p className="text-xs text-ink-2">
              {home?.student?.email}
              {home?.student?.roll_no ? ` · Roll no. ${home.student.roll_no}` : ""}. Your classes and lectures show up on every device you sign in on.
            </p>
          ) : (
            <Link
              href="/student/login?mode=signup"
              className="flex items-center gap-3 p-3.5 rounded-xl bg-neel-wash border border-neel-line text-neel hover:bg-neel-wash"
            >
              <UserPlus className="w-5 h-5 flex-shrink-0" />
              <span className="text-xs">
                <span className="font-bold block">Create a student account</span>
                Keep these classes and every past lecture on your phone and laptop. Takes 20 seconds.
              </span>
            </Link>
          )}
          <div>
            <label htmlFor="lang" className="cc-eyebrow block mb-1.5">Caption language</label>
            <select
              id="lang"
              value={lang}
              onChange={(e) => changeLang(e.target.value)}
              className="cc-input w-full h-11 px-3 text-sm"
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
              tested ? "bg-patta-wash border-patta-line text-patta-deep" : "bg-card border-rule-strong text-ink hover:bg-paper-2"
            }`}
          >
            <Volume2 className="w-4 h-4 text-neel" />
            {tested ? "Playing sound check..." : "Test read-aloud and vibration"}
          </button>
          <div className="pt-3 border-t border-rule flex items-center justify-between gap-2 text-xs text-ink-3">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-patta" />
              {account ? `Signed in as ${name ?? "..."}` : `Joined as ${name ?? "..."} on this device`}
            </span>
            <button onClick={leave} className="font-bold text-ink-3 hover:text-sindoor flex items-center gap-1">
              <LogOut className="w-3.5 h-3.5" />
              {account ? "Sign out" : "Leave"}
            </button>
          </div>
        </section>
      </main>

      <BottomNav currentTab="home" />
    </div>
  );
}

const fmtDuration = (s: number | null) => (s ? `${Math.max(1, Math.round(s / 60))} min` : "");

/** Every lecture of my classrooms, searchable and filterable by classroom, with one tap to notes, quiz or Ask. */
function LectureLibrary({ lectures, rooms }: { lectures: LectureItem[]; rooms: Room[] }) {
  const [q, setQ] = useState("");
  const [room, setRoom] = useState<string>("all");
  const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.name ?? "";
  const shown = lectures.filter(
    (l) => (room === "all" || l.classroom_id === room) && (!q.trim() || `${l.title} ${roomName(l.classroom_id)}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  if (!lectures.length) return <p className="text-xs text-ink-3 mt-3">No lectures yet. They appear here as soon as your teacher ends a live class or uploads a recording.</p>;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 text-ink-4 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search lectures"
          aria-label="Search lectures"
          className="cc-input w-full h-10 pl-9 pr-3 text-sm"
        />
      </div>
      {rooms.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {[{ id: "all", name: "All classes" }, ...rooms].map((r) => (
            <button
              key={r.id}
              onClick={() => setRoom(r.id)}
              className={`h-8 px-3 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                room === r.id ? "bg-neel text-white border-neel" : "bg-card text-ink-2 border-rule-strong hover:bg-paper-2"
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
      {!shown.length && <p className="text-xs text-ink-3">No lectures match.</p>}
      <div className="space-y-2">
        {shown.map((l) => {
          const ready = l.status === "ready";
          const href = `/student/lectures/${l.id}`;
          return (
            <div key={l.id} className="p-3.5 rounded-xl border border-rule bg-paper">
              <Link href={href} className="block min-w-0 group">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-ink group-hover:text-neel truncate">{l.title}</span>
                  {l.quiz && (
                    <span
                      className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        l.quiz.best === l.quiz.total ? "bg-patta-wash text-patta-deep" : "bg-haldi-wash text-haldi-ink"
                      }`}
                    >
                      Quiz {l.quiz.best}/{l.quiz.total}
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-ink-3 truncate block">
                  {[roomName(l.classroom_id), new Date(l.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }), fmtDuration(l.duration_s), l.source === "live" ? "Live class" : "Recording"]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
              {ready ? (
                <div className="grid grid-cols-3 gap-1.5 mt-2.5">
                  <Link href={`${href}?tab=notes`} className="h-8 rounded-lg bg-card border border-rule-strong text-[11px] font-bold text-ink hover:bg-neel-wash flex items-center justify-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-neel" /> Notes
                  </Link>
                  <Link href={`${href}?tab=quiz`} className="h-8 rounded-lg bg-card border border-rule-strong text-[11px] font-bold text-ink hover:bg-neel-wash flex items-center justify-center gap-1">
                    <ListChecks className="w-3.5 h-3.5 text-neel" /> Quiz
                  </Link>
                  <Link href={`${href}?tab=ask`} className="h-8 rounded-lg bg-card border border-rule-strong text-[11px] font-bold text-ink hover:bg-neel-wash flex items-center justify-center gap-1">
                    <MessageCircleQuestion className="w-3.5 h-3.5 text-neel" /> Ask
                  </Link>
                </div>
              ) : (
                <p className="text-[11px] text-haldi-deep font-semibold mt-1.5">{l.status === "failed" ? "Processing failed" : "Preparing transcript and notes..."}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LectureList({ items }: { items: LectureItem[] }) {
  if (!items.length) return <p className="text-xs text-ink-3 mt-3">No lectures yet.</p>;
  return (
    <div className="mt-3 space-y-1.5">
      {items.map((l) => (
        <Link
          key={l.id}
          href={`/student/lectures/${l.id}`}
          className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-rule bg-paper hover:bg-neel-wash text-xs"
        >
          <span className="font-semibold text-ink truncate min-w-0">{l.title}</span>
          <span className="text-ink-3 flex-shrink-0">{l.status === "ready" ? new Date(l.created_at).toLocaleDateString() : l.status}</span>
        </Link>
      ))}
    </div>
  );
}
