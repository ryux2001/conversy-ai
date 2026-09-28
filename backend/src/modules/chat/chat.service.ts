import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { parseConversation, parseObject } from '../../common/conversation.js';
import { LlmService } from '../llm/llm.service.js';
import { CONVERSATION_PROMPT } from './prompts/conversation.prompt.js';

@Injectable()
export class ChatService {
  constructor(private readonly llm: LlmService) {}

  async reply(body: unknown) {
    const request = parseObject(body, 'body');
    const messages = parseConversation(request.messages);
    const content = await this.llm.complete(
      [
        { role: 'system', content: CONVERSATION_PROMPT },
        ...messages.slice(-16).map(({ role, content }) => ({ role, content })),
      ],
      { maxTokens: 1024, temperature: 0.65 },
    );

    return {
      message: { id: randomUUID(), role: 'assistant' as const, content },
    };
  }
}
