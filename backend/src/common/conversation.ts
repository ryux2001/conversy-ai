import { BadRequestException } from '@nestjs/common';

export type ConversationRole = 'user' | 'assistant';
export type TutorRole = 'user' | 'tutor';
export type Locale = 'en' | 'es';

export type TutorTaskIntent = 'explain_message' | 'translate_message' | 'suggest_reply' | 'review_message' | 'explain_correction' | 'recall_message' | 'general_help' | 'clarify';
export type TutorTaskSource = 'practice_assistant' | 'practice_user' | 'tutor' | null;
export interface TutorTaskReference {
  intent: TutorTaskIntent;
  source: TutorTaskSource;
  targetMessageId: string | null;
  reason: 'explicit' | 'follow_up' | 'inferred' | 'ambiguous';
}

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
}

export interface TutorMessage {
  id: string;
  role: TutorRole;
  content: string;
  kind?: 'correction' | 'pronunciation';
  targetMessageId?: string;
  correction?: TutorCorrection;
  pronunciation?: TutorPronunciation;
  task?: TutorTaskReference;
}

export interface TutorPronunciation {
  targetMessageId: string;
  issues: Array<{ word: string; phoneme?: string; score: number }>;
}

export interface TutorCorrectionIssue {
  original: string;
  replacement: string;
  type: 'grammar' | 'spelling' | 'capitalization' | 'punctuation' | 'naturalness';
}

export interface TutorCorrection {
  targetMessageId: string;
  hasCorrection: boolean;
  suggestion: string | null;
  explanation: string;
  issues?: TutorCorrectionIssue[];
}

const MAX_MESSAGES = 24;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_TOTAL_LENGTH = 24_000;

function asRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestException(`${name} debe ser un objeto.`);
  }
  return value as Record<string, unknown>;
}

function parseMessages<T extends { id: string; content: string }>(
  value: unknown,
  field: string,
  allowedRoles: readonly string[],
): Array<T & { role: string }> {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    throw new BadRequestException(`${field} debe contener entre 1 y ${MAX_MESSAGES} mensajes.`);
  }

  let totalLength = 0;
  const ids = new Set<string>();

  return value.map((entry, index) => {
    const message = asRecord(entry, `${field}[${index}]`);
    const { id, role, content } = message;

    if (typeof id !== 'string' || id.length === 0 || id.length > 80 || ids.has(id)) {
      throw new BadRequestException(`${field}[${index}].id no es válido.`);
    }
    if (typeof role !== 'string' || !allowedRoles.includes(role)) {
      throw new BadRequestException(`${field}[${index}].role no está permitido.`);
    }
    if (
      typeof content !== 'string' ||
      content.trim().length === 0 ||
      content.length > MAX_MESSAGE_LENGTH
    ) {
      throw new BadRequestException(`${field}[${index}].content no es válido.`);
    }

    totalLength += content.length;
    if (totalLength > MAX_TOTAL_LENGTH) {
      throw new BadRequestException(`${field} supera el límite de contexto.`);
    }
    ids.add(id);
    return { id, role, content } as T & { role: string };
  });
}

export function parseConversation(
  value: unknown,
  field = 'messages',
  requireLatestUser = true,
  allowEmpty = false,
): ConversationMessage[] {
  if (allowEmpty && Array.isArray(value) && value.length === 0) return [];
  const messages = parseMessages<ConversationMessage>(value, field, ['user', 'assistant']);
  if (requireLatestUser && messages.at(-1)?.role !== 'user') {
    throw new BadRequestException('El último mensaje de la conversación debe ser del usuario.');
  }
  return messages as ConversationMessage[];
}

export function parseTutorMessages(value: unknown, field = 'tutorMessages'): TutorMessage[] {
  const messages = parseMessages<TutorMessage>(value, field, ['user', 'tutor']);
  if (messages.at(-1)?.role !== 'user') {
    throw new BadRequestException('La última pregunta del tutor debe ser del usuario.');
  }
  const rawMessages = value as unknown[];
  return messages.map((message, index) => {
    if (message.role !== 'tutor') return message as TutorMessage;
    const raw = asRecord(rawMessages[index], `${field}[${index}]`);
    const task = parseTutorTaskReference(raw.task);
    const parsedMessage = task ? { ...message, task } : message;
    if (raw.kind === 'pronunciation') {
      if (
        typeof raw.targetMessageId !== 'string' || raw.targetMessageId.length === 0 || raw.targetMessageId.length > 80 ||
        typeof raw.pronunciation !== 'object' || raw.pronunciation === null || Array.isArray(raw.pronunciation)
      ) return message as TutorMessage;
      const data = raw.pronunciation as Record<string, unknown>;
      if (data.targetMessageId !== raw.targetMessageId || !Array.isArray(data.issues) || data.issues.length > 1) {
        return message as TutorMessage;
      }
      const issues = data.issues.flatMap((entry): TutorPronunciation['issues'] => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [];
        const issue = entry as Record<string, unknown>;
        if (
          typeof issue.word !== 'string' || issue.word.length === 0 || issue.word.length > 80 ||
          (issue.phoneme !== undefined && (typeof issue.phoneme !== 'string' || issue.phoneme.length > 20)) ||
          typeof issue.score !== 'number' || !Number.isFinite(issue.score) || issue.score < 0 || issue.score > 100
        ) return [];
        return [{ word: issue.word, ...(typeof issue.phoneme === 'string' ? { phoneme: issue.phoneme } : {}), score: issue.score }];
      });
      return {
        ...parsedMessage,
        kind: 'pronunciation',
        targetMessageId: raw.targetMessageId,
        pronunciation: { targetMessageId: raw.targetMessageId, issues },
      } as TutorMessage;
    }
    if (raw.kind !== 'correction') return parsedMessage as TutorMessage;
    if (
      typeof raw.targetMessageId !== 'string' ||
      raw.targetMessageId.length === 0 ||
      raw.targetMessageId.length > 80 ||
      typeof raw.correction !== 'object' ||
      raw.correction === null ||
      Array.isArray(raw.correction)
    ) return message as TutorMessage;

    const correction = raw.correction as Record<string, unknown>;
    if (
      correction.targetMessageId !== raw.targetMessageId ||
      typeof correction.hasCorrection !== 'boolean' ||
      !(typeof correction.suggestion === 'string' || correction.suggestion === null) ||
      typeof correction.explanation !== 'string'
    ) return message as TutorMessage;

    const validTypes = ['grammar', 'spelling', 'capitalization', 'punctuation', 'naturalness'] as const;
    const issues = Array.isArray(correction.issues)
      ? correction.issues.flatMap((entry): TutorCorrectionIssue[] => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [];
        const issue = entry as Record<string, unknown>;
        if (
          typeof issue.original !== 'string' ||
          typeof issue.replacement !== 'string' ||
          typeof issue.type !== 'string' ||
          !validTypes.includes(issue.type as typeof validTypes[number])
        ) return [];
        return [{
          original: issue.original,
          replacement: issue.replacement,
          type: issue.type as TutorCorrectionIssue['type'],
        }];
      })
      : undefined;

    return {
      ...parsedMessage,
      kind: 'correction',
      targetMessageId: raw.targetMessageId,
      correction: {
        targetMessageId: raw.targetMessageId,
        hasCorrection: correction.hasCorrection,
        suggestion: typeof correction.suggestion === 'string' ? correction.suggestion : null,
        explanation: correction.explanation,
        ...(issues ? { issues } : {}),
      },
    } as TutorMessage;
  });
}

function parseTutorTaskReference(value: unknown): TutorTaskReference | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const task = value as Record<string, unknown>;
  const intents: TutorTaskIntent[] = [
    'explain_message', 'translate_message', 'suggest_reply', 'review_message',
    'explain_correction', 'recall_message', 'general_help', 'clarify',
  ];
  const sources: TutorTaskSource[] = ['practice_assistant', 'practice_user', 'tutor', null];
  const reasons: TutorTaskReference['reason'][] = ['explicit', 'follow_up', 'inferred', 'ambiguous'];
  if (
    typeof task.intent !== 'string' || !intents.includes(task.intent as TutorTaskIntent) ||
    !sources.includes(task.source as TutorTaskSource) ||
    !(typeof task.targetMessageId === 'string' || task.targetMessageId === null) ||
    (typeof task.targetMessageId === 'string' && (task.targetMessageId.length === 0 || task.targetMessageId.length > 80)) ||
    typeof task.reason !== 'string' || !reasons.includes(task.reason as TutorTaskReference['reason']) ||
    (task.source === null && task.targetMessageId !== null) ||
    (task.source !== null && typeof task.targetMessageId !== 'string')
  ) return undefined;
  return {
    intent: task.intent as TutorTaskIntent,
    source: task.source as TutorTaskSource,
    targetMessageId: task.targetMessageId as string | null,
    reason: task.reason as TutorTaskReference['reason'],
  };
}

export function parseLocale(value: unknown): Locale {
  if (value === undefined) return 'es';
  if (value === 'en' || value === 'es') return value;
  throw new BadRequestException('locale debe ser "en" o "es".');
}

export function parseObject(value: unknown, name: string): Record<string, unknown> {
  return asRecord(value, name);
}
