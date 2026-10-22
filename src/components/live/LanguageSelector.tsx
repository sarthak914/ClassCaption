"use client";

import { TARGET_LANGUAGES, LanguageCode } from "@/lib/languages";
import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

interface LanguageSelectorProps {
  selected: LanguageCode;
  onChange: (code: LanguageCode) => void;
  className?: string;
}

export function LanguageSelector({ selected, onChange, className = "" }: LanguageSelectorProps) {
  // Keep the chosen language in view: Tamil or Urdu sit far to the right of the strip.
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (row && chip) row.scrollTo({ left: chip.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [selected]);

  return (
    <div className={`w-full ${className}`}>
      <div ref={rowRef} className="relative flex items-center gap-2 overflow-x-auto no-scrollbar py-1 pr-1">
        {TARGET_LANGUAGES.map((lang) => {
          const isSelected = selected === lang.code;

          return (
            <button
              key={lang.code}
              onClick={() => onChange(lang.code)}
              aria-pressed={isSelected}
              className={`flex-shrink-0 min-w-[4.75rem] flex flex-col items-start px-3 pt-1.5 pb-1 rounded-[10px] border-[1.5px] text-left transition active:translate-y-px ${
                isSelected
                  ? "bg-neel border-ink text-white shadow-[2px_2px_0_var(--color-ink)]"
                  : "bg-card border-rule text-ink hover:border-rule-strong hover:bg-paper-2"
              }`}
            >
              <span lang={lang.code} className="text-lg leading-tight">{lang.native}</span>
              <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] flex items-center gap-1 ${isSelected ? "text-haldi-line" : "text-ink-3"}`}>
                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                {lang.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
