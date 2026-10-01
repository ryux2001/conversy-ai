export interface SpeechTranscription {
  text: string;
  durationMs: number;
  language: 'en';
}

export interface PronunciationIssue {
  word: string;
  phoneme?: string;
  score: number;
}

export interface PronunciationAssessment {
  targetMessageId: string;
  issues: PronunciationIssue[];
  tutorMessage: string | null;
  durationMs?: number;
}
