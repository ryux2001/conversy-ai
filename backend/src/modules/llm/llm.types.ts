export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmOptions {
  maxTokens?: number;
  temperature?: number;
  responseFormat?: Record<string, unknown>;
  purpose?: 'conversation' | 'tutor-evaluation' | 'tutor-reply' | 'pronunciation';
}

export interface LlmCompletion {
  content: string;
  finishReason: string | null;
  model: string | null;
}
