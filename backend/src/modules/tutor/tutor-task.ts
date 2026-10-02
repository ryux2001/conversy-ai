import type { ConversationMessage, TutorMessage, TutorTaskReference, TutorTaskSource } from '../../common/conversation.js';
export type { TutorTaskIntent, TutorTaskReference, TutorTaskSource } from '../../common/conversation.js';
import type { TutorTaskIntent } from '../../common/conversation.js';

export interface TutorTaskResolution {
  reference: TutorTaskReference;
  target: { id: string; source: Exclude<TutorTaskSource, null>; content: string } | null;
  clarification: string | null;
}

function normalize(text: string) {
  return text.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function findPracticeTarget(
  conversation: ConversationMessage[],
  source: 'practice_assistant' | 'practice_user',
) {
  const role = source === 'practice_assistant' ? 'assistant' : 'user';
  const message = conversation.slice().reverse().find((candidate) => candidate.role === role);
  return message ? { id: message.id, source, content: message.content } : null;
}

function findTutorTarget(tutorMessages: TutorMessage[]) {
  const message = tutorMessages.slice(0, -1).reverse().find((candidate) => candidate.role === 'tutor');
  return message ? { id: message.id, source: 'tutor' as const, content: message.content } : null;
}

function priorTask(tutorMessages: TutorMessage[]): TutorTaskReference | undefined {
  return tutorMessages.slice(0, -1).reverse().find((message) =>
    message.role === 'tutor' && message.task?.targetMessageId,
  )?.task;
}

function chooseIntent(question: string): TutorTaskIntent {
  if (/\b(?:responder|contestar|reply|respond|answer)\b/u.test(question)) return 'suggest_reply';
  if (/\b(?:correccion|corregiste|corregi|correction|corrected|cambiaste|changed)\b/u.test(question) &&
    /\b(?:por que|why|explica|explain|cambiaste|corregiste)\b/u.test(question)) return 'explain_correction';
  if (/\b(?:errores|error|revisar|revisa|revisame|ortografia|grammar|mistakes|review|check)\b/u.test(question)) return 'review_message';
  if (/\b(?:traduce|traducir|traduccion|translate|translation)\b/u.test(question)) return 'translate_message';
  if (/\b(?:que significa|what does .+ mean|meaning of)\b/u.test(question)) return 'translate_message';
  if (/\b(?:cual|que) (?:fue|es) .{0,25}\b(?:ultimo|ultima|last|latest)\b/u.test(question) ||
    /\bwhat did i (?:last )?(?:say|send|write)\b/u.test(question)) return 'recall_message';
  if (/\b(?:que me quiso decir|que quiso decir|que quise decir|que quisiste decir|what did .+ mean|what was .+ saying|what does .+ want)\b/u.test(question)) return 'explain_message';
  if (/\b(?:que me (?:esta|estaba) preguntando|que (?:esta|estaba) preguntando|what is .+ asking(?: me)?|what was .+ asking(?: me)?)\b/u.test(question)) return 'explain_message';
  if (/\b(?:que|como).{0,35}\b(?:me respondio|me dijo|asked me|said to me|reply says|response says)\b/u.test(question)) return 'explain_message';
  if (/\b(?:ultimo|ultima|last|latest) (?:mensaje|respuesta|message|reply)\b/u.test(question) &&
    /\b(?:significa|quiere decir|dijo|respondio|meaning|mean|says|said)\b/u.test(question)) return 'explain_message';
  return 'general_help';
}

function chooseSource(question: string): { source: TutorTaskSource; reason: TutorTaskReference['reason'] } {
  if (/\b(?:tu|tutor|you|your) (?:ultimo |ultima |last |latest )?(?:mensaje|respuesta|message|reply)\b/u.test(question) ||
    /\b(?:que quisiste decir|que dijiste tu|what did you mean)\b/u.test(question)) {
    return { source: 'tutor', reason: 'explicit' };
  }
  if (/\b(?:mi|yo|my|i) (?:ultimo |ultima |last |latest )?(?:mensaje|frase|oracion|sentence|message)\b/u.test(question) ||
    /\b(?:lo que escribi|lo que dije yo|que quise decir yo|what i wrote|what i said|what did i mean)\b/u.test(question)) {
    return { source: 'practice_user', reason: 'explicit' };
  }
  if (/\b(?:ia|conversy|conversacion|assistant|bot)\b/u.test(question) ||
    /\b(?:ella|el) me (?:dijo|respondio|pregunto)\b/u.test(question) ||
    /\b(?:respondio|dijo|pregunto) ella\b/u.test(question) ||
    /\b(?:que me quiso decir|que me respondio|que me dijo|lo que me dijo|lo que me respondio|what did .+ mean|what was .+ saying)\b/u.test(question)) {
    return { source: 'practice_assistant', reason: 'explicit' };
  }
  return { source: null, reason: 'ambiguous' };
}

export function resolveTutorTask(
  question: string,
  conversation: ConversationMessage[],
  tutorMessages: TutorMessage[],
): TutorTaskResolution {
  const normalizedQuestion = normalize(question);
  const intent = chooseIntent(normalizedQuestion);
  const explicit = chooseSource(normalizedQuestion);
  const isFollowUp = /\b(?:pero|entonces|eso|esa|ese|ella|el|it|that|what about|y|me refiero)\b/u.test(normalizedQuestion);
  const previous = priorTask(tutorMessages);
  const source = explicit.source ?? (isFollowUp ? previous?.source ?? null : null);
  const reason = explicit.source ? explicit.reason : isFollowUp && previous ? 'follow_up' : explicit.reason;

  const priorTarget = isFollowUp && previous?.targetMessageId
    ? previous.source === 'tutor'
      ? tutorMessages.find((message) => message.role === 'tutor' && message.id === previous.targetMessageId)
      : previous.source === 'practice_assistant'
        ? conversation.find((message) => message.role === 'assistant' && message.id === previous.targetMessageId)
        : previous.source === 'practice_user'
          ? conversation.find((message) => message.role === 'user' && message.id === previous.targetMessageId)
          : undefined
    : undefined;

  if (intent === 'general_help' && !source) {
    return {
      reference: { intent, source: null, targetMessageId: null, reason },
      target: null,
      clarification: null,
    };
  }

  if (!source) {
    const hasPracticeAssistant = conversation.some((message) => message.role === 'assistant');
    const hasPracticeUser = conversation.some((message) => message.role === 'user');
    const hasTutorReply = tutorMessages.some((message) => message.role === 'tutor');
    if (intent === 'suggest_reply' || intent === 'review_message' || intent === 'explain_correction') {
      const inferredSource: TutorTaskSource = intent === 'suggest_reply' && conversation.some((message) => message.role === 'assistant')
        ? 'practice_assistant'
        : 'practice_user';
      const target = findPracticeTarget(conversation, inferredSource);
      return {
        reference: { intent, source: inferredSource, targetMessageId: target?.id ?? null, reason: 'inferred' },
        target,
        clarification: null,
      };
    }
    if (intent === 'translate_message' || intent === 'explain_message' || intent === 'recall_message') {
      const inferredSource: TutorTaskSource = hasPracticeAssistant
        ? 'practice_assistant'
        : hasPracticeUser
          ? 'practice_user'
          : hasTutorReply
            ? 'tutor'
            : null;
      if (inferredSource) {
        const target = inferredSource === 'tutor'
          ? findTutorTarget(tutorMessages)
          : findPracticeTarget(conversation, inferredSource);
        return {
          reference: { intent, source: inferredSource, targetMessageId: target?.id ?? null, reason: 'inferred' },
          target,
          clarification: target ? null : 'Todavía no hay un mensaje disponible para explicar.',
        };
      }
      return {
        reference: { intent: 'clarify', source: null, targetMessageId: null, reason: 'ambiguous' },
        target: null,
        clarification: '¿Quieres que te explique la respuesta de Conversy, tu mensaje o uno de mis mensajes?',
      };
    }
    return {
      reference: { intent: 'general_help', source: null, targetMessageId: null, reason: 'ambiguous' },
      target: null,
      clarification: null,
    };
  }

  const target = !explicit.source && priorTarget
    ? { id: priorTarget.id, source: source!, content: priorTarget.content }
    : source === 'tutor'
      ? findTutorTarget(tutorMessages)
      : findPracticeTarget(conversation, source);
  return {
    reference: { intent, source, targetMessageId: target?.id ?? null, reason },
    target,
    clarification: target ? null : source === 'practice_assistant'
      ? 'Conversy todavía no ha respondido en esta conversación.'
      : 'Todavía no hay un mensaje disponible para explicar.',
  };
}
