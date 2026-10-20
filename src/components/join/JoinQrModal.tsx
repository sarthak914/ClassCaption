"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, RefreshCw, X } from "lucide-react";
import { api } from "@/lib/client/api";

interface JoinQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  classroomId: string;
  classroomName: string;
  pin: string;
  /** Called with the new PIN after the teacher rotates it. */
  onPinChange?: (pin: string) => void;
}

/** Projector view: a big QR code and PIN that students scan with their phone camera. */
export function JoinQrModal({ isOpen, onClose, classroomId, classroomName, pin, onPinChange }: JoinQrModalProps) {
  const [base, setBase] = useState("");
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    if (!isOpen || base) return;
    api<{ base: string }>("/api/join-url")
      .then((d) => setBase(d.base))
      .catch(() => setBase(window.location.origin));
  }, [isOpen, base]);

  const link = base ? `${base}/join?pin=${pin}` : "";

  useEffect(() => {
    if (!link) return;
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0F172A", light: "#FFFFFF" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [link]);

  if (!isOpen) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const rotate = async () => {
    if (!confirm("Make a new PIN? The current PIN and QR code stop working for new students. Students who already joined keep access.")) return;
    setRotating(true);
    try {
      const d = await api<{ classroom: { join_code: string } }>(`/api/classrooms/${classroomId}/pin`, { method: "POST" });
      onPinChange?.(d.classroom.join_code);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs" onClick={onClose}>
      <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl text-center space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 text-left">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">Join {classroomName}</span>
            <h3 className="text-xl font-extrabold text-[#0F172A] font-heading">Scan with your phone camera</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full flex items-center justify-center text-[#64748B] hover:bg-[#F1F5F9]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mx-auto w-full max-w-[320px] aspect-square rounded-2xl border border-[#E2E8F0] p-3 flex items-center justify-center">
          {svg ? (
            <div className="w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <span className="text-sm text-[#64748B]">Making QR code...</span>
          )}
        </div>

        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#64748B] block">or enter PIN</span>
          <span className="text-5xl font-extrabold font-mono tracking-[0.2em] text-[#1E3A8A]">{pin}</span>
        </div>

        <p className="text-xs text-[#475569] break-all">{link || "..."}</p>
        <p className="text-[11px] text-[#64748B]">Phones must be on the same Wi-Fi or hotspot as this laptop.</p>

        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <button onClick={copy} disabled={!link} className="h-10 px-4 rounded-xl border border-[#CBD5E1] text-[#0F172A] font-bold text-xs flex items-center gap-1.5 hover:bg-[#F1F5F9]">
            <Copy className="w-4 h-4" />
            {copied ? "Copied" : "Copy link"}
          </button>
          <button onClick={rotate} disabled={rotating} className="h-10 px-4 rounded-xl border border-[#CBD5E1] text-[#0F172A] font-bold text-xs flex items-center gap-1.5 hover:bg-[#F1F5F9] disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${rotating ? "animate-spin" : ""}`} />
            New PIN
          </button>
        </div>
      </div>
    </div>
  );
}
