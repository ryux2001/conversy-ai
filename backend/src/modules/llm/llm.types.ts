export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmOptions {
  maxTokens?: number;
  temperature?: number;
  responseFormat?: Record<string, unknown>;
}

export interface LlmCompletion {
  content: string;
  finishReason: string | null;
  model: string | null;
}
