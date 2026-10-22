"use client";

import { useState } from "react";
import { Volume2, X, Send, ShieldAlert } from "lucide-react";

interface SpeakForMeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string, kind: "speak" | "question") => Promise<void>;
  lectureId: string;
}

// Things any student might need to say in any lecture; the typed box covers the rest.
const PRESET_PHRASES = [
  "Could you please repeat the last point?",
  "Could you please explain that again more slowly?",
  "Could you give an example of that?",
  "Please write that on the board.",
  "I can't see the board clearly. Could you zoom in or read it out?",
  "I have a question about this topic.",
];

export function SpeakForMeModal({ isOpen, onClose, onSubmit, lectureId }: SpeakForMeModalProps) {
  const [customText, setCustomText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSend = async (phrase: string) => {
    if (!phrase.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      await onSubmit(phrase.trim(), "speak");
      setSentSuccess(true);
      setTimeout(() => {
        setSentSuccess(false);
        setCustomText("");
        onClose();
      }, 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink/40">
      <div className="cc-card p-6 max-w-lg w-full animate-chalk-in">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div>
              <h3 className="text-2xl font-normal">
                Speak for me
              </h3>
              <p className="text-xs text-ink-3">
                Type it, and your teacher can play it aloud on the classroom speakers.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-ink-3 hover:bg-paper-2 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {sentSuccess ? (
          <div className="bg-patta-wash border border-patta-line text-patta-deep rounded-xl p-6 text-center my-4">
            <div className="w-12 h-12 rounded-full bg-card border border-patta-line flex items-center justify-center mx-auto mb-2">
              <Volume2 className="w-6 h-6 text-patta" />
            </div>
            <p className="font-bold text-base">Sent to your teacher</p>
            <p className="text-xs mt-1 text-patta-deep">
              It will be read aloud when your teacher plays it.
            </p>
          </div>
        ) : (
          <>
            {/* Quick Vernacular / Indian English Presets */}
            <div className="my-4">
              <label className="cc-eyebrow block mb-2">
                Quick phrases
              </label>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto no-scrollbar">
                {PRESET_PHRASES.map((phrase, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(phrase)}
                    disabled={loading}
                    className="text-left px-3 py-2.5 rounded-[10px] border border-rule bg-paper hover:bg-card hover:border-ink text-sm text-ink transition flex items-center justify-between gap-2 group"
                  >
                    <span>&ldquo;{phrase}&rdquo;</span>
                    <Volume2 className="w-3.5 h-3.5 text-ink-3 group-hover:text-neel flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-sindoor-wash border border-sindoor-line text-sindoor-deep text-xs font-semibold">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </p>
            )}
            {/* Custom Input */}
            <div className="pt-3 border-t border-rule">
              <label className="cc-eyebrow block mb-1.5">
                Or type your own
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customText}
                  onChange={(e) => { setCustomText(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSend(customText)}
                  placeholder="Type what you want to ask aloud..."
                  className="cc-input flex-1 h-12 px-4 text-sm text-ink"
                />
                <button
                  onClick={() => handleSend(customText)}
                  disabled={loading || !customText.trim()}
                  className="cc-btn cc-btn-primary h-12 px-5 text-sm flex items-center gap-1.5"
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
