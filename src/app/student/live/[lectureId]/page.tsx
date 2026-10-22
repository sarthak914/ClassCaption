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
import { useWakeLock } from "@/lib/client/wakeLock";
import { useCaptionVoice } from "@/lib/client/captionVoice";
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
  Megaphone,
  Check,
  Headphones,
  MessageSquareReply,
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
  | { kind: "ended"; payload: { lecture_id: string } }
  | { kind: "answer"; payload: AnswerPayload };

type Translated = { text: string; lang: string; translations: Record<string, string> };
type AnswerPayload = { question_id: number; question: Translated; answer: Translated };
type AnswerItem = AnswerPayload & { mine: boolean; at: number };
type MyQuestion = { id: number; text: string };

/** A teacher's text in my language: the translation, the original if I read that language, else English. */
const inLang = (t: Translated, lang: string) => t.translations?.[lang] || (t.lang === lang ? t.text : t.translations?.en || t.text);

/** Ids of questions I asked in this class, kept for the session so a reload still knows which answers are mine. */
function myQuestions(classId: string): MyQuestion[] {
  try {
    return JSON.parse(sessionStorage.getItem(`cc_q_${classId}`) || "[]");
  } catch {
    return [];
  }
}
function saveMyQuestions(classId: string, list: MyQuestion[]) {
  try {
    sessionStorage.setItem(`cc_q_${classId}`, JSON.stringify(list.slice(-30)));
  } catch {}
}

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
  const [answers, setAnswers] = useState<AnswerItem[]>([]);
  const [mine, setMine] = useState<MyQuestion[]>([]);
  const mineRef = useRef<MyQuestion[]>([]);
  // Listen mode: the phone reads each caption aloud in my language (earphones in).
  const [listening, setListening] = useState(false);
  const [rate, setRate] = useState(1);
  const listeningRef = useRef(false);
  const spokenSeqRef = useRef(-1);
  // Keep the phone screen on while captions are coming in.
  useWakeLock(!!cls && isLive);

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
    setRate(Number(pref("rate", "1")) || 1);
  }, []);

  useEffect(() => {
    if (!classId) return;
    mineRef.current = myQuestions(classId);
    setMine(mineRef.current);
  }, [classId]);

  const speechCode = LANGUAGES.find((l) => l.code === selectedLang)?.speech ?? "en-IN";
  const voice = useCaptionVoice(speechCode, rate);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  /** Adds a teacher answer (live event or on load), newest first, marking the ones to my own questions. */
  const addAnswer = (p: AnswerPayload, at: number) => {
    const isMine = mineRef.current.some((m) => m.id === p.question_id);
    setAnswers((prev) =>
      [{ ...p, mine: isMine, at }, ...prev.filter((a) => a.question_id !== p.question_id)].sort((a, b) => b.at - a.at).slice(0, 10),
    );
    return isMine;
  };

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
      events?: { announcement: ClassEvent | null; board: ClassEvent | null; answers?: (ClassEvent & { created_at: string })[] };
      me: { role: string; name?: string };
    }>(`/api/class/${id}?lang=${lang}&limit=40`);
    setPingMs(Math.round(performance.now() - t0));
    setCls(data.class);
    setStudentName(data.me.name ?? "");
    const a = data.events?.announcement;
    if (a?.kind === "announcement") setAnnouncement(a.payload.translations?.[lang] || a.payload.text);
    const b = data.events?.board;
    if (b?.kind === "board") setBoard(boardIn(b.payload, lang));
    for (const ev of data.events?.answers ?? []) if (ev.kind === "answer") addAnswer(ev.payload, new Date(ev.created_at).getTime());
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
    voice.stop();
    langRef.current = code;
    setPref("lang", code);
    setSelectedLang(code);
    channelRef.current?.track({ role: "student", lang: code });
  };

  /** A caption line in my language, or "" while its translation is still on the way. */
  const srcBase = cls?.source_lang?.split("-")[0];
  const lineIn = (c: LiveCaptionEvent) => c.translations[selectedLang] || (selectedLang === srcBase ? c.sourceText : "");

  // Listen mode: read each new line aloud once it is in my language.
  useEffect(() => {
    listeningRef.current = listening;
    if (!listening) return;
    const fresh = captions.filter((c) => c.seq > spokenSeqRef.current && lineIn(c));
    if (!fresh.length) return;
    spokenSeqRef.current = fresh.at(-1)!.seq;
    for (const c of fresh.slice(-2)) voice.say(lineIn(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captions, listening, selectedLang]);

  const toggleListen = () => {
    if (listening) {
      voice.stop();
      setListening(false);
      return;
    }
    setListening(true);
    const last = captions.at(-1);
    spokenSeqRef.current = last?.seq ?? -1;
    // Speaking inside the tap also unlocks audio on iPhones.
    voice.say((last && lineIn(last)) || (LANGUAGES.find((l) => l.code === selectedLang)?.native ?? ""));
  };

  const changeRate = (r: number) => {
    setRate(r);
    setPref("rate", String(r));
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
          // Keep spoken order even if a slower translation lands after a later line.
          setCaptions((prev) =>
            prev.some((p) => p.seq === c.seq) ? prev : [...prev, toEvent(c, lang)].sort((a, b) => a.seq - b.seq).slice(-60),
          );
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
            if (listeningRef.current) voiceRef.current.say(ev.payload.translations?.[lang] || ev.payload.text);
          } else if (ev.kind === "board") {
            setBoard(boardIn(ev.payload, lang));
          } else if (ev.kind === "answer") {
            const isMine = addAnswer(ev.payload, Date.now());
            if (isMine) {
              if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([120, 80, 120, 80, 240]);
              if (listeningRef.current) voiceRef.current.say(inLang(ev.payload.answer, lang));
            }
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
    const { reaction } = await api<{ reaction: { id: number } }>(`/api/class/${classId}/react`, {
      json: {
        kind,
        text,
        lang: selectedLang,
        captionSeq: lastSeqRef.current >= 0 ? lastSeqRef.current : undefined,
        anonymous: isAnonymous,
      },
    });
    if (kind === "question" && reaction?.id) {
      mineRef.current = [...mineRef.current, { id: reaction.id, text }];
      setMine(mineRef.current);
      saveMyQuestions(classId, mineRef.current);
    }
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
          className={`${highContrast ? "cc-term hover:bg-white/10" : "cc-term-light hover:bg-neel-wash"} rounded px-0.5 font-semibold transition`}
        >
          {part}
        </button>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  };

  if (needJoin) {
    return (
      <div className="min-h-screen bg-paper pb-28 text-ink">
        <Navbar title="ClassCaption" subtitle="Live lecture captions" />
        <main className="max-w-2xl mx-auto px-4 py-6">
          <section className="cc-card p-6 text-center space-y-4">
            <p className="text-ink-2">Join this class with the PIN or QR code your teacher shows on the screen.</p>
            <a href="/join" className="cc-btn cc-btn-primary h-11 px-5 text-sm">Join with PIN</a>
          </section>
        </main>
      </div>
    );
  }

  if (!classId || !cls) {
    return (
      <div className="min-h-screen bg-paper pb-28 text-ink">
        <Navbar title="ClassCaption" subtitle="Live lecture captions" />
        <main className="max-w-2xl mx-auto px-4 py-6">
          <section className="cc-board cc-kolam-light p-8 text-center space-y-3">
            <span className="cc-stamp text-chalk-dim">
              <span className="w-1.5 h-1.5 rounded-full bg-chalk-dim animate-live-pulse" />
              Waiting for teacher
            </span>
            <p className="text-chalk-dim">{waitingMsg || "Connecting to the live lecture..."}</p>
          </section>
        </main>
        <BottomNav currentTab="classes" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper pb-28 text-ink">
      <Navbar
        title="ClassCaption"
        subtitle="Live lecture captions"
        selectedLang={(() => { const l = LANGUAGES.find((x) => x.code === selectedLang); return l ? `${l.name} (${l.native})` : selectedLang.toUpperCase(); })()}
      />

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* 1. Lecture header */}
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`cc-stamp ${isLive ? "text-sindoor" : "text-ink-3"}`}>
              {isLive && <span className="w-1.5 h-1.5 rounded-full bg-sindoor animate-live-pulse" />}
              {isLive ? `Live · ${liveMins}m` : "Ended"}
            </span>
            {cls.classroom?.subject_code && <span className="cc-stamp text-neel">{cls.classroom.subject_code}</span>}
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-3 font-mono">
              <Wifi className="w-3.5 h-3.5 text-patta" />
              {pingMs === null ? "--" : pingMs} ms
            </span>
          </div>
          <h1 className="text-[1.75rem] sm:text-3xl font-medium leading-tight">
            {cls.classroom?.name ?? cls.title}
          </h1>
          <p className="text-sm text-ink-3">
            {cls.classroom ? cls.title : "Live Lecture"}{cls.classroom?.room ? ` · ${cls.classroom.room}` : ""}
            <span className="mx-1.5 text-rule-strong">|</span>
            <Radio className="w-3.5 h-3.5 inline -mt-0.5 text-sindoor" /> Teacher speaks <span className="text-ink font-semibold">{srcLabel}</span>
          </p>
        </section>

        {/* 2. Language picker */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <span className="cc-eyebrow">Captions in</span>
            <span className="text-xs text-ink-3">
              <span className="font-mono font-bold text-patta">{captions.length}</span> lines so far
            </span>
          </div>

          <LanguageSelector selected={selectedLang} onChange={changeLang} />
        </section>

        {/* 3. The chalkboard: live captions */}
        <section
          className={`overflow-hidden transition-colors duration-300 ${
            highContrast ? "cc-board" : "cc-card cc-notebook"
          }`}
        >
          {/* Board controls */}
          <div
            className={`px-4 py-2.5 flex items-center justify-between border-b ${
              highContrast ? "border-board-line" : "border-rule"
            }`}
          >
            <span className={`text-[11px] font-mono uppercase tracking-[0.16em] ${highContrast ? "text-chalk-dim" : "text-ink-3"}`}>
              Live captions
            </span>

            <div className="flex items-center gap-2">
              {voice.supported && (
                <button
                  onClick={toggleListen}
                  aria-pressed={listening}
                  title="Hear the captions in your language through earphones"
                  className={`px-2.5 h-7 rounded-md text-[11px] font-semibold border transition inline-flex items-center gap-1 ${
                    listening
                      ? highContrast ? "border-chalk-yellow/60 text-chalk-yellow bg-white/5" : "border-haldi-line text-haldi-ink bg-haldi-wash"
                      : highContrast ? "border-board-line text-chalk-dim hover:text-chalk" : "border-rule text-ink-3 hover:text-ink"
                  }`}
                >
                  <Headphones className="w-3.5 h-3.5" />
                  {listening ? "Listening" : "Listen"}
                </button>
              )}
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`px-2.5 h-7 rounded-md text-[11px] font-semibold border transition ${
                  autoScroll
                    ? highContrast ? "border-chalk-green/50 text-chalk-green" : "border-patta-line text-patta bg-patta-wash"
                    : highContrast ? "border-board-line text-chalk-dim" : "border-rule text-ink-3"
                }`}
              >
                Auto-scroll {autoScroll ? "on" : "off"}
              </button>

              <button
                onClick={() => setHighContrast(!highContrast)}
                title={highContrast ? "Switch to paper" : "Switch to chalkboard"}
                aria-label="Toggle board or paper view"
                className={`w-7 h-7 rounded-md flex items-center justify-center border transition ${
                  highContrast ? "border-board-line text-chalk hover:bg-white/10" : "border-rule text-ink-2 hover:bg-paper-2"
                }`}
              >
                <SunMoon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Listen mode: speed, and a hint when the phone has no voice for this language */}
          {listening && (
            <div
              className={`px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b text-[11px] ${
                highContrast ? "border-board-line text-chalk-dim" : "border-rule text-ink-3"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${highContrast ? "bg-chalk-yellow" : "bg-haldi"}`} />
                Reading aloud in {LANGUAGES.find((l) => l.code === selectedLang)?.name ?? selectedLang}
              </span>
              <span className="inline-flex items-center gap-1 ml-auto" role="group" aria-label="Reading speed">
                {[0.8, 1, 1.25].map((r) => (
                  <button
                    key={r}
                    onClick={() => changeRate(r)}
                    aria-pressed={rate === r}
                    className={`h-6 px-2 rounded font-mono font-bold border transition ${
                      rate === r
                        ? highContrast ? "border-chalk-yellow/60 text-chalk-yellow" : "border-haldi-line text-haldi-ink bg-haldi-wash"
                        : highContrast ? "border-board-line" : "border-rule"
                    }`}
                  >
                    {r}x
                  </button>
                ))}
              </span>
              {!voice.hasVoice && (
                <p className={`w-full ${highContrast ? "text-chalk-pink" : "text-sindoor-deep"}`}>
                  This phone has no {LANGUAGES.find((l) => l.code === selectedLang)?.name} voice yet. Add it in Settings → Text-to-speech, or pick another language.
                </p>
              )}
            </div>
          )}

          {/* Caption stream */}
          <div className={`py-5 pr-5 space-y-4 max-h-[420px] overflow-y-auto no-scrollbar ${highContrast ? "pl-5" : "pl-14"}`}>
            {/* What the teacher is saying right now */}
            <div className={`border-l-2 pl-3 ${highContrast ? "border-chalk-blue/60" : "border-neel-line"}`}>
              <div className={`flex items-center gap-1.5 text-[11px] font-mono mb-0.5 ${highContrast ? "text-chalk-blue" : "text-neel"}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full animate-pulse ${highContrast ? "bg-chalk-blue" : "bg-neel"}`} />
                Teacher, in {srcLabel}
              </div>
              <p className={`font-heading italic text-[15px] leading-relaxed ${highContrast ? "text-chalk/80" : "text-ink-2"}`}>
                &ldquo;{activeSpokenText}&rdquo;
              </p>
            </div>

            {/* Captions in my language; technical terms are tappable */}
            <div className="space-y-4 pt-1" lang={selectedLang}>
              {captions.length === 0 && (
                <p className={highContrast ? "text-chalk-dim" : "text-ink-3"}>Captions will appear here as soon as the teacher speaks.</p>
              )}
              {captions.map((cap, idx) => {
                const isLatest = idx === captions.length - 1;
                const translated =
                  cap.translations[selectedLang] || cap.translations["en"] || cap.sourceText;

                return (
                  <div key={cap.seq} className={isLatest ? "animate-chalk-in" : ""}>
                    <p
                      className={`leading-relaxed ${
                        isLatest
                          ? `text-[1.45rem] sm:text-[1.7rem] font-medium ${highContrast ? "text-chalk" : "text-ink"}`
                          : `text-[1.05rem] ${highContrast ? "text-chalk-dim" : "text-ink-3"}`
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

          {/* Term drawer */}
          <div
            className={`px-4 py-3 border-t flex items-center justify-between gap-3 ${
              highContrast ? "border-board-line bg-black/15" : "border-rule bg-paper"
            }`}
          >
            <div className="min-w-0">
              <span className={`text-[11px] font-mono uppercase tracking-[0.14em] block ${highContrast ? "text-chalk-dim" : "text-ink-3"}`}>
                Word to know
              </span>
              <span className={`font-semibold block truncate ${highContrast ? "text-chalk-yellow" : "text-neel"}`}>
                {activeTerms[0] ?? "None yet"}
              </span>
            </div>

            <button
              onClick={() => activeTerms[0] && openTerm(activeTerms[0], latest?.sourceText)}
              disabled={!activeTerms[0]}
              className="cc-btn cc-btn-haldi h-9 px-3.5 text-xs flex-shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Explain
            </button>
          </div>
        </section>

        {/* Teacher announcement */}
        {announcement && (
          <section className="bg-haldi-wash border-[1.5px] border-haldi rounded-[var(--radius-card)] p-4 flex items-start justify-between gap-3 text-haldi-ink">
            <p className="text-[15px] font-semibold flex items-start gap-2">
              <Megaphone className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {announcement}
            </p>
            <button onClick={() => setAnnouncement("")} className="text-xs font-bold underline flex-shrink-0">
              Dismiss
            </button>
          </section>
        )}

        {/* Answers from the teacher, in my language. Mine first and highlighted. */}
        {(answers.length > 0 || mine.some((m) => !answers.some((a) => a.question_id === m.id))) && (
          <section className="space-y-2.5">
            <span className="cc-eyebrow px-0.5 block">Questions and answers</span>
            {mine
              .filter((m) => !answers.some((a) => a.question_id === m.id))
              .slice(-3)
              .map((m) => (
                <div key={m.id} className="rounded-[var(--radius-card)] border border-dashed border-rule-strong px-4 py-3 text-sm text-ink-2 flex items-start justify-between gap-3">
                  <span className="min-w-0">&ldquo;{m.text}&rdquo;</span>
                  <span className="text-[11px] font-mono text-ink-3 flex-shrink-0">Waiting for an answer</span>
                </div>
              ))}
            {[...answers].sort((a, b) => Number(b.mine) - Number(a.mine)).map((a) => (
              <article
                key={a.question_id}
                className={`cc-card p-4 space-y-2.5 ${a.mine ? "!border-patta-line border-l-4 !border-l-patta animate-chalk-in" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`cc-stamp ${a.mine ? "text-patta" : "text-ink-3"}`}>
                    <MessageSquareReply className="w-3 h-3" />
                    {a.mine ? "Your teacher answered you" : "Answered for the class"}
                  </span>
                  <button
                    onClick={() => speakAloud(inLang(a.answer, selectedLang), speechCode, rate)}
                    aria-label="Read the answer aloud"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-neel hover:bg-neel-wash transition"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <p lang={selectedLang} className="text-sm text-ink-3 leading-relaxed">
                  <span className="font-semibold text-ink-2">Q. </span>
                  {inLang(a.question, selectedLang)}
                </p>
                <p lang={selectedLang} className="text-[1.05rem] text-ink leading-relaxed">{inLang(a.answer, selectedLang)}</p>
                {a.answer.lang !== selectedLang && (
                  <details className="text-xs text-ink-3">
                    <summary className="cursor-pointer font-semibold text-neel">What the teacher wrote</summary>
                    <p lang={a.answer.lang} className="mt-1">{a.answer.text}</p>
                  </details>
                )}
              </article>
            ))}
          </section>
        )}

        {/* Board capture pushed by the teacher */}
        {board && (
          <section className="cc-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="cc-eyebrow">From the board</span>
                <h3 className="text-lg font-medium">{board.title}</h3>
              </div>
              <button
                onClick={() =>
                  speakAloud(
                    [board.explanation, ...board.equations.map((e) => e.spoken), ...board.diagrams.map((d) => d.description)].join(". "),
                    LANGUAGES.find((l) => l.code === selectedLang)?.speech ?? "en-IN",
                  )
                }
                className="cc-btn h-9 px-3 text-xs"
              >
                <Volume2 className="w-4 h-4 text-neel" />
                Read aloud
              </button>
            </div>
            <p className="text-[15px] leading-relaxed">{board.explanation}</p>
            {board.equations.length > 0 && (
              <div className="space-y-1.5">
                {board.equations.map((e, i) => (
                  <div key={i} className="p-3 rounded-lg bg-board text-chalk">
                    <code className="font-mono text-xs font-bold text-chalk-yellow block">{e.latex}</code>
                    <span className="text-xs text-chalk-dim">{e.spoken}</span>
                  </div>
                ))}
              </div>
            )}
            {board.diagrams.map((d, i) => (
              <p key={i} className="text-sm text-ink-2 leading-relaxed">
                <span className="font-semibold text-ink">Diagram {i + 1}: </span>
                {d.description}
              </p>
            ))}
            <details className="text-sm text-ink-2">
              <summary className="font-semibold text-neel cursor-pointer">Text on the board</summary>
              <pre className="whitespace-pre-wrap font-sans mt-2">{board.text}</pre>
            </details>
          </section>
        )}

        {/* 4. Big-target actions */}
        <section className="space-y-3 pt-1">
          <button
            onClick={handleLostPing}
            disabled={lostFeedbackSent}
            className={`cc-btn w-full h-15 text-base ${lostFeedbackSent ? "cc-btn-patta" : "cc-btn-haldi"}`}
          >
            {lostFeedbackSent ? <Check className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
            <span>
              {lostFeedbackSent ? "Sent. Your teacher knows someone is lost." : "I'm lost"}
            </span>
            {!lostFeedbackSent && <span className="text-xs font-medium opacity-70">(anonymous)</span>}
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setSpeakModalOpen(true)} className="cc-btn cc-btn-primary h-14 text-sm">
              <Volume2 className="w-4 h-4" />
              <span>Speak for Me</span>
            </button>

            <button onClick={() => setAskModalOpen(true)} className="cc-btn h-14 text-sm">
              <MessageSquarePlus className="w-4 h-4 text-neel" />
              <span>Ask a question</span>
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
    <Suspense fallback={<div className="p-8 text-center text-sm text-ink-3">Loading live stream...</div>}>
      <StudentLiveLectureContent paramsPromise={params} />
    </Suspense>
  );
}
