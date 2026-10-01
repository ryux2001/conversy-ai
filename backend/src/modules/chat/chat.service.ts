import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { parseConversation, parseObject } from '../../common/conversation.js';
import { LlmService } from '../llm/llm.service.js';
import type { LlmCompletion } from '../llm/llm.types.js';
import { CONVERSATION_PROMPT } from './prompts/conversation.prompt.js';

const CHAT_TOKEN_LIMITS = [1024, 2048] as const;

function avoidEchoingAnUnclearVoiceWord(reply: string, transcript: string) {
  if (!/\b(?:not sure|unclear|could you clarify|could you explain|what do you mean)\b/iu.test(reply)) return reply;
  const uncertainLongWords = transcript.match(/\b[\p{L}]{13,}\b/gu) ?? [];
  return uncertainLongWords.reduce((content, word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return content.replace(new RegExp(`\\b${escaped}\\b`, 'giu'), 'that word');
  }, reply);
}

@Injectable()
export class ChatService {
  constructor(private readonly llm: LlmService) {}

  async reply(body: unknown) {
    const request = parseObject(body, 'body');
    const messages = parseConversation(request.messages);
    const modality = request.latestMessageModality;
    if (modality !== undefined && modality !== 'audio' && modality !== 'text') {
      throw new BadRequestException({ code: 'INVALID_MESSAGE_MODALITY', message: 'El origen del mensaje no es válido.' });
    }
    const prompt = [
      {
        role: 'system' as const,
        content: modality === 'audio'
          ? `${CONVERSATION_PROMPT}\nThe learner's latest message is an English speech transcription. Respond to the part you understand. If an unfamiliar word changes the meaning, ask one brief, natural clarification in English without guessing or repeating a spelling of that word.`
          : CONVERSATION_PROMPT,
      },
      ...messages.slice(-16).map(({ role, content }) => ({ role, content })),
    ];
    let completion: LlmCompletion | undefined;
    for (const maxTokens of CHAT_TOKEN_LIMITS) {
      completion = await this.llm.completeWithMetadata(prompt, { maxTokens, purpose: 'conversation' });
      if (completion.finishReason !== 'length' && completion.content) break;
    }

    if (!completion?.content) {
      const truncated = completion?.finishReason === 'length';
      throw new BadGatewayException({
        code: truncated ? 'LLM_OUTPUT_TRUNCATED' : 'LLM_EMPTY_RESPONSE',
        message: truncated
          ? 'El modelo agotó el límite de salida antes de terminar la respuesta.'
          : 'El modelo no devolvió una respuesta utilizable.',
      });
    }
    const latestUserMessage = messages.slice().reverse().find((message) => message.role === 'user');
    const content = modality === 'audio' && latestUserMessage
      ? avoidEchoingAnUnclearVoiceWord(completion.content, latestUserMessage.content)
      : completion.content;

    return {
      message: { id: randomUUID(), role: 'assistant' as const, content },
    };
  }
}
