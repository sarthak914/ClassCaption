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
    { id: "recordings", label: "Recordings", href: "/student/lectures/demo", icon: Video },
    { id: "notes", label: "AI Notes", href: "/student/lectures/demo?tab=notes", icon: Sparkles },
    { id: "profile", label: "Profile", href: "/teacher/dashboard", icon: User },
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
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] px-3 py-2">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeId === tab.id;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition ${
                isActive
                  ? "bg-[#1E3A8A] text-white font-semibold shadow-sm"
                  : "text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9]"
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-[#475569]"}`} />
              <span className="text-[11px] mt-0.5 tracking-tight">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
