"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, GraduationCap, Video, Sparkles, User } from "lucide-react";

interface BottomNavProps {
  currentTab?: "home" | "classes" | "recordings" | "notes" | "profile";
}

export function BottomNav({ currentTab }: BottomNavProps) {
  const pathname = usePathname();

  const tabs = [
    { id: "home", label: "Home", href: "/student", icon: Home },
    { id: "classes", label: "Classes", href: "/student#classes", icon: GraduationCap },
    { id: "recordings", label: "Recordings", href: "/student#recordings", icon: Video },
    { id: "notes", label: "Glossary", href: "/student#glossary", icon: Sparkles },
    { id: "profile", label: "Profile", href: "/student#profile", icon: User },
  ];

  const activeId =
    currentTab ||
    (pathname === "/student"
      ? "home"
      : pathname.includes("/live")
      ? "classes"
      : pathname.includes("/lectures")
      ? "recordings"
      : "home");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-rule px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeId === tab.id;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center pt-2 pb-1 px-3 transition ${
                isActive ? "text-neel font-semibold" : "text-ink-3 hover:text-ink"
              }`}
            >
              <span className={`absolute top-0 left-3 right-3 h-[3px] rounded-b-full ${isActive ? "bg-sindoor" : "bg-transparent"}`} />
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.2 : 1.8} />
              <span className="text-[11px] mt-0.5">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
