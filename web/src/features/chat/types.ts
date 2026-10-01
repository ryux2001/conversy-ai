export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  modality?: "text" | "audio";
  audioUrl?: string;
  audioError?: string;
  audioState?: "transcribing" | "transcription-error" | "ready" | "synthesizing" | "audio-error";
}

export interface PronunciationIssue {
  word: string;
  phoneme?: string;
  score: number;
}

export interface PronunciationFeedback {
  targetMessageId: string;
  issues: PronunciationIssue[];
}

export interface TutorFeedback {
  targetMessageId: string;
  hasCorrection: boolean;
  suggestion: string | null;
  explanation: string;
  issues?: TutorCorrectionIssue[];
}

export interface TutorCorrectionIssue {
  original: string;
  replacement: string;
  type: "grammar" | "spelling" | "capitalization" | "punctuation" | "naturalness";
}

export type FeedbackState =
  | { status: "loading" }
  | { status: "error"; code: string }
  | { status: "ready"; feedback: TutorFeedback };
