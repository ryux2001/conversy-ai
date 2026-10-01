export type WhisperRequest =
  | { type: "prepare"; requestId: string }
  | { type: "transcribe"; requestId: string; samples: Float32Array; sampleRate: 16_000 };

export type WhisperResponse =
  | { type: "progress"; requestId: string; status: string; progress?: number; file?: string; loaded?: number; total?: number }
  | { type: "ready"; requestId: string }
  | { type: "transcript"; requestId: string; text: string; durationMs: number }
  | { type: "error"; requestId: string; code: string; message: string };
