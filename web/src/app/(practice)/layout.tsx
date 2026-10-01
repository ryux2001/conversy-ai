import type { ReactNode } from "react";
import { PersistentPracticeShell } from "@/features/navigation/components/persistent-practice-shell";

export default function PracticeLayout({ children }: { children: ReactNode }) {
  return <PersistentPracticeShell>{children}</PersistentPracticeShell>;
}
