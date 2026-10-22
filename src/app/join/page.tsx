"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { QrCode, ArrowRight, ShieldCheck, X } from "lucide-react";
import { Brand } from "@/components/brand/Brand";
import { api, pref, setPref } from "@/lib/client/api";
import { LANGUAGES } from "@/lib/languages";

/** The page a classroom QR code opens: PIN (pre-filled), the student's name and caption language. */
function JoinContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [pin, setPin] = useState((params?.get("pin") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
  const [name, setName] = useState("");
  const [lang, setLang] = useState("hi");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [canScan, setCanScan] = useState(false);
  const [account, setAccount] = useState<string | null>(null);

  useEffect(() => {
    // Signed-in student accounts join under their own name.
    api<{ student: { name: string; account: boolean } | null }>("/api/auth/me")
      .then((d) => {
        if (d.student?.account) {
          setAccount(d.student.name);
          setName(d.student.name);
        }
      })
      .catch(() => {});
    setName((n) => n || pref("name", ""));
    setLang(pref("lang", "hi"));
    // Any browser with camera access (https or localhost). Phones on http://<laptop IP> use their own camera app instead.
    setCanScan(typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  const join = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setJoining(true);
    setError("");
    try {
      const d = await api<{ live_class: { id: string } | null }>("/api/class/join", { json: { pin, name, lang } });
      setPref("name", name.trim());
      setPref("lang", lang);
      router.push(d.live_class ? `/student/live/${d.live_class.id}` : "/student");
    } catch (err) {
      setError((err as Error).message);
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <Brand className="justify-center" />

        <form onSubmit={join} className="cc-card p-6 sm:p-7 space-y-5">
          <div>
            <p className="font-[family-name:var(--font-tiro-deva)] text-sindoor text-lg leading-none mb-1" lang="hi">कक्षा में आइए</p>
            <h1 className="text-3xl font-normal">Join your class</h1>
            <p className="text-sm text-ink-3 mt-1">Use the PIN or QR code your teacher shows on the screen.</p>
          </div>

          <div>
            <label htmlFor="pin" className="cc-eyebrow block mb-1.5">Classroom PIN</label>
            <div className="flex gap-2">
              <input
                id="pin"
                value={pin}
                onChange={(e) => setPin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                required
                minLength={6}
                placeholder="6 characters"
                className="cc-input flex-1 min-w-0 h-14 px-4 text-2xl font-mono font-bold tracking-[0.4em] uppercase placeholder:tracking-normal placeholder:font-sans placeholder:text-sm placeholder:normal-case placeholder:font-normal"
              />
              {canScan && (
                <button type="button" onClick={() => setScanning(true)} aria-label="Scan QR code" className="cc-btn h-14 w-14 flex-shrink-0">
                  <QrCode className="w-6 h-6" />
                </button>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="name" className="cc-eyebrow block mb-1.5">Your name</label>
            <input
              id="name"
              value={name}
              readOnly={!!account}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={40}
              autoComplete="name"
              placeholder="As your teacher knows you"
              className="cc-input w-full h-12 px-4 text-base"
            />
            <p className="text-xs text-ink-3 mt-1.5">
              {account ? "From your student account. " : ""}Shown to your teacher only when you choose to. &ldquo;I&apos;m lost&rdquo; is always anonymous.
            </p>
          </div>

          <div>
            <span className="cc-eyebrow block mb-1.5">Captions in</span>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5" role="radiogroup" aria-label="Caption language">
              {LANGUAGES.map((l) => {
                const on = lang === l.code;
                return (
                  <button
                    key={l.code}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setLang(l.code)}
                    className={`rounded-[10px] border-[1.5px] px-2 pt-1.5 pb-1 text-left transition ${
                      on ? "bg-neel border-ink text-white shadow-[2px_2px_0_var(--color-ink)]" : "bg-card border-rule hover:border-rule-strong"
                    }`}
                  >
                    <span lang={l.code} className="block text-base leading-tight truncate">{l.native}</span>
                    <span className={`block text-[10px] font-semibold uppercase tracking-[0.1em] ${on ? "text-haldi-line" : "text-ink-3"}`}>{l.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-sm text-sindoor font-semibold">{error}</p>}

          <button
            type="submit"
            disabled={joining || pin.length < 6 || name.trim().length < 2}
            className="cc-btn cc-btn-primary w-full h-13 text-base"
          >
            {joining ? "Joining..." : "Join class"}
            <ArrowRight className="w-5 h-5" />
          </button>

          <p className="text-xs text-ink-3 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-patta flex-shrink-0" />
            {account
              ? `Signed in as ${account}: this classroom is saved to your account, so it shows up on every device.`
              : "This device gets a private pass for this classroom only. No account or phone number needed."}
          </p>
        </form>

        {!account && (
          <p className="text-center text-sm text-ink-3">
            Have a student account? <Link href={`/student/login${pin ? `?pin=${pin}` : ""}`} className="font-semibold text-neel underline underline-offset-4 decoration-neel-line">Sign in</Link> to keep your lectures on every device.
          </p>
        )}
        <p className="text-center text-sm text-ink-3">
          Teacher? <Link href="/teacher/login" className="font-semibold text-neel underline underline-offset-4 decoration-neel-line">Sign in here</Link>
        </p>
      </div>

      {scanning && (
        <QrScanner
          onClose={() => setScanning(false)}
          onCode={(text) => {
            setScanning(false);
            // Accept either a join link (…/join?pin=ABC123) or a bare PIN.
            const m = text.match(/[?&]pin=([A-Za-z0-9]{6})/) ?? text.trim().match(/^([A-Za-z0-9]{6})$/);
            if (m) setPin(m[1].toUpperCase());
            else setError("That QR code is not a ClassCaption classroom code.");
          }}
        />
      )}
    </div>
  );
}

type Detect = (v: HTMLVideoElement) => Promise<string | null>;

/** The browser's own QR reader (Chrome/Edge on Android, desktop) or jsQR on a canvas (iPhone Safari, Firefox). */
async function makeDetector(): Promise<Detect> {
  if ("BarcodeDetector" in window) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const BD = (window as any).BarcodeDetector;
      if ((await BD.getSupportedFormats?.())?.includes?.("qr_code") ?? true) {
        const detector = new BD({ formats: ["qr_code"] });
        return async (v) => (await detector.detect(v))[0]?.rawValue ?? null;
      }
    } catch {}
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (v) => {
    if (!ctx || !v.videoWidth) return null;
    // Downscale big camera frames: faster, and QR codes on a projector are large anyway.
    const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

/** Camera QR reader. */
function QrScanner({ onCode, onClose }: { onCode: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let done = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        const detect = await makeDetector();
        let busy = false;
        timer = setInterval(async () => {
          if (done || busy || v.readyState < 2) return;
          busy = true;
          try {
            const text = await detect(v);
            if (text && !done) {
              done = true;
              onCodeRef.current(text);
            }
          } catch {
          } finally {
            busy = false;
          }
        }, 250);
      } catch (err) {
        setError((err as Error).name === "NotAllowedError" ? "Camera permission was denied. Type the PIN instead." : "Camera unavailable here. Type the PIN instead.");
      }
    })();
    return () => {
      done = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-board flex flex-col items-center justify-center p-4">
      <button onClick={onClose} aria-label="Close scanner" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center">
        <X className="w-5 h-5" />
      </button>
      <video ref={videoRef} playsInline muted className="w-full max-w-md rounded-xl" />
      <p className="text-chalk text-sm mt-4 text-center">{error || "Point the camera at the QR code on the screen"}</p>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-ink-2">Loading...</div>}>
      <JoinContent />
    </Suspense>
  );
}
