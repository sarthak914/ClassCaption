"use client";

import { X, Volume2 } from "lucide-react";

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink/40" onClick={onClose}>
      <div className="cc-card p-6 max-w-md w-full animate-chalk-in" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Meaning of ${term}`}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <span className="cc-eyebrow">Word to know</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 -mt-1 -mr-1 rounded-full flex items-center justify-center text-ink-3 hover:bg-paper-2 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <h3 className="text-3xl font-normal leading-tight">{term}</h3>
        {translatedTerm && <p className="text-xl text-sindoor mt-0.5">{translatedTerm}</p>}

        <p className="text-lg text-ink leading-relaxed mt-4 mb-5">{definition}</p>

        <div className="pt-4 border-t border-rule flex items-center justify-between text-xs text-ink-3">
          <span>Explained in your language</span>

          <button onClick={playPronunciation} className="cc-btn h-9 px-3 text-xs">
            <Volume2 className="w-4 h-4 text-neel" />
            <span>Hear it</span>
          </button>
        </div>
      </div>
    </div>
  );
}
