import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  parseConversation,
  parseObject,
  parseTutorMessages,
} from '../../common/conversation.js';
import { LlmService } from '../llm/llm.service.js';
import type { PronunciationIssue } from '../speech/speech.types.js';
import type { LlmCompletion, LlmMessage } from '../llm/llm.types.js';
import { getConfiguredLlmProfile } from '../llm/llm-profile.js';
import { evaluationPrompt } from './prompts/evaluation.prompt.js';
import { tutorConversationPrompt } from './prompts/tutor-conversation.prompt.js';

const FEEDBACK_FORMAT = { type: 'json_object' };
const EVALUATION_TOKEN_LIMITS = [1536, 3072] as const;
const LFM_EVALUATION_TOKEN_LIMITS = [4096, 6144] as const;
const TUTOR_REPLY_TOKEN_LIMITS = [1024, 2048] as const;
const LFM_TUTOR_REPLY_TOKEN_LIMITS = [2048, 4096] as const;
const ENGLISH_NARRATIVE_WORDS = new Set([
  'a', 'an', 'and', 'answer', 'are', 'as', 'because', 'both', 'but', 'can', 'correct', 'could',
  'do', 'favorite', 'for', 'from', 'great', 'hello', 'have', 'i', 'if', 'in', 'is', 'it', 'its',
  'me', 'my', 'of', 'okay', 'or', 'playing', 'prefer', 'question', 'right', 'say', 'support',
  'sure', 'team', 'that', 'the', 'their', 'there', 'they', 'this', 'thanks', 'to', 'watching',
  'what', 'which', 'with', 'would', 'yes', 'you', 'your',
]);
const SPANISH_NARRATIVE_WORDS = new Set([
  'al', 'algo', 'ambas', 'ambos', 'aqui', 'ayuda', 'bien', 'claro', 'como', 'con', 'conversacion',
  'cuando', 'de', 'del', 'dijo', 'dice', 'el', 'ella', 'en', 'entiendo', 'entendido', 'es', 'escribe',
  'esta', 'exacto', 'explica', 'favorito', 'forma', 'futbol', 'gracias', 'gusta', 'habla', 'jugar',
  'la', 'lo', 'mas', 'me', 'mensaje', 'mi', 'no', 'para', 'parece', 'perfecto', 'podrias', 'porque',
  'pregunta', 'prefieres', 'puede', 'puedes', 'puedo', 'que', 'quieres', 'responder', 'respuesta',
  'seria', 'si', 'significa', 'sobre', 'tambien', 'te', 'tienes', 'tu', 'un', 'una', 'vale', 'ver',
  'yo',
]);

export interface TutorFeedback {
  targetMessageId: string;
  hasCorrection: boolean;
  suggestion: string | null;
  explanation: string;
  issues?: Array<{
    original: string;
    replacement: string;
    type: 'grammar' | 'spelling' | 'capitalization' | 'punctuation' | 'naturalness';
  }>;
}

const TUTOR_ISSUE_TYPES = new Set([
  'grammar', 'spelling', 'capitalization', 'punctuation', 'naturalness',
]);

function parseTutorIssues(value: unknown, spokenMessage = false): TutorFeedback['issues'] {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [];
    const issue = entry as Record<string, unknown>;
    if (
      typeof issue.original !== 'string' ||
      typeof issue.replacement !== 'string' ||
      typeof issue.type !== 'string' ||
      !TUTOR_ISSUE_TYPES.has(issue.type) ||
      (spokenMessage && issue.type !== 'grammar' && issue.type !== 'naturalness')
    ) return [];
    return [{
      original: issue.original,
      replacement: issue.replacement,
      type: issue.type as NonNullable<TutorFeedback['issues']>[number]['type'],
    }];
  });
}

function normalizeQuestion(question: string) {
  return question
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function tutorNarrative(text: string) {
  return text
    .replace(/[“][^”]*[”]|"[^"]*"|`[^`]*`/gu, ' ')
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\b(?:ejemplo en ingles|english example)\s*:[^\n]*/gu, ' ');
}

function hasEnglishTutorNarrative(text: string) {
  const words = tutorNarrative(text).match(/\b[a-z]+\b/gu) ?? [];
  const englishWords = words.filter((word) => ENGLISH_NARRATIVE_WORDS.has(word)).length;
  const spanishWords = words.filter((word) => SPANISH_NARRATIVE_WORDS.has(word)).length;
  const standaloneEnglish = /^(?:hello|yes|sure|thanks|great|okay|correct|exactly|absolutely)[.!?]*$/iu.test(tutorNarrative(text).trim());
  return standaloneEnglish || words.length === 0 || spanishWords === 0 ||
    (englishWords >= 2 && englishWords > spanishWords);
}

function speaksAsConversationPartner(text: string) {
  const narrative = tutorNarrative(text);
  return /\b(?:yo prefiero|me gusta (?:ver|jugar)|mi equipo (?:favorito|es)|apoyo a|soy aficionado)\b/u.test(narrative) ||
    /\[(?:insert|your favorite|team here|equipo favorito)[^\]]*\]/iu.test(text);
}

function violatesTutorContract(text: string) {
  return hasEnglishTutorNarrative(text) || speaksAsConversationPartner(text);
}

function asksToReviewLastMessage(question: string) {
  const normalized = normalizeQuestion(question);
  const directReview =
    /\b(?:hice bien|escribi bien|estuvo bien|esta bien lo que escribi|did i do well|did i write (?:well|this|that) correctly|did i make (?:a )?(?:mistake|error)|what (?:mistakes|errors) did i make|que errores cometi|que hice mal)\b/.test(normalized);
  const mentionsPracticeText =
    /\b(?:my|mi)\s+(?:(?:last|latest|previous|ultimo|ultima)\s+)?(?:message|sentence|mensaje|frase|oracion)\b|\b(?:last|latest|previous|ultimo|ultima)\s+(?:message|sentence|mensaje|frase|oracion)\b/.test(normalized);
  const asksForAssessment =
    /\b(?:correct|right|well|good|okay|mistakes?|errors?|review|check|feedback|natural|wrong|hice|estuvo|esta|cometi|escribi|correg\w*|revis\w*|evalu\w*|faltas?|errores?|ortografia|how did i)\b/.test(normalized);

  return directReview || (mentionsPracticeText && asksForAssessment);
}

function asksToRecallLastMessage(question: string) {
  const normalized = normalizeQuestion(question);
  return /\b(?:cual|que)\s+(?:fue|es)\s+(?:(?:mi|el)\s+)?(?:ultimo|ultima)\s+(?:mensaje|frase|oracion)\b/.test(normalized) ||
    /\bwhat\s+(?:was|is)\s+(?:(?:my|the)\s+)?(?:last|latest)\s+(?:message|sentence)\b/.test(normalized) ||
    /\bwhat\s+did\s+i\s+(?:last\s+)?(?:say|send|write)\b/.test(normalized);
}

function asksAboutMissingDo(question: string) {
  const normalized = normalizeQuestion(question);
  return /\b(?:me\s+)?falto\s+(?:el\s+)?do\b/.test(normalized) ||
    /\b(?:need|missing)\s+(?:the\s+)?do\b/.test(normalized) ||
    /\bdo\s+(?:was\s+)?(?:missing|required|needed)\b/.test(normalized);
}

function asksWhyCorrection(question: string) {
  const normalized = normalizeQuestion(question);
  return /\bwhy\b.{0,80}\b(?:change|changed|correct|corrected)\b/u.test(normalized) ||
    /\bpor que\b.{0,80}\b(?:cambiaste|cambie|corregiste|corregi)\b/u.test(normalized);
}

function pastTimeMarker(text: string) {
  return text.match(/\b(?:yesterday|last\s+(?:night|week|month|year)|\d+\s+days?\s+ago)\b/iu)?.[0];
}

function asksForSuggestedReply(question: string) {
  const normalized = normalizeQuestion(question);
  return /\b(?:que|como)\s+(?:le\s+)?(?:puedo|podria|debo)\s+(?:responder|contestar)\b/.test(normalized) ||
    /\bno\s+se\s+como\s+responder(?:le)?\b/.test(normalized) ||
    /\b(?:what should i reply|how should i respond|how can i answer)\b/.test(normalized);
}

function fulfillsSuggestedReplyFormat(text: string) {
  const normalized = normalizeQuestion(text);
  const example = normalized.match(/ejemplo en ingles\s*:\s*([\s\S]*?)\bsignifica\s*:/u)?.[1] ?? '';
  const translation = normalized.match(/\bsignifica\s*:\s*([\s\S]+)$/u)?.[1] ?? '';
  const exampleWords = example.match(/[a-z]+/gu)?.length ?? 0;
  const translationWords = translation.match(/[a-z]+/gu)?.length ?? 0;
  return /\bpuedes responder\s*:/u.test(normalized) &&
    exampleWords >= 3 &&
    translationWords >= 2;
}

function normalizedFragment(text: string) {
  return text
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’‘]/gu, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

function punctuationSignature(text: string) {
  return text.match(/[.,!?;:…]/gu)?.join('') ?? '';
}

function claimsPunctuationChange(explanation: string) {
  const normalized = normalizedFragment(explanation);
  return /\b(?:anadid|agregad|eliminad|quitad|corregid|faltaba|faltan)\w*\b.{0,60}\b(?:puntuacion|signo|interrogacion|exclamacion)\b/u.test(normalized) ||
    /\b(?:puntuacion|signo|interrogacion|exclamacion)\b.{0,60}\b(?:anadid|agregad|eliminad|quitad|corregid|faltaba|faltan)\w*\b/u.test(normalized);
}

function feedbackMatchesSource(source: string, feedback: TutorFeedback, spokenMessage = false) {
  const explanation = normalizedFragment(feedback.explanation);
  const claimsPunctuation = claimsPunctuationChange(explanation);
  const issues = feedback.issues ?? [];

  if (!feedback.hasCorrection) {
    return feedback.suggestion === null && issues.length === 0 && !claimsPunctuation;
  }
  if (!feedback.suggestion || feedback.suggestion.trim() === source.trim() || issues.length === 0) return false;

  if (spokenMessage) {
    if (issues.length !== 1) return false;
    const sourceWords = normalizedFragment(source).match(/[\p{L}\p{N}']+/gu) ?? [];
    const suggestionWords = normalizedFragment(feedback.suggestion).match(/[\p{L}\p{N}']+/gu) ?? [];
    let prefix = 0;
    while (prefix < sourceWords.length && prefix < suggestionWords.length && sourceWords[prefix] === suggestionWords[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < sourceWords.length - prefix &&
      suffix < suggestionWords.length - prefix &&
      sourceWords[sourceWords.length - 1 - suffix] === suggestionWords[suggestionWords.length - 1 - suffix]
    ) suffix += 1;

    const originalChange = sourceWords.slice(prefix, sourceWords.length - suffix).join(' ');
    const replacementChange = suggestionWords.slice(prefix, suggestionWords.length - suffix).join(' ');
    const issue = issues[0]!;
    if (
      !originalChange || originalChange.split(' ').length > 3 || replacementChange.split(' ').length > 3 ||
      normalizedFragment(issue.original) !== originalChange ||
      normalizedFragment(issue.replacement) !== replacementChange ||
      (issue.type !== 'grammar' && issue.type !== 'naturalness')
    ) return false;
    return true;
  }

  const sourceNormalized = normalizedFragment(source);
  const suggestionNormalized = normalizedFragment(feedback.suggestion);
  const hasPunctuationIssue = issues.some((issue) => issue.type === 'punctuation');
  if (claimsPunctuation && !hasPunctuationIssue) return false;

  return issues.every((issue) => {
    const original = normalizedFragment(issue.original);
    const replacement = normalizedFragment(issue.replacement);
    if (!original || !replacement || !sourceNormalized.includes(original) || !suggestionNormalized.includes(replacement)) {
      return false;
    }
    if (issue.type === 'punctuation') {
      return punctuationSignature(issue.original) !== punctuationSignature(issue.replacement);
    }
    return true;
  });
}

function clearSpokenPrepositionError(source: string, targetMessageId: string): TutorFeedback | null {
  if (!/\b(?:talk|speak)\s+about\s+of\b/iu.test(source)) return null;
  return {
    targetMessageId,
    hasCorrection: true,
    suggestion: source.replace(/\babout\s+of\b/iu, (phrase) => phrase.replace(/\s+of$/iu, '')),
    explanation: 'Después de “about” no se usa “of” en esta expresión. Conservé el resto de la transcripción tal como se reconoció.',
    issues: [{ original: 'of', replacement: '', type: 'grammar' }],
  };
}

function asksToExplainCorrection(question: string) {
  const normalized = normalizeQuestion(question);
  return /\b(?:explica\w*|explicar|explain\w*|why|por que)\b.{0,80}\b(?:correccion|corregiste|corregi|correction|corrected|cambiaste)\b/u.test(normalized) ||
    /\b(?:correccion|correction)\b.{0,80}\b(?:explica\w*|explain\w*|why|por que)\b/u.test(normalized);
}

function lastMessageSource(question: string): 'practice' | 'tutor' | 'ambiguous' {
  const normalized = normalizeQuestion(question);
  if (/\b(?:chat normal|chat principal|chat de practica|conversacion normal|conversacion principal|main chat|regular chat|practice chat)\b/.test(normalized)) {
    return 'practice';
  }
  if (/\b(?:chat del tutor|panel del tutor|chat de tutor|tutor chat|tutor panel|this chat|this panel|aqui en el tutor|aca en el tutor|aqui en este panel|en este chat)\b/.test(normalized)) {
    return 'tutor';
  }
  return 'ambiguous';
}

@Injectable()
export class TutorService {
  constructor(private readonly llm: LlmService) {}

  async evaluate(body: unknown) {
    const request = parseObject(body, 'body');
    const messages = parseConversation(request.messages);
    const latest = messages.at(-1)!;
    const modality = request.latestMessageModality;
    if (modality !== undefined && modality !== 'audio' && modality !== 'text') {
      throw new BadRequestException({ code: 'INVALID_MESSAGE_MODALITY', message: 'El origen del mensaje no es válido.' });
    }
    if (modality === 'audio') {
      const deterministicCorrection = clearSpokenPrepositionError(latest.content, latest.id);
      if (deterministicCorrection) return { feedback: deterministicCorrection };
    }
    const feedback = await this.evaluateMessages(messages, latest.id, modality === 'audio');

    return { feedback };
  }

  async explainPronunciation(issue: PronunciationIssue, transcript: string): Promise<string> {
    return this.llm.complete([
      {
        role: 'system',
        content: 'Eres un tutor de pronunciación de inglés. Responde en español con una explicación breve y amable (máximo 2 frases) sobre el problema acústico que el analizador detectó. La evidencia es el objeto recibido: no inventes otros errores, sonidos, reglas, causas ni puntuaciones. Si hay fonema, da un consejo articulatorio concreto solo para ese fonema; si no hay, sugiere practicar la palabra completa. No corrijas gramática ni respondas como el compañero de conversación.',
      },
      {
        role: 'user',
        content: JSON.stringify({ transcription: transcript, detectedIssue: issue }),
      },
    ], {
      maxTokens: 180,
      temperature: getConfiguredLlmProfile() === 'lfm25-thinking' ? 0.2 : 0.25,
      purpose: 'pronunciation',
    });
  }

  async reply(body: unknown) {
    const request = parseObject(body, 'body');
    const conversation = parseConversation(request.conversation, 'conversation', false, true);
    const tutorMessages = parseTutorMessages(request.tutorMessages);

    let latestPracticeIndex = -1;
    conversation.forEach((message, index) => {
      if (message.role === 'user') latestPracticeIndex = index;
    });
    const latestPracticeMessage = latestPracticeIndex >= 0
      ? conversation[latestPracticeIndex]!
      : undefined;
    const suppliedFeedback = latestPracticeMessage
      ? this.parseSuppliedFeedback(request.latestFeedback, latestPracticeMessage.id)
      : undefined;
    const latestQuestion = tutorMessages.at(-1)!.content;
    const removedRedundantAboutOf = suppliedFeedback?.issues?.some((issue) =>
      issue.original.toLowerCase() === 'of' && issue.replacement === '' &&
      /\babout\s+of\b/iu.test(latestPracticeMessage?.content ?? ''),
    ) ?? false;
    if (suppliedFeedback?.hasCorrection && asksToExplainCorrection(latestQuestion) && removedRedundantAboutOf) {
      return {
        message: {
          id: randomUUID(),
          role: 'tutor' as const,
          content: 'Quité “of” después de “about”; en esta expresión, “about” no lleva “of”. Conservé el resto de la transcripción, incluida la última palabra. Si esa palabra no coincide con lo que dijiste, edita la transcripción y vuelve a revisarla.',
        },
        feedback: suppliedFeedback,
      };
    }
    if (suppliedFeedback && !suppliedFeedback.hasCorrection && asksToExplainCorrection(latestQuestion)) {
      const needsTranscriptConfirmation = /confirm\w*|transcrip\w*|palabra desconocida|unknown word/iu.test(suppliedFeedback.explanation);
      return {
        message: {
          id: randomUUID(),
          role: 'tutor' as const,
          content: needsTranscriptConfirmation
            ? 'No hice una corrección segura porque no pude reconocer la última palabra con suficiente confianza. Puedes editar la transcripción y volveré a revisarla.'
            : 'No hice ninguna corrección porque no detecté un error claro en tu última frase.',
        },
        feedback: suppliedFeedback,
      };
    }
    const needsSuggestedReply = asksForSuggestedReply(latestQuestion);
    const latestStructuredCorrectionMessage = tutorMessages.slice(0, -1).reverse()
      .find((message) => message.role === 'tutor' && message.kind === 'correction');
    const correctionTarget = latestStructuredCorrectionMessage?.targetMessageId
      ? conversation.find((message) =>
        message.role === 'user' && message.id === latestStructuredCorrectionMessage.targetMessageId)
      : undefined;
    const latestStructuredCorrection = latestStructuredCorrectionMessage?.correction && correctionTarget
      ? this.parseSuppliedFeedback(
        latestStructuredCorrectionMessage.correction,
        correctionTarget.id,
      )
      : undefined;

    const asksRecallNow = asksToRecallLastMessage(latestQuestion);
    const previousTutorQuestion = tutorMessages.slice(0, -1).reverse()
      .find((message) => message.role === 'user');
    const clarifiesEarlierRecall = lastMessageSource(latestQuestion) !== 'ambiguous' &&
      previousTutorQuestion !== undefined &&
      asksToRecallLastMessage(previousTutorQuestion.content);

    if (asksRecallNow || clarifiesEarlierRecall) {
      const source = lastMessageSource(latestQuestion);
      if (source === 'ambiguous') {
        return {
          message: {
            id: randomUUID(),
            role: 'tutor' as const,
            content: '¿Te refieres a tu último mensaje en el chat normal o a tu último mensaje en este panel del tutor?',
          },
        };
      }

      const lastUserMessage = source === 'practice'
        ? conversation.slice().reverse().find((message) => message.role === 'user')
        : tutorMessages.slice(0, -1).reverse().find((message) => message.role === 'user');
      const sourceLabel = source === 'practice' ? 'el chat normal' : 'el panel del tutor';

      return {
        message: {
          id: randomUUID(),
          role: 'tutor' as const,
          content: lastUserMessage
            ? `Tu último mensaje en ${sourceLabel} fue: “${lastUserMessage.content}”`
            : `Todavía no hay mensajes tuyos en ${sourceLabel}.`,
        },
      };
    }

    if (!needsSuggestedReply && asksToReviewLastMessage(latestQuestion)) {
      if (!latestPracticeMessage) {
        return {
          message: {
            id: randomUUID(),
            role: 'tutor' as const,
            content: 'Todavía no hay un mensaje de práctica que pueda revisar.',
          },
        };
      }

      let feedback = suppliedFeedback;
      if (!feedback) {
        try {
          feedback = await this.evaluateMessages(
            conversation.slice(0, latestPracticeIndex + 1),
            latestPracticeMessage.id,
          );
        } catch {
          return {
            message: {
              id: randomUUID(),
              role: 'tutor' as const,
              content: 'No pude revisar tu último mensaje porque la evaluación no terminó. Pulsa «Reintentar» debajo de ese mensaje y vuelve a preguntarme.',
            },
          };
        }
      }

      return {
        message: {
          id: randomUUID(),
          role: 'tutor' as const,
          content: this.formatReviewAnswer(latestPracticeMessage.content, feedback),
        },
        feedback,
      };
    }

    const missingDoIssue = latestStructuredCorrection?.issues?.find((issue) =>
      issue.type === 'grammar' &&
      /^do\s+/iu.test(issue.replacement.trim()) &&
      !/^do\s+/iu.test(issue.original.trim()));
    if (asksAboutMissingDo(latestQuestion) && missingDoIssue) {
      return {
        message: {
          id: randomUUID(),
          role: 'tutor' as const,
          content: `Sí. Ejemplo en inglés: “${missingDoIssue.replacement}”. En esta pregunta necesitas “do” antes del sujeto.`,
        },
      };
    }

    const pastMarker = correctionTarget ? pastTimeMarker(correctionTarget.content) : undefined;
    const pastTenseIssue = latestStructuredCorrection?.issues?.find((issue) =>
      issue.type === 'grammar' &&
      correctionTarget &&
      normalizedFragment(correctionTarget.content).includes(normalizedFragment(issue.original)) &&
      latestStructuredCorrection.suggestion &&
      normalizedFragment(latestStructuredCorrection.suggestion).includes(normalizedFragment(issue.replacement)));
    if (asksWhyCorrection(latestQuestion) && pastMarker && pastTenseIssue) {
      return {
        message: {
          id: randomUUID(),
          role: 'tutor' as const,
          content: `“${pastMarker}” indica que hablas del pasado; por eso aquí usamos “${pastTenseIssue.replacement}” en lugar de “${pastTenseIssue.original}”.`,
        },
      };
    }

    const latestConversyMessage = conversation.slice().reverse()
      .find((message) => message.role === 'assistant');
    const practiceContext = this.formatPracticeContext(
      conversation,
      latestPracticeMessage?.content ?? null,
      latestConversyMessage ? { id: latestConversyMessage.id, content: latestConversyMessage.content } : null,
      suppliedFeedback ?? null,
      latestStructuredCorrection && correctionTarget
        ? { original: correctionTarget.content, feedback: latestStructuredCorrection }
        : null,
    );
    const llmMessages: LlmMessage[] = [
      {
        role: 'system',
        content: `${tutorConversationPrompt()}\n\n${practiceContext}${needsSuggestedReply
          ? '\n\nTAREA ACTUAL: el alumno pide ayuda para responder a Conversy. Usa la ÚLTIMA RESPUESTA DE CONVERSY como destinatario exacto. Devuelve solo este formato: "Puedes responder: Ejemplo en inglés: <una frase breve que conteste a Conversy>. Significa: <traducción natural al español>." No traduzcas la pregunta como si fuera una respuesta. No le pidas al alumno que te cuente algo a ti.'
          : ''}`,
      },
      ...tutorMessages.slice(-10).map(({ role, content }) => ({
        role: role === 'tutor' ? ('assistant' as const) : ('user' as const),
        content,
      })),
    ];
    let completion: LlmCompletion | undefined;
    let mustCorrectTutorContract = false;
    const replyTokenLimits = getConfiguredLlmProfile() === 'lfm25-thinking'
      ? LFM_TUTOR_REPLY_TOKEN_LIMITS
      : TUTOR_REPLY_TOKEN_LIMITS;
    for (const maxTokens of replyTokenLimits) {
      completion = await this.llm.completeWithMetadata(mustCorrectTutorContract
        ? [
          ...llmMessages,
          {
            role: 'system',
            content: needsSuggestedReply
              ? 'La respuesta anterior no cumplió la tarea. Reescríbela usando exactamente este formato: "Puedes responder: Ejemplo en inglés: <una frase breve que conteste a la última respuesta de Conversy>. Significa: <traducción natural al español>." No traduzcas la pregunta ni sigas la conversación como si fueras Conversy.'
              : 'La respuesta anterior incumplió las reglas. Reescríbela desde cero: toda explicación debe estar en español, no hables como Conversy ni inventes preferencias personales. El inglés solo puede aparecer en un ejemplo breve claramente etiquetado.',
          },
        ]
        : llmMessages, {
        maxTokens,
        temperature: getConfiguredLlmProfile() === 'lfm25-thinking' ? 0.2 : 0.45,
        purpose: 'tutor-reply',
      });
      if (completion.finishReason === 'length' || !completion.content) continue;
      if (!violatesTutorContract(completion.content) &&
        (!needsSuggestedReply || fulfillsSuggestedReplyFormat(completion.content))) break;
      mustCorrectTutorContract = true;
    }
    if (completion?.finishReason === 'length') {
      throw new BadGatewayException({
        code: 'LLM_OUTPUT_TRUNCATED',
        message: 'El modelo agotó el límite de salida antes de terminar la respuesta.',
      });
    }
    if (!completion?.content) {
      throw new BadGatewayException({
        code: 'LLM_EMPTY_RESPONSE',
        message: 'El modelo devolvió una respuesta vacía.',
      });
    }
    if (violatesTutorContract(completion.content) ||
      (needsSuggestedReply && !fulfillsSuggestedReplyFormat(completion.content))) {
      throw new BadGatewayException({
        code: 'LLM_TUTOR_CONTRACT_INVALID',
        message: 'El modelo no pudo preparar una respuesta del tutor en español.',
      });
    }
    const content = completion.content;

    return {
      message: { id: randomUUID(), role: 'tutor' as const, content },
      ...(suppliedFeedback ? { feedback: suppliedFeedback } : {}),
    };
  }

  private async evaluateMessages(
    messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>,
    targetMessageId: string,
    spokenMessage = false,
  ): Promise<TutorFeedback> {
    const baseMessages: LlmMessage[] = [
      { role: 'system', content: evaluationPrompt(spokenMessage) },
      ...messages.slice(-8).map(({ role, content }) => ({ role, content })),
    ];
    let mustCorrectLanguage = false;
    let mustCorrectFeedback = false;
    let languageFailure = false;
    let feedbackFailure = false;
    let lastCompletion: LlmCompletion | undefined;

    const evaluationTokenLimits = getConfiguredLlmProfile() === 'lfm25-thinking'
      ? LFM_EVALUATION_TOKEN_LIMITS
      : EVALUATION_TOKEN_LIMITS;
    for (const maxTokens of evaluationTokenLimits) {
      const retryInstructions: LlmMessage[] = [];
      if (mustCorrectLanguage) {
        retryInstructions.push({
          role: 'system',
          content: 'La clave explanation de tu respuesta JSON debe estar íntegramente en español. La sugerencia puede seguir en inglés porque es la corrección que aprenderá el alumno.',
        });
      }
      if (mustCorrectFeedback) {
        retryInstructions.push({
          role: 'system',
          content: spokenMessage
            ? 'La transcripción de voz debe conservar todas las palabras fuera del error. Si propones una corrección, cambia una única secuencia gramatical de hasta tres palabras, pon solo esas palabras en issues[0].original y issues[0].replacement, y usa type grammar o naturalness. No cambies palabras desconocidas, no marques ortografía y no adivines. Si no puedes cumplirlo, devuelve hasCorrection false, suggestion null e issues vacío y pide confirmar la transcripción en español.'
            : 'Revisa que cada issue.original aparezca en la frase original y cada issue.replacement aparezca en suggestion. Solo afirma que cambió la puntuación si los signos realmente difieren. No inventes cambios. Si no puedes justificar una corrección, devuelve hasCorrection false, suggestion null e issues vacío.',
        });
      }
      lastCompletion = await this.llm.completeWithMetadata(retryInstructions.length
        ? [...baseMessages, ...retryInstructions]
        : baseMessages, {
        maxTokens,
        temperature: 0.2,
        responseFormat: FEEDBACK_FORMAT,
        purpose: 'tutor-evaluation',
      });
      const parsed = this.parseFeedback(lastCompletion.content, targetMessageId, spokenMessage);
      const source = messages.at(-1)!.content;
      if (parsed && hasEnglishTutorNarrative(parsed.explanation)) {
        languageFailure = true;
        mustCorrectLanguage = true;
      } else if (parsed && !feedbackMatchesSource(source, parsed, spokenMessage)) {
        feedbackFailure = true;
        mustCorrectFeedback = true;
      } else if (parsed) {
        return parsed;
      }
    }

    if (lastCompletion?.finishReason === 'length') {
      throw new BadGatewayException({
        code: 'LLM_OUTPUT_TRUNCATED',
        message: 'El modelo agotó el límite de salida antes de completar la revisión.',
      });
    }
    if (!lastCompletion?.content) {
      throw new BadGatewayException({
        code: 'LLM_EMPTY_RESPONSE',
        message: 'El modelo devolvió una respuesta vacía al revisar el mensaje.',
      });
    }
    if (languageFailure) {
      throw new BadGatewayException({
        code: 'LLM_TUTOR_CONTRACT_INVALID',
        message: 'El modelo no pudo explicar la corrección en español.',
      });
    }
    if (feedbackFailure) {
      throw new BadGatewayException({
        code: 'LLM_FEEDBACK_INCONSISTENT',
        message: 'No pude verificar que la explicación del tutor coincida con los cambios de la frase.',
      });
    }
    throw new BadGatewayException({
      code: 'LLM_INVALID_JSON',
      message: 'El modelo no devolvió el formato esperado para la revisión.',
    });
  }

  private parseFeedback(raw: string, targetMessageId: string, spokenMessage = false): TutorFeedback | null {
    try {
      const jsonStart = raw.indexOf('{');
      const jsonEnd = raw.lastIndexOf('}');
      if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
      const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as Partial<TutorFeedback>;
      if (
        typeof parsed.hasCorrection !== 'boolean' ||
        !(typeof parsed.suggestion === 'string' || parsed.suggestion === null) ||
        typeof parsed.explanation !== 'string' ||
        (parsed.hasCorrection && !parsed.suggestion?.trim())
      ) {
        return null;
      }
      return {
        targetMessageId,
        hasCorrection: parsed.hasCorrection,
        suggestion: parsed.hasCorrection ? parsed.suggestion!.trim() : null,
        explanation: parsed.explanation.trim(),
        ...(Array.isArray(parsed.issues) ? { issues: parseTutorIssues(parsed.issues, spokenMessage) ?? [] } : {}),
      };
    } catch {
      return null;
    }
  }

  private parseSuppliedFeedback(value: unknown, targetMessageId: string): TutorFeedback | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const candidate = value as Partial<TutorFeedback>;
    if (
      candidate.targetMessageId !== targetMessageId ||
      typeof candidate.hasCorrection !== 'boolean' ||
      !(typeof candidate.suggestion === 'string' || candidate.suggestion === null) ||
      typeof candidate.explanation !== 'string' ||
      hasEnglishTutorNarrative(candidate.explanation) ||
      (candidate.hasCorrection && !candidate.suggestion?.trim())
    ) {
      return undefined;
    }
    return {
      targetMessageId,
      hasCorrection: candidate.hasCorrection,
      suggestion: candidate.hasCorrection ? candidate.suggestion!.trim() : null,
      explanation: candidate.explanation.trim(),
      ...(Array.isArray(candidate.issues) ? { issues: parseTutorIssues(candidate.issues) ?? [] } : {}),
    };
  }

  private formatPracticeContext(
    conversation: Array<{ id: string; role: 'user' | 'assistant'; content: string }>,
    latestPracticeMessage: string | null,
    latestConversyReply: { id: string; content: string } | null,
    feedback: TutorFeedback | null,
    previousCorrection: { original: string; feedback: TutorFeedback } | null,
  ) {
    const transcript = conversation.slice(-12).map(({ id, role, content }) => ({
      messageId: id,
      speaker: role === 'user' ? 'ALUMNO' : 'CONVERSY',
      content,
    }));
    const review = feedback
      ? {
        hasCorrection: feedback.hasCorrection,
        suggestion: feedback.suggestion,
        explanation: feedback.explanation,
      }
      : null;
    const priorCorrection = previousCorrection
      ? {
        original: previousCorrection.original,
        hasCorrection: previousCorrection.feedback.hasCorrection,
        suggestion: previousCorrection.feedback.suggestion,
        explanation: previousCorrection.feedback.explanation,
        issues: previousCorrection.feedback.issues ?? [],
      }
      : null;

    return `CONTEXTO SEPARADO DEL DIÁLOGO DEL TUTOR. Usa estos datos únicamente para responder la pregunta actual del alumno. No mezcles ni atribuyas mensajes de una conversación a la otra.
CHAT DE PRÁCTICA (JSON; ALUMNO escribe, CONVERSY responde): ${JSON.stringify(transcript)}
ÚLTIMA RESPUESTA DE CONVERSY (objeto JSON con ID y texto literal, o null): ${JSON.stringify(latestConversyReply)}
ÚLTIMO MENSAJE DE PRÁCTICA DEL ALUMNO (texto literal o null): ${JSON.stringify(latestPracticeMessage)}
EVALUACIÓN DEL ÚLTIMO MENSAJE QUE PASÓ LOS CONTROLES DE CONSISTENCIA (JSON o null): ${JSON.stringify(review)}
ÚLTIMA CORRECCIÓN AUTOMÁTICA VINCULADA A SU FRASE (JSON o null): ${JSON.stringify(priorCorrection)}
Si el alumno pregunta qué responderle a Conversy, redacta una respuesta dirigida a la ÚLTIMA RESPUESTA DE CONVERSY. No contestes esas preguntas como si fueras Conversy.`;
  }

  private formatReviewAnswer(
    original: string,
    feedback: TutorFeedback,
  ) {
    if (!feedback.hasCorrection || !feedback.suggestion) {
      return 'Sí. Tu último mensaje está bien escrito y suena natural.';
    }

    const explanation = feedback.explanation ? ` ${feedback.explanation}` : '';
    return `Tu último mensaje tenía algunos errores. Escribiste “${original}”. Un ejemplo correcto en inglés sería: “${feedback.suggestion}”.${explanation}`;
  }
}
