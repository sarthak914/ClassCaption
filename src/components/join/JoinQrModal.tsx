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

/** The join link for a PIN (on this laptop's Wi-Fi address) and its QR code as SVG markup. */
function useJoinQr(pin: string, enabled: boolean) {
  const [base, setBase] = useState("");
  const [svg, setSvg] = useState("");

  useEffect(() => {
    if (!enabled || base) return;
    api<{ base: string }>("/api/join-url")
      .then((d) => setBase(d.base))
      .catch(() => setBase(window.location.origin));
  }, [enabled, base]);

  const link = base ? `${base}/join?pin=${pin}` : "";

  useEffect(() => {
    if (!link) return;
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1b1d33", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [link]);

  return { link, svg };
}

/** A small always-visible QR code and PIN for the teacher's live page; tap it for the projector view. */
export function JoinQrCard({ pin, onExpand }: { pin: string; onExpand: () => void }) {
  const { svg } = useJoinQr(pin, true);
  return (
    <button
      onClick={onExpand}
      title="Show the big QR code for the projector"
      className="cc-card w-full p-4 flex items-center gap-4 text-left hover:border-rule-strong transition group"
    >
      <span className="w-24 h-24 flex-shrink-0 rounded-lg border-[1.5px] border-ink bg-white p-1.5 shadow-[2px_2px_0_var(--color-ink)]">
        {svg ? (
          <span className="block w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <span className="block w-full h-full rounded bg-paper-2 animate-pulse" />
        )}
      </span>
      <span className="min-w-0">
        <span className="cc-eyebrow block">Students join here</span>
        <span className="block font-mono font-bold text-3xl tracking-[0.2em] text-neel leading-tight mt-1">{pin}</span>
        <span className="block text-xs text-ink-3 mt-1 group-hover:text-neel">Scan, or tap to show it big on the projector</span>
      </span>
    </button>
  );
}

/** Projector view: a big QR code and PIN that students scan with their phone camera. */
export function JoinQrModal({ isOpen, onClose, classroomId, classroomName, pin, onPinChange }: JoinQrModalProps) {
  const { link, svg } = useJoinQr(pin, isOpen);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60" onClick={onClose}>
      <div className="cc-card p-6 sm:p-8 max-w-lg w-full text-center space-y-5 animate-chalk-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 text-left">
          <div>
            <span className="cc-eyebrow">Join {classroomName}</span>
            <h3 className="text-3xl font-normal">Scan with your phone camera</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full flex items-center justify-center text-ink-3 hover:bg-paper-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mx-auto w-full max-w-[320px] aspect-square rounded-xl border-[1.5px] border-ink bg-white p-3 shadow-[3px_3px_0_var(--color-ink)] flex items-center justify-center">
          {svg ? (
            <div className="w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <span className="text-sm text-ink-3">Making QR code...</span>
          )}
        </div>

        <div>
          <span className="cc-eyebrow block mb-1">or enter PIN</span>
          <span className="text-5xl font-bold font-mono tracking-[0.25em] text-neel">{pin}</span>
        </div>

        <p className="text-xs text-ink-2 break-all">{link || "..."}</p>
        <p className="text-[11px] text-ink-3">Phones must be on the same Wi-Fi or hotspot as this laptop.</p>

        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <button onClick={copy} disabled={!link} className="cc-btn h-10 px-4 text-xs">
            <Copy className="w-4 h-4" />
            {copied ? "Copied" : "Copy link"}
          </button>
          <button onClick={rotate} disabled={rotating} className="cc-btn h-10 px-4 text-xs">
            <RefreshCw className={`w-4 h-4 ${rotating ? "animate-spin" : ""}`} />
            New PIN
          </button>
        </div>
      </div>
    </div>
  );
}
