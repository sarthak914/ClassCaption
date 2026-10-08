"use client";

import { useState } from "react";
import { MessageSquarePlus, Volume2, X, Send, Sparkles } from "lucide-react";

interface SpeakForMeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string, kind: "speak" | "question") => Promise<void>;
  lectureId: string;
}

const PRESET_PHRASES = [
  "Sir, could you please repeat the last code explanation?",
  "Prof, what is the space complexity of the recursion stack?",
  "Can you please explain In-order vs Pre-order traversal with a diagram?",
  "Sir, what happens if the root node is null in base condition?",
  "Please zoom in on the whiteboard formula.",
  "Is AVL balance factor checked before or after node insertion?",
];

export function SpeakForMeModal({ isOpen, onClose, onSubmit, lectureId }: SpeakForMeModalProps) {
  const [customText, setCustomText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (phrase: string) => {
    if (!phrase.trim() || loading) return;
    setLoading(true);
    try {
      await onSubmit(phrase.trim(), "speak");
      setSentSuccess(true);
      setTimeout(() => {
        setSentSuccess(false);
        setCustomText("");
        onClose();
      }, 1500);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-[#CBD5E1] p-6 max-w-lg w-full shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-[#1E3A8A]">
            <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] flex items-center justify-center text-[#1E3A8A]">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0F172A] font-heading">
                Speak for Me (TTS Assistant)
              </h3>
              <p className="text-xs text-[#64748B]">
                Synthesizes clear speech through classroom speakers or instructor audio queue
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {sentSuccess ? (
          <div className="bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] rounded-2xl p-6 text-center my-4">
            <div className="w-12 h-12 rounded-full bg-[#D1FAE5] flex items-center justify-center mx-auto mb-2">
              <Volume2 className="w-6 h-6 text-[#059669]" />
            </div>
            <p className="font-bold text-base">Sent to Instructor Audio Queue!</p>
            <p className="text-xs mt-1 text-[#047857]">
              Your voice prompt has been prioritized for the professor.
            </p>
          </div>
        ) : (
          <>
            {/* Quick Vernacular / Indian English Presets */}
            <div className="my-4">
              <label className="text-xs font-bold uppercase tracking-wider text-[#475569] block mb-2">
                Quick Academic Phrases
              </label>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto no-scrollbar">
                {PRESET_PHRASES.map((phrase, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(phrase)}
                    disabled={loading}
                    className="text-left p-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#EFF6FF] hover:border-[#BFDBFE] text-xs font-medium text-[#0F172A] transition flex items-center justify-between gap-2 group"
                  >
                    <span>&ldquo;{phrase}&rdquo;</span>
                    <Volume2 className="w-3.5 h-3.5 text-[#64748B] group-hover:text-[#1E3A8A] flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input */}
            <div className="pt-3 border-t border-[#E2E8F0]">
              <label className="text-xs font-bold uppercase tracking-wider text-[#475569] block mb-1.5">
                Or Type Custom Text
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend(customText)}
                  placeholder="Type what you want to ask aloud..."
                  className="flex-1 h-12 px-4 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/20 outline-none"
                />
                <button
                  onClick={() => handleSend(customText)}
                  disabled={loading || !customText.trim()}
                  className="h-12 px-5 rounded-xl bg-[#1E3A8A] hover:bg-[#00236F] text-white font-bold text-sm flex items-center gap-1.5 shadow-sm disabled:opacity-50 active:scale-95 transition"
                >
                  <Send className="w-4 h-4" />
                  <span>Speak</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
