import type { Metadata } from "next";
import { connection } from "next/server";
import {
  Fraunces,
  Anek_Latin,
  Anek_Devanagari,
  Anek_Bangla,
  Anek_Tamil,
  Anek_Telugu,
  Anek_Gujarati,
  Anek_Kannada,
  Anek_Malayalam,
  Anek_Gurmukhi,
  Anek_Odia,
  Tiro_Devanagari_Hindi,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";

// Display serif for headings; Anek (by Ek Type) for body text, because one family covers Latin and the
// Indian scripts students read captions in, so every language sits on the page with the same voice.
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["SOFT", "opsz"], style: ["normal", "italic"], display: "swap" });
const anekLatin = Anek_Latin({ variable: "--font-anek-latin", subsets: ["latin"], display: "swap" });
// Indic scripts download only when a page shows that script.
const anekDeva = Anek_Devanagari({ display: "swap", preload: false, variable: "--font-anek-deva", subsets: ["devanagari"] });
const anekBangla = Anek_Bangla({ display: "swap", preload: false, variable: "--font-anek-bangla", subsets: ["bengali"] });
const anekTamil = Anek_Tamil({ display: "swap", preload: false, variable: "--font-anek-tamil", subsets: ["tamil"] });
const anekTelugu = Anek_Telugu({ display: "swap", preload: false, variable: "--font-anek-telugu", subsets: ["telugu"] });
const anekGujarati = Anek_Gujarati({ display: "swap", preload: false, variable: "--font-anek-gujarati", subsets: ["gujarati"] });
const anekKannada = Anek_Kannada({ display: "swap", preload: false, variable: "--font-anek-kannada", subsets: ["kannada"] });
const anekMalayalam = Anek_Malayalam({ display: "swap", preload: false, variable: "--font-anek-malayalam", subsets: ["malayalam"] });
const anekGurmukhi = Anek_Gurmukhi({ display: "swap", preload: false, variable: "--font-anek-gurmukhi", subsets: ["gurmukhi"] });
const anekOdia = Anek_Odia({ display: "swap", preload: false, variable: "--font-anek-odia", subsets: ["oriya"] });
const tiroDeva = Tiro_Devanagari_Hindi({ display: "swap", preload: false, variable: "--font-tiro-deva", weight: "400", style: ["normal", "italic"], subsets: ["devanagari"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["500", "700"], display: "swap" });

const fontVars = [
  fraunces, anekLatin, anekDeva, anekBangla, anekTamil, anekTelugu, anekGujarati,
  anekKannada, anekMalayalam, anekGurmukhi, anekOdia, tiroDeva, mono,
].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: "ClassCaption · Every lecture, in every Indian language",
  description: "Real-time multilingual live captions, AI-glossary, speech pace coaching, and lecture intelligence for Indian educational institutions.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the public Supabase settings when the page is served, not when it was built,
  // so the same build (or Docker image) works with whichever project its env points at.
  await connection();
  const publicEnv = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
  return (
    <html
      lang="en"
      className={`${fontVars} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-paper text-ink">
        <script dangerouslySetInnerHTML={{ __html: `window.__CC_PUBLIC=${JSON.stringify(publicEnv).replace(/</g, "\\u003c")}` }} />
        {children}
      </body>
    </html>
  );
}
