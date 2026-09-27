import { BadRequestException } from '@nestjs/common';

export type ConversationRole = 'user' | 'assistant';
export type TutorRole = 'user' | 'tutor';
export type Locale = 'en' | 'es';

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
}

export interface TutorMessage {
  id: string;
  role: TutorRole;
  content: string;
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
  return messages as TutorMessage[];
}

export function parseLocale(value: unknown): Locale {
  if (value === undefined) return 'es';
  if (value === 'en' || value === 'es') return value;
  throw new BadRequestException('locale debe ser "en" o "es".');
}

export function parseObject(value: unknown, name: string): Record<string, unknown> {
  return asRecord(value, name);
}
