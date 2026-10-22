"use client";

import { Brand } from "@/components/brand/Brand";
import { usePathname } from "next/navigation";
import { Volume2, Maximize2, Languages, PhoneOff } from "lucide-react";
import { useState } from "react";

interface NavbarProps {
  title?: string;
  subtitle?: string;
  showEndLecture?: boolean;
  onEndLecture?: () => void;
  selectedLang?: string;
  onToggleLang?: () => void;
  homeHref?: string;
}

export function Navbar({
  title = "ClassCaption",
  subtitle = "Assistive Lecture Stream",
  showEndLecture = false,
  onEndLecture,
  selectedLang = "Hindi / हिंदी",
  onToggleLang,
  homeHref = "/student",
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

  const iconBtn =
    "w-9 h-9 flex items-center justify-center rounded-[9px] border border-rule-strong bg-card text-ink-2 hover:bg-paper-2 hover:text-ink active:translate-y-px transition";

  return (
    <header className="sticky top-0 z-40 bg-paper/95 backdrop-blur-sm border-b border-rule">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 px-4 py-3">
        {/* Left branding */}
        <Brand href={homeHref} subtitle={subtitle} size={36} className="min-w-0" />
        {title !== "ClassCaption" && <span className="sr-only">{title}</span>}

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
            className={iconBtn}
            aria-label="Audio Test"
          >
            <Volume2 className="w-4 h-4" />
          </button>

          {/* Font Size Zoom */}
          <button
            onClick={toggleFontSize}
            title="Enlarge Caption Text Size"
            className={`${iconBtn} !w-auto px-2.5 font-heading text-sm font-semibold text-ink`}
            aria-label="Toggle Font Size"
          >
            <span>A</span>
            <span className="text-[10px] align-super">+</span>
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className={`${iconBtn} hidden sm:flex`}
            aria-label="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Language Switch Button */}
          {onToggleLang && (
            <button onClick={onToggleLang} className="cc-btn cc-btn-primary h-9 px-3 text-xs">
              <Languages className="w-3.5 h-3.5" />
              <span>{selectedLang}</span>
            </button>
          )}

          {/* End Lecture Button (Teacher Mode) */}
          {showEndLecture && onEndLecture && (
            <button onClick={onEndLecture} className="cc-btn cc-btn-sindoor h-9 px-3.5 text-xs">
              <PhoneOff className="w-3.5 h-3.5" />
              <span>End Lecture</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
