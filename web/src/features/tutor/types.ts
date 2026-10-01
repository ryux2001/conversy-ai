import type { PronunciationFeedback, TutorFeedback } from "@/features/chat/types";

export type { TutorFeedback };

export interface TutorMessage {
  id: string;
  role: "user" | "tutor";
  content: string;
  kind?: "correction" | "pronunciation";
  targetMessageId?: string;
  correction?: TutorFeedback;
  pronunciation?: PronunciationFeedback;
}
