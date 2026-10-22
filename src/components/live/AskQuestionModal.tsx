"use client";

import { useState } from "react";
import { X, Send, UserCheck, EyeOff, ShieldAlert } from "lucide-react";

interface AskQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string, isAnonymous: boolean) => Promise<void>;
  lectureId: string;
  studentName?: string;
}

export function AskQuestionModal({ isOpen, onClose, onSubmit, studentName }: AskQuestionModalProps) {
  const [text, setText] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || loading) return;

    setLoading(true);
    setError("");
    try {
      await onSubmit(text.trim(), isAnonymous);
      setSentSuccess(true);
      setTimeout(() => {
        setSentSuccess(false);
        setText("");
        onClose();
      }, 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-ink/40">
      <div className="cc-card p-6 max-w-lg w-full animate-chalk-in">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div>
              <h3 className="text-2xl font-normal">Ask your teacher</h3>
              <p className="text-xs text-ink-3">
                Appears in your teacher&apos;s question queue right away, in their language
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
            <p className="font-semibold text-base">Question sent</p>
            <p className="text-xs mt-1 text-patta-deep">
              Your teacher has received your question.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setError(""); }}
                rows={3}
                placeholder="Type your question or doubt here..."
                required
                className="cc-input w-full p-3.5 text-[15px] resize-none"
              />
            </div>

            {/* Anonymous Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-paper border border-rule">
              <div className="flex items-center gap-2">
                {isAnonymous ? (
                  <EyeOff className="w-4 h-4 text-patta" />
                ) : (
                  <UserCheck className="w-4 h-4 text-neel" />
                )}
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {isAnonymous ? "Ask anonymously" : `Include my name${studentName ? ` (${studentName})` : ""}`}
                  </p>
                  <p className="text-[11px] text-ink-3">
                    {isAnonymous
                      ? "Your teacher sees the question without your name"
                      : "Helps teacher address you directly"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAnonymous(!isAnonymous)}
                role="switch"
                aria-checked={isAnonymous}
                aria-label="Ask anonymously"
                className={`w-12 h-6 flex-shrink-0 flex items-center rounded-full p-1 transition-colors duration-200 ${
                  isAnonymous ? "bg-patta" : "bg-rule-strong"
                }`}
              >
                <div
                  className={`bg-card w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    isAnonymous ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {error && (
              <p role="alert" className="flex items-start gap-2 p-3 rounded-xl bg-sindoor-wash border border-sindoor-line text-sindoor-deep text-xs font-semibold">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="cc-btn h-11 px-4 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !text.trim()}
                className="cc-btn cc-btn-primary h-11 px-6 text-sm flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                <span>Send question</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
