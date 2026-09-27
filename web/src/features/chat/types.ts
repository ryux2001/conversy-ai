export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface TutorFeedback {
  targetMessageId: string;
  hasCorrection: boolean;
  suggestion: string | null;
  explanation: string;
}

export type FeedbackState =
  | { status: "loading" }
  | { status: "error"; code: string }
  | { status: "ready"; feedback: TutorFeedback };
