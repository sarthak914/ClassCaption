"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Volume2, ZoomIn, Maximize2, Languages, PhoneOff, Menu, GraduationCap } from "lucide-react";
import { useState } from "react";

interface NavbarProps {
  title?: string;
  subtitle?: string;
  showEndLecture?: boolean;
  onEndLecture?: () => void;
  selectedLang?: string;
  onToggleLang?: () => void;
}

export function Navbar({
  title = "ClassCaption",
  subtitle = "Assistive Lecture Stream",
  showEndLecture = false,
  onEndLecture,
  selectedLang = "Hindi / हिंदी",
  onToggleLang,
}: NavbarProps) {
  const pathname = usePathname();
  const [fontSize, setFontSize] = useState<"normal" | "large" | "huge">("normal");

  const toggleFontSize = () => {
    const next = fontSize === "normal" ? "large" : fontSize === "large" ? "huge" : "normal";
    setFontSize(next);
    document.documentElement.style.fontSize = next === "normal" ? "16px" : next === "large" ? "18px" : "20px";
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-[#E2E8F0] px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
        {/* Left branding */}
        <div className="flex items-center gap-3">
          <Link href="/student" className="flex items-center gap-2.5 text-[#0F172A] hover:opacity-90">
            <div className="w-9 h-9 rounded-xl bg-[#1E3A8A] flex items-center justify-center text-white shadow-sm">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-[#0F172A] block leading-tight font-heading">
                {title}
              </span>
              {subtitle && (
                <span className="text-[11px] font-medium text-[#475569] block leading-none">
                  {subtitle}
                </span>
              )}
            </div>
          </Link>
        </div>

        {/* Right Accessibility & Action Controls */}
        <div className="flex items-center gap-2">
          {/* Quick Sound Test */}
          <button
            onClick={() => {
              if (typeof window !== "undefined" && "speechSynthesis" in window) {
                const u = new SpeechSynthesisUtterance("ClassCaption audio output check.");
                window.speechSynthesis.speak(u);
              }
            }}
            title="Test Audio Output"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F1F5F9] active:scale-95 transition"
            aria-label="Audio Test"
          >
            <Volume2 className="w-4 h-4" />
          </button>

          {/* Font Size Zoom */}
          <button
            onClick={toggleFontSize}
            title="Enlarge Caption Text Size"
            className="h-9 px-2.5 flex items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white text-[#0F172A] font-semibold text-xs hover:bg-[#F1F5F9] active:scale-95 transition"
            aria-label="Toggle Font Size"
          >
            <span className="font-bold">A+</span>
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="w-9 h-9 hidden sm:flex items-center justify-center rounded-lg border border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F1F5F9] active:scale-95 transition"
            aria-label="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Language Switch Button */}
          {onToggleLang && (
            <button
              onClick={onToggleLang}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-[#1E3A8A] text-white font-medium text-xs shadow-sm hover:bg-[#00236F] active:scale-95 transition"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>{selectedLang}</span>
            </button>
          )}

          {/* End Lecture Button (Teacher Mode) */}
          {showEndLecture && onEndLecture && (
            <button
              onClick={onEndLecture}
              className="h-9 px-3.5 flex items-center gap-1.5 rounded-lg border border-[#DC2626] text-[#DC2626] bg-white hover:bg-[#FEF2F2] font-semibold text-xs active:scale-95 transition"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>End Lecture</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
