import type { TutorFeedback } from "@/features/chat/types";

export type { TutorFeedback };

export interface TutorMessage {
  id: string;
  role: "user" | "tutor";
  content: string;
  kind?: "correction";
  targetMessageId?: string;
  correction?: TutorFeedback;
}
