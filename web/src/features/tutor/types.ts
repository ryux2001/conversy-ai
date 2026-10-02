import type { PronunciationFeedback, TutorFeedback } from "@/features/chat/types";

export type { TutorFeedback };

export interface TutorTaskReference {
  intent: "explain_message" | "translate_message" | "suggest_reply" | "review_message" |
    "explain_correction" | "recall_message" | "general_help" | "clarify";
  source: "practice_assistant" | "practice_user" | "tutor" | null;
  targetMessageId: string | null;
  reason: "explicit" | "follow_up" | "inferred" | "ambiguous";
}

export interface TutorMessage {
  id: string;
  role: "user" | "tutor";
  content: string;
  kind?: "correction" | "pronunciation";
  targetMessageId?: string;
  correction?: TutorFeedback;
  pronunciation?: PronunciationFeedback;
  task?: TutorTaskReference;
}
