"use client";

import Link from "next/link";
import {
  GraduationCap,
  Sparkles,
  Radio,
  BookOpen,
  Volume2,
  Users,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

export default function LandingLauncherPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col justify-between p-4 sm:p-6">
      {/* Header */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between py-4 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#1E3A8A] flex items-center justify-center text-white shadow-sm">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight text-[#0F172A] block leading-tight font-heading">
              ClassCaption
            </span>
            <span className="text-xs font-semibold text-[#475569] block">
              AI-Powered Classroom Accessibility Platform
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-[#ECFDF5] text-[#065F46] text-xs font-bold border border-[#A7F3D0] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
            Live IndicTrans2 Ready
          </span>
        </div>
      </header>

      {/* Hero & Role Selectors */}
      <main className="max-w-4xl mx-auto w-full my-8 space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <h1 className="text-3xl sm:text-5xl font-extrabold text-[#0F172A] tracking-tight font-heading leading-tight">
            Real-Time Multilingual Captions for Every Student
          </h1>
          <p className="text-base text-[#475569] leading-relaxed">
            Teacher speaks in Hindi or Hinglish &rarr; Instant speech recognition &rarr; Live AI translation into Indic languages (Hindi, Bengali, Tamil, Telugu, etc.) &rarr; Delivered to students in real-time.
          </p>
        </div>

        {/* 2 Primary Experience Cards matching Stitch */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Student Experience */}
          <div className="bg-white rounded-3xl border-2 border-[#1E3A8A]/20 p-6 shadow-sm hover:border-[#1E3A8A] transition flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-3 py-1 rounded-full bg-[#EFF6FF] text-[#1E40AF] text-xs font-extrabold">
                  STUDENT EXPERIENCE
                </span>
                <span className="text-xs font-mono font-bold text-[#059669]">Mobile-First</span>
              </div>

              <h2 className="text-xl font-bold text-[#0F172A] font-heading mb-2">
                Join Classroom &amp; Live Captions
              </h2>

              <p className="text-sm text-[#475569] leading-relaxed mb-4">
                Receive live translations in your preferred Indian language, tap &ldquo;I&apos;m Lost&rdquo; for anonymous confusion feedback, and access AI notes after class.
              </p>

              <div className="space-y-2 text-xs font-medium text-[#334155]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                  <span>High-Contrast Dark Viewport (#0B0F19)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                  <span>Interactive 1-Sentence AI Term Glossary</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                  <span>Assistive Speech Synthesis (&ldquo;Speak for Me&rdquo;)</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Link
                href="/student"
                className="w-full h-13 rounded-2xl bg-[#1E3A8A] hover:bg-[#00236F] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
              >
                <span>Launch Student Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/student/live/demo-live-01"
                className="w-full h-11 rounded-2xl bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Radio className="w-3.5 h-3.5 text-[#059669] animate-pulse" />
                <span>Open Live Caption Screen</span>
              </Link>
            </div>
          </div>

          {/* Teacher Experience */}
          <div className="bg-white rounded-3xl border-2 border-[#059669]/30 p-6 shadow-sm hover:border-[#059669] transition flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="px-3 py-1 rounded-full bg-[#ECFDF5] text-[#065F46] text-xs font-extrabold">
                  TEACHER EXPERIENCE
                </span>
                <span className="text-xs font-mono font-bold text-[#1E3A8A]">Desktop-First</span>
              </div>

              <h2 className="text-xl font-bold text-[#0F172A] font-heading mb-2">
                Live Classroom &amp; Telemetry
              </h2>

              <p className="text-sm text-[#475569] leading-relaxed mb-4">
                Speak normally while the Web Speech API and Indic translator stream captions. Monitor real-time confusion spikes, speech pace (WPM), and questions.
              </p>

              <div className="space-y-2 text-xs font-medium text-[#334155]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                  <span>Real-Time Speech Pace Coach (WPM Gauge)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                  <span>Live 4-Language Simultaneous Stream Monitor</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#059669]" />
                  <span>Student Confusion Heatmap &amp; TTS Audio Queue</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Link
                href="/teacher/live/demo-live-01"
                className="w-full h-13 rounded-2xl bg-[#059669] hover:bg-[#047857] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
              >
                <Radio className="w-4 h-4 animate-pulse" />
                <span>Start Live Teaching Screen</span>
              </Link>
              <Link
                href="/teacher/dashboard"
                className="w-full h-11 rounded-2xl bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <span>Manage Classrooms &amp; PIN Codes</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Recorded Lecture AI Hub Link */}
        <div className="bg-[#0B0F19] text-[#F8FAFC] rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl border border-white/10">
          <div>
            <span className="px-3 py-1 rounded-full bg-white/10 text-[#60A5FA] text-xs font-mono font-bold mb-2 inline-block">
              POST-LECTURE HUB
            </span>
            <h3 className="text-lg font-bold font-heading text-white">
              Recorded Lecture, AI Notes &amp; Bilingual Quiz
            </h3>
            <p className="text-xs text-gray-300">
              Interactive video timeline with confusion hotspots, audio narration, and AI question assistant.
            </p>
          </div>

          <Link
            href="/student/lectures/demo-live-01"
            className="px-6 py-3 rounded-2xl bg-[#1E3A8A] hover:bg-[#2563EB] text-white font-bold text-xs whitespace-nowrap transition active:scale-95 shadow-sm"
          >
            Open Recorded Hub &rarr;
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center py-4 border-t border-[#E2E8F0] text-xs text-[#64748B]">
        <p>ClassCaption &bull; WCAG AAA Compliant Educational Accessibility Platform</p>
      </footer>
    </div>
  );
}
