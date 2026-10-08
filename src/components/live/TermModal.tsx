"use client";

import { Sparkles, X, Volume2, BookOpen } from "lucide-react";

interface TermModalProps {
  isOpen: boolean;
  onClose: () => void;
  term: string;
  translatedTerm?: string;
  definition?: string;
  pronunciation?: string;
}

export function TermModal({
  isOpen,
  onClose,
  term,
  translatedTerm = "बाइनरी ट्री",
  definition = "एक नॉन-लीनियर डेटा स्ट्रक्चर जहाँ प्रत्येक नोड के अधिकतम दो चाइल्ड नोड्स (Left और Right) हो सकते हैं।",
  pronunciation = "बाई-न-री ट्री",
}: TermModalProps) {
  if (!isOpen) return null;

  const playPronunciation = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(term);
      window.speechSynthesis.speak(u);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-[#CBD5E1] p-6 max-w-md w-full shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 text-[#1E3A8A]">
            <Sparkles className="w-5 h-5 fill-[#1E3A8A]" />
            <h3 className="text-xl font-bold text-[#0F172A] font-heading">
              {term} {translatedTerm && <span className="text-[#1E3A8A]">({translatedTerm})</span>}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-base text-[#0F172A] font-medium leading-relaxed mb-5">
          {definition}
        </p>

        <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
          <span className="flex items-center gap-1 font-semibold text-[#1E3A8A]">
            <BookOpen className="w-3.5 h-3.5" />
            Bhashini STEM Glossary v3.2
          </span>

          <button
            onClick={playPronunciation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F1F5F9] text-[#0F172A] font-semibold hover:bg-[#E2E8F0] transition active:scale-95"
          >
            <Volume2 className="w-4 h-4 text-[#1E3A8A]" />
            <span>Audio Pronounce</span>
          </button>
        </div>
      </div>
    </div>
  );
}
