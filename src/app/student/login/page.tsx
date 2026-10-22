"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Brand } from "@/components/brand/Brand";
import { api, setPref } from "@/lib/client/api";

/** Student sign-in / sign-up. An account keeps every classroom and past lecture on any device. */
function StudentLoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const pin = params?.get("pin") ?? "";
  const [mode, setMode] = useState<"login" | "signup">(params?.get("mode") === "signup" ? "signup" : "login");
  const [form, setForm] = useState({ name: "", email: "", password: "", rollNo: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api<{ student: { name: string }; classrooms: number }>(mode === "login" ? "/api/auth/student/login" : "/api/auth/student/signup", {
        json: mode === "login" ? { email: form.email, password: form.password } : form,
      });
      setPref("name", d.student.name);
      // Came from a classroom QR code: finish joining that class; otherwise go to the lecture library.
      const next = params?.get("next");
      router.replace(pin ? `/join?pin=${pin}` : next?.startsWith("/student") ? next : d.classrooms ? "/student" : "/join");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const input = "cc-input w-full h-11 px-3 text-[15px]";
  const label = "cc-eyebrow block mb-1.5";

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5">
        <Brand className="justify-center" />

        <form onSubmit={submit} className="cc-card p-6 sm:p-7 space-y-5">
          <div>
            <p className="font-[family-name:var(--font-tiro-deva)] text-sindoor text-lg leading-none mb-1" lang="hi">विद्यार्थी</p>
            <h1 className="text-3xl font-normal">Student account</h1>
            <p className="text-sm text-ink-3 mt-1">Your classes, past lectures, notes and quizzes on any phone or laptop.</p>
          </div>

          <div className="grid grid-cols-2 border-b border-rule">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={`h-10 -mb-px text-sm font-semibold border-b-2 transition ${mode === m ? "border-sindoor text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {mode === "signup" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label htmlFor="name" className={label}>Your name</label>
                <input id="name" value={form.name} onChange={set("name")} required minLength={2} maxLength={40} autoComplete="name" className={input} />
              </div>
              <div>
                <label htmlFor="roll" className={label}>Roll no.</label>
                <input id="roll" value={form.rollNo} onChange={set("rollNo")} placeholder="Optional" maxLength={30} className={input} />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="email" className={label}>Email</label>
            <input id="email" type="email" value={form.email} onChange={set("email")} required autoComplete="email" className={input} />
          </div>
          <div>
            <label htmlFor="password" className={label}>Password</label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={set("password")}
              required
              minLength={mode === "signup" ? 8 : 1}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "At least 8 characters" : ""}
              className={input}
            />
          </div>

          {error && <p className="text-sm text-sindoor font-semibold">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="cc-btn cc-btn-primary w-full h-12 text-[15px]"
          >
            {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
            <ArrowRight className="w-4 h-4" />
          </button>
          {mode === "signup" && (
            <p className="text-xs text-ink-3">Classes you already joined on this device move into your account.</p>
          )}
        </form>

        <p className="text-center text-sm text-ink-3">
          Just want to join today&apos;s class? <Link href={`/join${pin ? `?pin=${pin}` : ""}`} className="font-semibold text-neel underline underline-offset-4 decoration-neel-line">Join with the PIN</Link>
        </p>
      </div>
    </div>
  );
}

export default function StudentLoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-ink-2">Loading...</div>}>
      <StudentLoginContent />
    </Suspense>
  );
}
