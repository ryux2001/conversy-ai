"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Locale } from "@/shared/lib/copy";
import { ChatWorkspace } from "@/features/chat/components/chat-workspace";

export function PersistentPracticeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [locale, setLocale] = useState<Locale>("es");
  const isVoicePractice = pathname === "/voice";

  return (
    <>
      <div hidden={isVoicePractice}>
        <ChatWorkspace mode="text" locale={locale} onLocaleChange={setLocale} isActive={!isVoicePractice} />
      </div>
      <div hidden={!isVoicePractice}>
        <ChatWorkspace mode="voice" locale={locale} onLocaleChange={setLocale} isActive={isVoicePractice} />
      </div>
      {children}
    </>
  );
}
