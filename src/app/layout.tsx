import type { Metadata } from "next";
import { connection } from "next/server";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClassCaption — AI-Powered Classroom Accessibility Platform",
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
      className={`${plusJakartaSans.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#F8FAFC] text-[#0F172A]">
        <script dangerouslySetInnerHTML={{ __html: `window.__CC_PUBLIC=${JSON.stringify(publicEnv).replace(/</g, "\\u003c")}` }} />
        {children}
      </body>
    </html>
  );
}
