"use client";

import { use, useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navigation/Navbar";
import { BottomNav } from "@/components/navigation/BottomNav";
import { LanguageSelector } from "@/components/live/LanguageSelector";
import { TermModal } from "@/components/live/TermModal";
import { SpeakForMeModal } from "@/components/live/SpeakForMeModal";
import { AskQuestionModal } from "@/components/live/AskQuestionModal";
import { createClient } from "@/lib/supabase/client";
import { LanguageCode, LANGUAGES } from "@/lib/languages";
import { api, isUuid, needsAuth, pref, setPref, sourceLabel, speak as speakAloud, techTerms } from "@/lib/client/api";
import {
  Volume2,
  Sparkles,
  HelpCircle,
  MessageSquarePlus,
  Radio,
  Wifi,
  SunMoon,
} from "lucide-react";

interface LiveCaptionEvent {
  seq: number;
  sourceText: string;
  sourceLanguage: string;
  translations: Record<string, string>;
  timestamp: number;
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

type CaptionRow = { seq: number; text: string; translations: Record<string, string>; display?: string; created_at: string };

type ClassEvent =
  | { kind: "announcement"; payload: { text: string; translations: Record<string, string> } }
  | { kind: "board"; payload: { board: Board; translations: Record<string, string[]> } }
  | { kind: "ended"; payload: { lecture_id: string } };

type Board = {
  title: string;
  text: string;
  equations: { latex: string; spoken: string }[];
  diagrams: { description: string }[];
  explanation: string;
};

/** The teacher's board scan in my language (the server translates it for every language in the class). */
function boardIn(p: { board: Board; translations: Record<string, string[]> }, lang: string): Board {
  const t = p.translations?.[lang];
  if (!t) return p.board;
  const nd = p.board.diagrams.length;
  return {
    ...p.board,
    explanation: t[0] ?? p.board.explanation,
    diagrams: p.board.diagrams.map((d, i) => ({ description: t[1 + i] ?? d.description })),
    equations: p.board.equations.map((e, i) => ({ ...e, spoken: t[1 + nd + i] ?? e.spoken })),
  };
}

const toEvent = (c: CaptionRow, lang: string): LiveCaptionEvent => ({
  seq: c.seq,
  sourceText: c.text,
  sourceLanguage: "source",
  translations: { ...(c.translations ?? {}), ...(c.display ? { [lang]: c.display } : {}) },
  timestamp: new Date(c.created_at).getTime(),
});

function StudentLiveLectureContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ lectureId: string }>;
}) {
  const { lectureId } = use(paramsPromise);
  const searchParams = useSearchParams();
  const router = useRouter();

  const [classId, setClassId] = useState<string | null>(isUuid(lectureId) ? lectureId : null);
  const [cls, setCls] = useState<ClassInfo | null>(null);
  const [waitingMsg, setWaitingMsg] = useState("");
  const [selectedLang, setSelectedLang] = useState<LanguageCode>("hi");
  const [autoScroll, setAutoScroll] = useState(true);
  const [highContrast, setHighContrast] = useState(true);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [announcement, setAnnouncement] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [studentName, setStudentName] = useState("");
  const [needJoin, setNeedJoin] = useState(false);

  // Live Captions Feed State
  const [captions, setCaptions] = useState<LiveCaptionEvent[]>([]);

  const [activeSpokenText, setActiveSpokenText] = useState("Waiting for the teacher to speak...");

  // Modals state
  const [termModalOpen, setTermModalOpen] = useState(false);
  const [activeTerm, setActiveTerm] = useState("");
  const [activeTranslatedTerm, setActiveTranslatedTerm] = useState("");
  const [activeTermDef, setActiveTermDef] = useState("");

  const [speakModalOpen, setSpeakModalOpen] = useState(searchParams?.get("openSpeak") === "true");
  const [askModalOpen, setAskModalOpen] = useState(false);
  const [lostFeedbackSent, setLostFeedbackSent] = useState(false);

  const captionsEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);
  const langRef = useRef<string>("hi");
  const lastSeqRef = useRef<number>(-1);

  useEffect(() => {
    const l = pref("lang", "hi");
    langRef.current = l;
    setSelectedLang(l);
  }, []);

  // A classroom link ("classroom-<id>") waits here until the teacher goes live.
  useEffect(() => {
    if (classId) return;
    let stop = false;
    const roomId = lectureId.startsWith("classroom-") ? lectureId.slice("classroom-".length) : "";
    if (!isUuid(roomId)) {
      setNeedJoin(true);
      return;
    }
    const find = async () => {
      try {
        const { live_class } = await api<{ live_class: { id: string } | null }>(`/api/classrooms/${roomId}/live`);
        if (live_class) return setClassId(live_class.id);
        setWaitingMsg("Your class isn't live yet. This page opens the captions as soon as your teacher starts.");
      } catch (err) {
        if (needsAuth(err)) return setNeedJoin(true);
        setWaitingMsg((err as Error).message);
      }
      if (!stop) setTimeout(find, 3000);
    };
    find();
    return () => {
      stop = true;
    };
  }, [classId, lectureId]);

  useEffect(() => {
    if (classId && classId !== lectureId) router.replace(`/student/live/${classId}`);
  }, [classId, lectureId, router]);

  const goToNotes = (c: ClassInfo | null, lectureIdFromEnd?: string | null) => {
    setIsLive(false);
    const target = lectureIdFromEnd ?? c?.lecture_id ?? c?.id;
    window.location.href = `/student/lectures/${target}`;
  };

  // Load class + captions in my language (backfills translations for earlier lines).
  const loadCaptions = async (id: string, lang: string) => {
    const t0 = performance.now();
    const data = await api<{
      class: ClassInfo;
      captions: CaptionRow[];
      events?: { announcement: ClassEvent | null; board: ClassEvent | null };
      me: { role: string; name?: string };
    }>(`/api/class/${id}?lang=${lang}&limit=40`);
    setPingMs(Math.round(performance.now() - t0));
    setCls(data.class);
    setStudentName(data.me.name ?? "");
    const a = data.events?.announcement;
    if (a?.kind === "announcement") setAnnouncement(a.payload.translations?.[lang] || a.payload.text);
    const b = data.events?.board;
    if (b?.kind === "board") setBoard(boardIn(b.payload, lang));
    if (data.class.status === "ended") {
      alert("This lecture has ended. Opening the recorded lecture with AI notes...");
      goToNotes(data.class);
      return;
    }
    const evs = data.captions.map((c) => toEvent(c, lang));
    setCaptions(evs);
    lastSeqRef.current = evs.at(-1)?.seq ?? -1;
    if (evs.at(-1)) setActiveSpokenText(evs.at(-1)!.sourceText);
  };

  useEffect(() => {
    if (!classId) return;
    loadCaptions(classId, selectedLang).catch((err) => (needsAuth(err) ? setNeedJoin(true) : setWaitingMsg((err as Error).message)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, selectedLang]);

  const changeLang = (code: LanguageCode) => {
    langRef.current = code;
    setPref("lang", code);
    setSelectedLang(code);
    channelRef.current?.track({ role: "student", lang: code });
  };

  // Auto-scroll when captions arrive
  useEffect(() => {
    if (autoScroll && captionsEndRef.current) {
      captionsEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [captions, autoScroll]);

  // Elapsed clock + latency check
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!classId) return;
    const t = setInterval(async () => {
      try {
        const t0 = performance.now();
        const data = await api<{ class: ClassInfo; captions: CaptionRow[] }>(`/api/class/${classId}?limit=1`);
        setPingMs(Math.round(performance.now() - t0));
        if (data.class.status === "ended") goToNotes(data.class);
      } catch {}
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // Realtime: new captions, interim words, and server events (board scans, announcements, end of class);
  // presence tells the teacher I'm here.
  useEffect(() => {
    if (!classId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`class:${classId}`, { config: { presence: { key: `student-${Math.random().toString(36).slice(2)}` } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "captions", filter: `class_id=eq.${classId}` },
        ({ new: c }: { new: CaptionRow }) => {
          const lang = langRef.current;
          setActiveSpokenText(c.text);
          lastSeqRef.current = Math.max(lastSeqRef.current, c.seq);
          setCaptions((prev) => (prev.some((p) => p.seq === c.seq) ? prev : [...prev, toEvent(c, lang)].slice(-60)));
          // Language nobody else reads yet: fetch this line in my language.
          if (!c.translations?.[lang]) {
            api<{ captions: CaptionRow[] }>(`/api/class/${classId}?lang=${lang}&since=${c.seq - 1}&limit=1`)
              .then(({ captions: rows }) => {
                const row = rows[0];
                if (!row) return;
                setCaptions((prev) => prev.map((p) => (p.seq === row.seq ? toEvent(row, lang) : p)));
              })
              .catch(() => {});
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "class_events", filter: `class_id=eq.${classId}` },
        ({ new: ev }: { new: ClassEvent }) => {
          const lang = langRef.current;
          if (ev.kind === "ended") {
            alert("Your teacher has ended the live lecture. Opening the notes...");
            goToNotes(null, ev.payload.lecture_id);
          } else if (ev.kind === "announcement") {
            setAnnouncement(ev.payload.translations?.[lang] || ev.payload.text);
            if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([200, 100, 200]);
          } else if (ev.kind === "board") {
            setBoard(boardIn(ev.payload, lang));
          }
        },
      )
      .on("broadcast", { event: "interim" }, ({ payload }: { payload: { text: string } }) => {
        if (typeof payload?.text === "string") setActiveSpokenText(payload.text.slice(0, 300));
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") await channel.track({ role: "student", lang: langRef.current });
      });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const handleLostPing = async () => {
    if (!classId) return;
    try {
      setLostFeedbackSent(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(80);
      }
      await api(`/api/class/${classId}/react`, {
        json: { kind: "lost", captionSeq: lastSeqRef.current >= 0 ? lastSeqRef.current : undefined },
      });
      setTimeout(() => setLostFeedbackSent(false), 3000);
    } catch (err) {
      setLostFeedbackSent(false);
      alert((err as Error).message);
    }
  };

  const handleSpeakOrQuestion = async (text: string, kind: "speak" | "question", isAnonymous = false) => {
    if (!classId) throw new Error("No live class");
    await api(`/api/class/${classId}/react`, {
      json: {
        kind,
        text,
        lang: selectedLang,
        captionSeq: lastSeqRef.current >= 0 ? lastSeqRef.current : undefined,
        anonymous: isAnonymous,
      },
    });
  };

  const openTerm = async (term: string, context?: string) => {
    setActiveTerm(term);
    setActiveTranslatedTerm("");
    setActiveTermDef("Explaining...");
    setTermModalOpen(true);
    try {
      const data = await api<{ term: string; translated_term?: string; explanation: string; example?: string }>("/api/explain", {
        json: { term, context: context ?? activeSpokenText, lang: selectedLang },
      });
      setActiveTranslatedTerm(data.translated_term && data.translated_term !== term ? data.translated_term : "");
      setActiveTermDef(data.example ? `${data.explanation} ${data.example}` : data.explanation);
    } catch (err) {
      setActiveTermDef((err as Error).message);
    }
  };

  const latest = captions.at(-1);
  const latestText = latest ? latest.translations[selectedLang] || latest.translations["en"] || latest.sourceText : "";
  const activeTerms = techTerms(latestText);
  const liveMins = cls ? Math.max(0, Math.floor((now - new Date(cls.started_at).getTime()) / 60000)) : 0;
  const srcLabel = sourceLabel(cls?.source_lang);

  /** Caption text with its technical terms as tappable chips. */
  const renderWithTerms = (text: string, context: string) => {
    const terms = techTerms(text);
    if (!terms.length) return text;
    const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    return text.split(re).map((part, i) =>
      terms.includes(part) ? (
        <button
          key={i}
          onClick={() => openTerm(part, context)}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#1E3A8A] text-[#90A8FF] font-bold underline underline-offset-4 hover:bg-[#2563EB] hover:text-white transition"
        >
          <span>{part}</span>
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  };

  if (needJoin) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] pb-28 text-[#0F172A]">
        <Navbar title="ClassCaption" subtitle="Assistive Lecture Stream" />
        <main className="max-w-2xl mx-auto px-4 py-4">
          <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs text-center space-y-3">
            <p className="text-sm text-[#475569]">Join this class with the PIN or QR code your teacher shows on the screen.</p>
            <a href="/join" className="inline-flex h-11 px-5 rounded-xl bg-[#1E3A8A] text-white font-bold text-sm items-center">Join with PIN</a>
          </section>
        </main>
      </div>
    );
  }

  if (!classId || !cls) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] pb-28 text-[#0F172A]">
        <Navbar title="ClassCaption" subtitle="Assistive Lecture Stream" />
        <main className="max-w-2xl mx-auto px-4 py-4">
          <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs text-center space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F1F5F9] text-[#475569] text-xs font-extrabold">
              <span className="w-2 h-2 rounded-full bg-[#94A3B8] animate-pulse" />
              WAITING FOR TEACHER
            </span>
            <p className="text-sm text-[#475569]">{waitingMsg || "Connecting to the live lecture..."}</p>
          </section>
        </main>
        <BottomNav currentTab="classes" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-28 text-[#0F172A]">
      <Navbar
        title="ClassCaption"
        subtitle="Assistive Lecture Stream"
        selectedLang={(() => { const l = LANGUAGES.find((x) => x.code === selectedLang); return l ? `${l.name} (${l.native})` : selectedLang.toUpperCase(); })()}
      />

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* 1. Lecture Metadata Header Card matching Stitch */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h1 className="text-lg sm:text-xl font-extrabold text-[#0F172A] font-heading leading-tight">
              {cls.classroom?.name ?? cls.title}
            </h1>
            <span className="px-3 py-1 rounded-full bg-[#EFF6FF] text-[#1E40AF] text-xs font-bold whitespace-nowrap">
              {cls.classroom?.subject_code || "Live"}
            </span>
          </div>

          <p className="text-xs text-[#475569] font-medium mb-3">
            {cls.classroom ? cls.title : "Live Lecture"}{cls.classroom?.room ? ` • ${cls.classroom.room}` : ""}
          </p>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF2F2] text-[#DC2626] text-xs font-extrabold border border-[#FECACA]">
              <span className="w-2 h-2 rounded-full bg-[#DC2626] animate-pulse" />
              {isLive ? `LIVE • ${liveMins}m` : "ENDED"}
            </span>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ECFDF5] text-[#065F46] text-xs font-bold border border-[#A7F3D0]">
              <Wifi className="w-3.5 h-3.5" />
              {pingMs === null ? "--" : pingMs}ms ping
            </span>
          </div>

          <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#475569]">
            <span className="font-semibold flex items-center gap-1">
              <Radio className="w-3.5 h-3.5 text-[#1E3A8A]" />
              Source: <span className="text-[#0F172A] font-bold">{srcLabel}</span>
            </span>
            <span className="px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#1E40AF] font-bold text-[11px]">
              Live Speech-to-Text
            </span>
          </div>
        </section>

        {/* 2. Language Selector Bar matching Stitch */}
        <section className="space-y-2">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="font-bold text-[#0F172A] flex items-center gap-1.5">
              <span>Live AI Translation</span>
            </span>
            <span className="text-[#059669] font-extrabold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
              {captions.length} Lines Captioned
            </span>
          </div>

          <LanguageSelector selected={selectedLang} onChange={changeLang} />
        </section>

        {/* 3. Dedicated High-Contrast Live Caption Viewport matching Stitch */}
        <section
          className={`rounded-3xl border transition-all duration-300 overflow-hidden shadow-lg ${
            highContrast
              ? "bg-[#0B0F19] text-[#F8FAFC] border-white/10"
              : "bg-white text-[#0F172A] border-[#CBD5E1]"
          }`}
        >
          {/* Caption Viewport Top Controls */}
          <div
            className={`px-4 py-3 flex items-center justify-between border-b ${
              highContrast ? "border-white/10 bg-white/5" : "border-[#E2E8F0] bg-[#F8FAFC]"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-xl bg-[#1E3A8A] text-white text-xs font-bold flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                Real-Time Captions
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border transition ${
                  autoScroll
                    ? "bg-[#059669]/20 text-[#34D399] border-[#059669]/40"
                    : "bg-white/10 text-gray-400 border-white/10"
                }`}
              >
                <span>Auto-Scroll: {autoScroll ? "ON" : "OFF"}</span>
              </button>

              <button
                onClick={() => setHighContrast(!highContrast)}
                title="Toggle Stage Contrast Mode"
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition"
              >
                <SunMoon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Caption Streaming Stage */}
          <div className="p-5 space-y-4 max-h-[380px] overflow-y-auto no-scrollbar">
            {/* Spoken Source Audio Box */}
            <div
              className={`rounded-2xl p-3.5 border ${
                highContrast
                  ? "bg-white/5 border-white/10 text-gray-300"
                  : "bg-[#F1F5F9] border-[#CBD5E1] text-[#475569]"
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#60A5FA] mb-1 font-bold">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#60A5FA] animate-pulse" />
                Spoken {srcLabel}:
              </div>
              <p className="text-xs italic leading-relaxed">
                &ldquo;{activeSpokenText}&rdquo;
              </p>
            </div>

            {/* Rendered Live Translated Sentences with Interactive Term Glosser */}
            <div className="space-y-4 pt-1">
              {captions.length === 0 && (
                <p className="text-sm text-gray-400">Captions will appear here as soon as the teacher speaks.</p>
              )}
              {captions.map((cap, idx) => {
                const isLatest = idx === captions.length - 1;
                const translated =
                  cap.translations[selectedLang] || cap.translations["en"] || cap.sourceText;

                return (
                  <div
                    key={cap.seq}
                    className={`transition-opacity duration-300 ${
                      isLatest ? "opacity-100" : "opacity-80"
                    }`}
                  >
                    <p
                      className={`font-semibold leading-relaxed tracking-wide ${
                        isLatest ? `text-xl sm:text-2xl font-heading ${highContrast ? "text-white" : "text-[#0F172A]"}` : `text-base ${highContrast ? "text-gray-300" : "text-[#475569]"}`
                      }`}
                    >
                      {renderWithTerms(translated, cap.sourceText)}
                    </p>
                  </div>
                );
              })}
              <div ref={captionsEndRef} />
            </div>
          </div>

          {/* Embedded Sticky Glossary Drawer matching Stitch */}
          <div
            className={`p-4 border-t flex items-center justify-between gap-3 ${
              highContrast ? "border-white/10 bg-white/5 text-white" : "border-[#E2E8F0] bg-[#F8FAFC]"
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#60A5FA]" />
              <div>
                <span className="font-bold text-xs block text-[#60A5FA]">
                  Active Technical Term: {activeTerms[0] ?? "None yet"}
                </span>
                <span className="text-[11px] text-gray-300">
                  Tap highlight above for 1-sentence definition
                </span>
              </div>
            </div>

            <button
              onClick={() => activeTerms[0] && openTerm(activeTerms[0], latest?.sourceText)}
              disabled={!activeTerms[0]}
              className="px-3 py-1.5 rounded-xl bg-[#1E3A8A] text-white font-bold text-xs hover:bg-[#2563EB] transition active:scale-95 disabled:opacity-50"
            >
              Explain Term
            </button>
          </div>
        </section>

        {/* Teacher announcement */}
        {announcement && (
          <section className="bg-[#FEF3C7] border-2 border-[#D97706] rounded-2xl p-4 flex items-start justify-between gap-3 text-[#92400E]">
            <p className="text-sm font-bold">📢 {announcement}</p>
            <button onClick={() => setAnnouncement("")} className="text-xs font-bold underline flex-shrink-0">
              Dismiss
            </button>
          </section>
        )}

        {/* Board capture pushed by the teacher */}
        {board && (
          <section className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#1E3A8A]" />
                <h3 className="text-base font-bold text-[#0F172A] font-heading">Board: {board.title}</h3>
              </div>
              <button
                onClick={() =>
                  speakAloud(
                    [board.explanation, ...board.equations.map((e) => e.spoken), ...board.diagrams.map((d) => d.description)].join(". "),
                    LANGUAGES.find((l) => l.code === selectedLang)?.speech ?? "en-IN",
                  )
                }
                className="px-3 py-1.5 rounded-xl bg-[#F1F5F9] text-[#0F172A] font-bold text-xs flex items-center gap-1.5 hover:bg-[#E2E8F0] transition active:scale-95"
              >
                <Volume2 className="w-4 h-4 text-[#1E3A8A]" />
                Read Aloud
              </button>
            </div>
            <p className="text-sm text-[#0F172A] font-medium leading-relaxed">{board.explanation}</p>
            {board.equations.length > 0 && (
              <div className="space-y-1.5">
                {board.equations.map((e, i) => (
                  <div key={i} className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <code className="font-mono text-xs font-bold text-[#1E3A8A] block">{e.latex}</code>
                    <span className="text-xs text-[#475569]">{e.spoken}</span>
                  </div>
                ))}
              </div>
            )}
            {board.diagrams.map((d, i) => (
              <p key={i} className="text-xs text-[#475569] leading-relaxed">
                <span className="font-bold text-[#0F172A]">Diagram {i + 1}: </span>
                {d.description}
              </p>
            ))}
            <details className="text-xs text-[#475569]">
              <summary className="font-bold text-[#1E3A8A] cursor-pointer">Text on the board</summary>
              <pre className="whitespace-pre-wrap font-sans mt-2">{board.text}</pre>
            </details>
          </section>
        )}

        {/* 4. Student Big-Target Action Controls matching Stitch */}
        <section className="space-y-3 pt-2">
          {/* "I'm Lost" Big Trigger Button */}
          <button
            onClick={handleLostPing}
            disabled={lostFeedbackSent}
            className={`w-full h-15 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2 border-2 shadow-sm transition active:scale-95 ${
              lostFeedbackSent
                ? "bg-[#D1FAE5] border-[#059669] text-[#065F46]"
                : "bg-[#FEF3C7] border-[#D97706] text-[#92400E] hover:bg-[#FDE68A]"
            }`}
          >
            <HelpCircle className="w-5 h-5" />
            <span>
              {lostFeedbackSent ? "✓ Confusion Ping Sent to Teacher!" : "I'm Lost (Send Anonymous Ping)"}
            </span>
          </button>

          <div className="grid grid-cols-2 gap-3">
            {/* Speak for Me TTS Trigger */}
            <button
              onClick={() => setSpeakModalOpen(true)}
              className="h-14 rounded-2xl bg-[#1E3A8A] hover:bg-[#00236F] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
            >
              <Volume2 className="w-4 h-4" />
              <span>Speak for Me</span>
            </button>

            {/* Ask Question Trigger */}
            <button
              onClick={() => setAskModalOpen(true)}
              className="h-14 rounded-2xl bg-white hover:bg-[#F1F5F9] border-2 border-[#CBD5E1] text-[#0F172A] font-bold text-sm flex items-center justify-center gap-2 transition active:scale-95"
            >
              <MessageSquarePlus className="w-4 h-4 text-[#1E3A8A]" />
              <span>Ask Question</span>
            </button>
          </div>
        </section>
      </main>

      {/* Modals */}
      <TermModal
        isOpen={termModalOpen}
        onClose={() => setTermModalOpen(false)}
        term={activeTerm}
        translatedTerm={activeTranslatedTerm}
        definition={activeTermDef}
      />

      <SpeakForMeModal
        isOpen={speakModalOpen}
        onClose={() => setSpeakModalOpen(false)}
        onSubmit={handleSpeakOrQuestion}
        lectureId={lectureId}
      />

      <AskQuestionModal
        isOpen={askModalOpen}
        onClose={() => setAskModalOpen(false)}
        onSubmit={(text, isAnon) => handleSpeakOrQuestion(text, "question", isAnon)}
        lectureId={lectureId}
        studentName={studentName}
      />

      <BottomNav currentTab="classes" />
    </div>
  );
}

export default function StudentLiveLecturePage({
  params,
}: {
  params: Promise<{ lectureId: string }>;
}) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-[#475569]">Loading live stream...</div>}>
      <StudentLiveLectureContent paramsPromise={params} />
    </Suspense>
  );
}
