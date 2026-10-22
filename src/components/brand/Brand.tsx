import Link from "next/link";
import { LANGUAGES } from "@/lib/languages";

/** The ClassCaption mark: the first letter of the Devanagari alphabet, written above two caption lines. */
export function LogoMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative inline-flex flex-shrink-0 items-start justify-center rounded-[10px] bg-neel text-white shadow-[2px_2px_0_var(--color-ink)] border-[1.5px] border-ink ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="font-[family-name:var(--font-tiro-deva)] leading-none" style={{ fontSize: size * 0.56, marginTop: size * 0.1 }}>
        अ
      </span>
      <span className="absolute left-[22%] right-[22%] rounded-full bg-haldi" style={{ bottom: size * 0.2, height: Math.max(2, size * 0.07) }} />
      <span className="absolute left-[22%] right-[42%] rounded-full bg-white/70" style={{ bottom: size * 0.09, height: Math.max(2, size * 0.07) }} />
    </span>
  );
}

/** Logo and wordmark, linking home. */
export function Brand({
  href = "/",
  subtitle,
  size = 40,
  className = "",
}: {
  href?: string;
  subtitle?: string;
  size?: number;
  className?: string;
}) {
  return (
    <Link href={href} className={`flex items-center gap-3 text-ink hover:opacity-90 ${className}`}>
      <LogoMark size={size} />
      <span className="min-w-0">
        <span className="block font-heading text-xl font-semibold leading-none tracking-tight">
          Class<span className="italic text-neel">Caption</span>
        </span>
        {subtitle && <span className="mt-1 block truncate text-[11px] font-medium text-ink-3 leading-none">{subtitle}</span>}
      </span>
    </Link>
  );
}

/** A slow ribbon of the languages ClassCaption speaks, each in its own script. */
export function LanguageRibbon({ tone = "paper", className = "" }: { tone?: "paper" | "ink"; className?: string }) {
  const items = LANGUAGES.filter((l) => l.code !== "en");
  const row = (key: string) => (
    <div key={key} className="flex items-center" aria-hidden={key === "b"}>
      {items.map((l) => (
        <span key={l.code} className="flex items-center gap-3 px-5 whitespace-nowrap">
          <span className="text-2xl leading-none" lang={l.code}>{l.native}</span>
          <span className={`cc-eyebrow !text-[0.62rem] ${tone === "ink" ? "!text-chalk-dim" : ""}`}>{l.name}</span>
          <span className={`ml-3 h-1.5 w-1.5 rotate-45 ${tone === "ink" ? "bg-haldi" : "bg-sindoor"}`} />
        </span>
      ))}
    </div>
  );
  return (
    <div
      className={`overflow-hidden border-y py-3 ${tone === "ink" ? "border-board-line bg-board text-chalk" : "border-rule bg-paper-2 text-ink"} ${className}`}
      role="img"
      aria-label={`Captions in ${items.map((l) => l.name).join(", ")}`}
    >
      <div className="cc-ribbon-track">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}
