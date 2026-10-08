"use client";

import { useState } from "react";
import { HelpCircle, X, Send, UserCheck, EyeOff } from "lucide-react";

interface AskQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string, isAnonymous: boolean) => Promise<void>;
  lectureId: string;
}

export function AskQuestionModal({ isOpen, onClose, onSubmit, lectureId }: AskQuestionModalProps) {
  const [text, setText] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || loading) return;

    setLoading(true);
    try {
      await onSubmit(text.trim(), isAnonymous);
      setSentSuccess(true);
      setTimeout(() => {
        setSentSuccess(false);
        setText("");
        onClose();
      }, 1200);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-[#CBD5E1] p-6 max-w-lg w-full shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 text-[#1E3A8A]">
            <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] flex items-center justify-center text-[#1E3A8A]">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#0F172A] font-heading">
                Ask a Question to Professor
              </h3>
              <p className="text-xs text-[#64748B]">
                Appears on the instructor telemetry monitor in real-time
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
            <p className="font-bold text-base">Question Submitted!</p>
            <p className="text-xs mt-1 text-[#047857]">
              The professor has received your question.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="Type your question or doubt here..."
                required
                className="w-full p-3.5 rounded-2xl border border-[#CBD5E1] bg-white text-sm text-[#0F172A] focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/20 outline-none resize-none"
              />
            </div>

            {/* Anonymous Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                {isAnonymous ? (
                  <EyeOff className="w-4 h-4 text-[#059669]" />
                ) : (
                  <UserCheck className="w-4 h-4 text-[#1E3A8A]" />
                )}
                <div>
                  <p className="text-xs font-bold text-[#0F172A]">
                    {isAnonymous ? "Ask Anonymously" : "Include My Name (Rahul V.)"}
                  </p>
                  <p className="text-[11px] text-[#64748B]">
                    {isAnonymous
                      ? "Your name will not be shown to classmates or teacher"
                      : "Helps teacher address you directly"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAnonymous(!isAnonymous)}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ${
                  isAnonymous ? "bg-[#059669]" : "bg-[#CBD5E1]"
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                    isAnonymous ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="h-11 px-4 rounded-xl border border-[#E2E8F0] text-[#475569] font-semibold text-sm hover:bg-[#F1F5F9] transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !text.trim()}
                className="h-11 px-6 rounded-xl bg-[#1E3A8A] hover:bg-[#00236F] text-white font-bold text-sm flex items-center gap-1.5 shadow-sm disabled:opacity-50 active:scale-95 transition"
              >
                <Send className="w-4 h-4" />
                <span>Submit Question</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
