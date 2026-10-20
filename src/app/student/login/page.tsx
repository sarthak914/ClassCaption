"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, ArrowRight, BookOpen } from "lucide-react";
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

  const input = "w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm focus:border-[#1E3A8A] outline-none";
  const label = "text-xs font-bold uppercase tracking-wider text-[#475569] block mb-1";

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5">
        <Link href="/" className="flex items-center gap-3 justify-center">
          <div className="w-10 h-10 rounded-2xl bg-[#1E3A8A] flex items-center justify-center text-white shadow-sm">
            <GraduationCap className="w-6 h-6" />
          </div>
          <span className="font-extrabold text-xl tracking-tight font-heading">ClassCaption</span>
        </Link>

        <form onSubmit={submit} className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] text-[#1E3A8A] flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold font-heading">Student account</h1>
              <p className="text-xs text-[#475569]">Your classes, past lectures, notes and quizzes on any phone or laptop.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F1F5F9]">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={`h-9 rounded-lg text-xs font-bold transition ${mode === m ? "bg-white text-[#1E3A8A] shadow-xs" : "text-[#475569]"}`}
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

          {error && <p className="text-sm text-[#DC2626] font-semibold">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full h-12 rounded-2xl bg-[#1E3A8A] hover:bg-[#00236F] text-white font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition active:scale-95"
          >
            {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
            <ArrowRight className="w-4 h-4" />
          </button>
          {mode === "signup" && (
            <p className="text-[11px] text-[#64748B]">Classes you already joined on this device move into your account.</p>
          )}
        </form>

        <p className="text-center text-xs text-[#64748B]">
          Just want to join today&apos;s class? <Link href={`/join${pin ? `?pin=${pin}` : ""}`} className="font-bold text-[#1E3A8A] hover:underline">Join with the PIN</Link>
        </p>
      </div>
    </div>
  );
}

export default function StudentLoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-[#475569]">Loading...</div>}>
      <StudentLoginContent />
    </Suspense>
  );
}
