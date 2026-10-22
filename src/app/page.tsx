"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, HelpCircle } from "lucide-react";
import { Brand } from "@/components/brand/Brand";

/** The languages the headline cycles through, each in its own script. */
const SCRIPTS = [
  { code: "hi", word: "हिंदी" },
  { code: "ta", word: "தமிழ்" },
  { code: "bn", word: "বাংলা" },
  { code: "te", word: "తెలుగు" },
  { code: "mr", word: "मराठी" },
  { code: "gu", word: "ગુજરાતી" },
  { code: "kn", word: "ಕನ್ನಡ" },
  { code: "ml", word: "മലയാളം" },
  { code: "pa", word: "ਪੰਜਾਬੀ" },
  { code: "or", word: "ଓଡ଼ିଆ" },
  { code: "ur", word: "اردو" },
];

const SPOKEN = "Dekho, binary search sirf sorted array pe hi kaam karta hai.";
const TAMIL = ["பாருங்கள்,", "பைனரி", "தேடல்", "வரிசைப்படுத்தப்பட்ட", "அணியில்", "மட்டுமே", "வேலை", "செய்யும்."];
const TAMIL_TERM = new Set(["வரிசைப்படுத்தப்பட்ட", "அணியில்"]);

/** Adds `cc-in` once the element scrolls into view, which starts its reveal transitions. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView] as const;
}

/** A language name that rewrites itself in the next script every couple of seconds. */
function CyclingScript() {
  const [i, setI] = useState(0);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setI((n) => (n + 1) % SCRIPTS.length);
        setFading(false);
      }, 350);
    }, 2200);
    return () => clearInterval(t);
  }, []);
  const s = SCRIPTS[i];
  return (
    <span className="relative inline-block align-baseline">
      <span
        lang={s.code}
        className={`cc-underline inline-block text-neel font-sans font-medium transition-all duration-300 ${
          fading ? "opacity-0 blur-[6px] translate-y-1" : "opacity-100 blur-0 translate-y-0"
        }`}
      >
        {s.word}
      </span>
    </span>
  );
}

/** One chapter of the story: a time on the margin, a short text, and the picture it describes. */
function Chapter({
  time,
  title,
  children,
  visual,
  flip = false,
}: {
  time: string;
  title: string;
  children: React.ReactNode;
  visual: (inView: boolean) => React.ReactNode;
  flip?: boolean;
}) {
  const [ref, inView] = useInView<HTMLElement>();
  return (
    <section ref={ref} className={`relative grid md:grid-cols-2 gap-8 md:gap-16 items-center py-14 md:py-24 ${inView ? "cc-in" : ""}`}>
      <div className={`cc-reveal ${flip ? "md:order-2" : ""}`}>
        <p className="font-mono text-xs text-sindoor tracking-wider mb-3">{time}</p>
        <h3 className="text-3xl sm:text-4xl font-medium leading-tight mb-4">{title}</h3>
        <div className="text-lg text-ink-2 leading-relaxed space-y-3 max-w-md">{children}</div>
      </div>
      <div className={`cc-reveal [transition-delay:150ms] ${flip ? "md:order-1" : ""}`}>{visual(inView)}</div>
    </section>
  );
}

export default function LandingLauncherPage() {
  // Real status from the server: which translators are configured right now.
  const [status, setStatus] = useState<{ ok: boolean; providers: string } | null>(null);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => setStatus({ ok: !!h.ok, providers: String(h.translation_providers ?? "") }))
      .catch(() => setStatus({ ok: false, providers: "" }));
  }, []);
  const providerNames = (status?.providers ?? "")
    .split(",")
    .map((p) => ({ bhashini: "Bhashini", indictrans2: "IndicTrans2", groq: "Groq", gemini: "Gemini", google: "Google" })[p.trim()] ?? "")
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col">
      {/* Header */}
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between gap-4 px-5 sm:px-8 py-6">
        <Brand />
        <nav className="flex items-center gap-3 sm:gap-6 text-sm font-semibold">
          {status && (
            <span
              className={`hidden md:inline-flex items-center gap-2 text-xs font-medium ${status.ok ? "text-ink-3" : "text-sindoor"}`}
              title={status.ok ? "Translators ready on this server" : "The server is missing its settings"}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status.ok ? "bg-patta animate-live-pulse" : "bg-sindoor"}`} />
              {status.ok ? `Online · ${providerNames.join(" → ") || "translation ready"}` : "Server not ready"}
            </span>
          )}
          <Link href="/teacher/dashboard" className="hidden sm:inline text-ink-2 hover:text-neel">
            For teachers
          </Link>
          <Link href="/join" className="cc-btn cc-btn-primary h-10 px-4 text-sm">
            Join a class
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero: one sentence, and the language it ends in keeps changing */}
        <section className="max-w-6xl mx-auto w-full px-5 sm:px-8 pt-14 sm:pt-24 pb-20 sm:pb-28">
          <p className="cc-eyebrow mb-6">Live captions for Indian classrooms</p>
          <h1 className="text-[2.75rem] leading-[1.05] sm:text-7xl sm:leading-[1.02] font-normal tracking-tight max-w-4xl">
            Teach in one language.
            <br />
            Be understood in <CyclingScript />
          </h1>
          <p className="mt-8 text-lg sm:text-xl text-ink-2 leading-relaxed max-w-2xl">
            The teacher speaks as they always do. Every student reads the lecture in their own language, two seconds later, on their
            own phone.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/join" className="cc-btn cc-btn-primary h-12 px-6 text-base">
              Join with PIN or QR
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/teacher/dashboard" className="cc-btn h-12 px-6 text-base">
              Start a class
            </Link>
            <a href="#story" className="ml-2 text-sm font-semibold text-ink-3 hover:text-ink underline underline-offset-4 decoration-rule-strong">
              See how it feels
            </a>
          </div>
        </section>

        {/* The story of one lecture */}
        <div id="story" className="border-t border-rule">
          <div className="max-w-6xl mx-auto w-full px-5 sm:px-8">
            <Chapter
              time="9:05 AM · Lecture Hall 304"
              title="Dr. Iyer starts the lecture."
              visual={() => (
                <blockquote className="font-heading italic text-3xl sm:text-4xl leading-snug text-ink">
                  &ldquo;{SPOKEN.split(" ").map((w, i) => (
                    <span key={i} className="cc-word" style={{ transitionDelay: `${i * 90}ms` }}>
                      {w}
                      {i < SPOKEN.split(" ").length - 1 && <>&nbsp;</>}
                    </span>
                  ))}&rdquo;
                </blockquote>
              )}
            >
              <p>She teaches the way most of India talks: quickly, warmly, half in English and half in Hindi.</p>
            </Chapter>

            <Chapter
              flip
              time="9:12 AM · Third row"
              title="Asha hears every word. Few of them land."
              visual={() => (
                <p className="text-2xl sm:text-3xl leading-[1.9] text-ink-2 select-none" aria-label={SPOKEN}>
                  {SPOKEN.split(" ").map((w, i) => {
                    const r = ((i * 37) % 11) - 5;
                    return (
                      <span
                        key={i}
                        aria-hidden
                        className="cc-lost-word mr-2"
                        style={{
                          ["--o" as string]: String(0.18 + ((i * 13) % 5) / 12),
                          ["--b" as string]: `${1 + ((i * 7) % 4)}px`,
                          ["--x" as string]: `${r * 2}px`,
                          ["--y" as string]: `${((i * 17) % 9) - 4}px`,
                          ["--r" as string]: `${r}deg`,
                        }}
                      >
                        {w}
                      </span>
                    );
                  })}
                </p>
              )}
            >
              <p>
                She grew up in Madurai, reading and thinking in Tamil. By the time she has worked out one sentence, the next three have
                gone by.
              </p>
              <p>She doesn&apos;t raise her hand. Nobody does.</p>
            </Chapter>

            <Chapter
              time="9:13 AM · On her phone"
              title="The same sentence, in her language."
              visual={() => (
                <div className="cc-board p-6 sm:p-8">
                  <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-chalk-dim mb-2">Teacher said</p>
                  <p className="font-heading italic text-chalk/70 mb-6">&ldquo;{SPOKEN}&rdquo;</p>
                  <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-chalk-blue mb-2">தமிழ் · Tamil</p>
                  <p lang="ta" className="text-2xl sm:text-[1.7rem] leading-relaxed text-chalk">
                    {TAMIL.map((w, i) => (
                      <span key={i} className="cc-word" style={{ transitionDelay: `${500 + i * 140}ms` }}>
                        <span className={TAMIL_TERM.has(w) ? "cc-term" : ""}>{w}</span>&nbsp;
                      </span>
                    ))}
                  </p>
                </div>
              )}
            >
              <p>
                She scanned the QR code on the projector. Now the lecture arrives in Tamil, line by line, with the technical words kept
                and underlined.
              </p>
              <p>Tapping one gives a one-line explanation, in Tamil.</p>
            </Chapter>

            <Chapter
              flip
              time="9:31 AM · Recursion"
              title="One tap says “I’m lost”."
              visual={(inView) => (
                <div className="cc-card p-6 sm:p-7 max-w-md md:ml-auto">
                  <div className="flex items-center justify-between mb-4">
                    <span className="cc-eyebrow">On Dr. Iyer&apos;s laptop</span>
                    <span className="cc-stamp text-sindoor">Slow down</span>
                  </div>
                  <p className="font-heading text-5xl font-normal mb-1">
                    7 <span className="text-lg text-ink-3 font-sans">of 42 students lost</span>
                  </p>
                  <div className="h-2 rounded-full bg-paper-2 overflow-hidden mt-4">
                    <div
                      className="h-full bg-sindoor rounded-full transition-[width] duration-[1600ms] ease-out [transition-delay:400ms]"
                      style={{ width: inView ? "17%" : "0%" }}
                    />
                  </div>
                  <p className="mt-4 text-sm text-ink-2 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-sindoor" />
                    Most taps came during &ldquo;the base case returns&hellip;&rdquo;
                  </p>
                </div>
              )}
            >
              <p>It is anonymous. Seven students tap it in the same minute, and the teacher sees exactly which sentence lost them.</p>
              <p>She goes back and explains it again, a little slower.</p>
            </Chapter>

            <Chapter
              time="10:00 AM · After the bell"
              title="The lecture stays with her."
              visual={() => (
                <div className="cc-card cc-notebook p-6 pl-14 sm:p-8 sm:pl-16">
                  <p lang="ta" className="text-sm text-sindoor mb-1">குறிப்புகள் · Notes</p>
                  <p className="font-heading text-2xl mb-4">Searching and sorting</p>
                  <ul className="space-y-[0.6rem] text-[15px] leading-[1.75rem]">
                    <li>Binary search needs a sorted array.</li>
                    <li>Each step halves the search range: O(log n).</li>
                    <li>
                      Asked: <em>&ldquo;Why must it be sorted?&rdquo;</em> <span className="font-mono text-xs text-neel">▶ 14:32</span>
                    </li>
                  </ul>
                  <p lang="ta" className="mt-5 text-sm text-ink-3">வினாடி வினா · 5 questions ready</p>
                </div>
              )}
            >
              <p>
                The class is saved with subtitles in every language. She gets notes, a short quiz, and can ask the lecture a question
                and jump to the moment it was answered.
              </p>
            </Chapter>
          </div>
        </div>

        {/* Two doors */}
        <section className="border-t border-rule">
          <div className="max-w-6xl mx-auto w-full px-5 sm:px-8 py-20 grid md:grid-cols-2 gap-px bg-rule md:bg-transparent md:gap-12">
            <div className="bg-paper py-8 md:py-0">
              <p className="cc-eyebrow mb-3">Students</p>
              <h2 className="text-3xl font-normal mb-3">Read your lecture in your language.</h2>
              <p className="text-ink-2 leading-relaxed mb-6 max-w-md">
                Join with the PIN or QR code on the screen. No app to install, no phone number needed.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/join" className="cc-btn cc-btn-primary h-11 px-5 text-sm">
                  Join a class <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/student" className="cc-btn h-11 px-5 text-sm">My lectures</Link>
                <Link href="/student/login" className="h-11 px-2 inline-flex items-center text-sm font-semibold text-ink-3 hover:text-ink">
                  Sign in
                </Link>
              </div>
            </div>
            <div className="bg-paper py-8 md:py-0">
              <p className="cc-eyebrow mb-3">Teachers</p>
              <h2 className="text-3xl font-normal mb-3">Keep teaching the way you teach.</h2>
              <p className="text-ink-2 leading-relaxed mb-6 max-w-md">
                Start a class, show the QR code, and speak. You see who is lost, your speaking pace, and their questions.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/teacher/dashboard" className="cc-btn cc-btn-sindoor h-11 px-5 text-sm">
                  Teacher sign in <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/teacher/login" className="cc-btn h-11 px-5 text-sm">Create an account</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="max-w-6xl mx-auto w-full px-5 sm:px-8 py-8 flex flex-col sm:flex-row gap-2 justify-between items-baseline text-sm text-ink-3">
          <p>For deaf and hard-of-hearing students, and everyone learning in a second language.</p>
          <p className="font-[family-name:var(--font-tiro-deva)] text-lg text-ink-2" lang="hi">
            सबके लिए शिक्षा
          </p>
        </div>
      </footer>
    </div>
  );
}
