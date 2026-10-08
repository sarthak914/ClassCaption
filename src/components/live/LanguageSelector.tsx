"use client";

import { TARGET_LANGUAGES, LanguageCode } from "@/lib/languages";
import { Check } from "lucide-react";

interface LanguageSelectorProps {
  selected: LanguageCode;
  onChange: (code: LanguageCode) => void;
  className?: string;
}

export function LanguageSelector({ selected, onChange, className = "" }: LanguageSelectorProps) {
  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        {TARGET_LANGUAGES.map((lang) => {
          const isSelected = selected === lang.code;

          return (
            <button
              key={lang.code}
              onClick={() => onChange(lang.code)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition active:scale-95 ${
                isSelected
                  ? "bg-[#1E3A8A] text-white shadow-sm ring-2 ring-[#1E3A8A]/30"
                  : "bg-white text-[#475569] border border-[#E2E8F0] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
              }`}
            >
              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              <span>
                {lang.name} {lang.native !== lang.name ? `(${lang.native})` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
