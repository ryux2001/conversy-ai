import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { LlmCompletion, LlmMessage, LlmOptions } from './llm.types.js';

interface ChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | Array<{ type?: string; text?: string }> | null;
    };
  }>;
  model?: string;
  error?: { message?: string };
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly reportedModels = new Set<string>();

  async complete(messages: LlmMessage[], options: LlmOptions = {}): Promise<string> {
    const completion = await this.completeWithMetadata(messages, options);
    if (completion.finishReason === 'length') {
      throw new BadGatewayException({
        code: 'LLM_OUTPUT_TRUNCATED',
        message: 'El modelo agotó el límite de salida antes de terminar la respuesta.',
      });
    }
    if (!completion.content) {
      throw new ServiceUnavailableException({
        code: 'LLM_EMPTY_RESPONSE',
        message: 'El modelo no devolvió una respuesta utilizable.',
      });
    }
    return completion.content;
  }

  async completeWithMetadata(
    messages: LlmMessage[],
    options: LlmOptions = {},
  ): Promise<LlmCompletion> {
    const localOnlyValue = (process.env.AI_LOCAL_ONLY ?? 'true').trim().toLowerCase();
    if (localOnlyValue !== 'true' && localOnlyValue !== 'false') {
      throw new ServiceUnavailableException('AI_LOCAL_ONLY debe ser true o false.');
    }

    const localOnly = localOnlyValue === 'true';
    const baseUrl = localOnly
      ? process.env.LOCAL_AI_URL || 'http://127.0.0.1:8080/v1'
      : 'https://openrouter.ai/api/v1';
    const model = localOnly
      ? process.env.LOCAL_AI_MODEL || 'LFM2.5'
      : process.env.OPENROUTER_MODEL;
    const apiKey = localOnly ? undefined : process.env.OPENROUTER_API_KEY;

    if (!localOnly && !apiKey) {
      throw new ServiceUnavailableException(
        'Configura OPENROUTER_API_KEY en backend/.env.local para usar OpenRouter.',
      );
    }
    if (!model) {
      throw new ServiceUnavailableException(
        localOnly
          ? 'Configura LOCAL_AI_MODEL para el modelo local.'
          : 'Configura OPENROUTER_MODEL para el modelo de OpenRouter.',
      );
    }

    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 90_000);
    let endpoint: URL;
    try {
      endpoint = new URL('chat/completions', `${baseUrl.replace(/\/+$/, '')}/`);
    } catch {
      throw new ServiceUnavailableException(
        localOnly ? 'LOCAL_AI_URL no es una URL válida.' : 'La URL de OpenRouter no es válida.',
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.4,
          max_tokens: options.maxTokens ?? 384,
          stream: false,
          ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
          ...(localOnly ? { chat_template_kwargs: { enable_thinking: false } } : {}),
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as ChatCompletionResponse | null;
      if (!response.ok) {
        const detail = payload?.error?.message;
        throw new ServiceUnavailableException(
          {
            code: 'LLM_PROVIDER_ERROR',
            message: detail
              ? `El proveedor de IA rechazó la solicitud: ${detail}`
              : `El proveedor de IA respondió con HTTP ${response.status}.`,
          },
        );
      }

      const choice = payload?.choices?.[0];
      if (localOnly && payload?.model && !this.reportedModels.has(payload.model)) {
        this.reportedModels.add(payload.model);
        this.logger.log(`llama.cpp advertises API model ID "${payload.model}".`);
      }
      const content = choice?.message?.content;
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content.map((part) => (part.type === 'text' ? part.text ?? '' : '')).join('')
            : '';

      return {
        content: text.trim(),
        finishReason: choice?.finish_reason ?? null,
        model: payload?.model ?? null,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      if (controller.signal.aborted) {
        throw new GatewayTimeoutException({
          code: 'LLM_TIMEOUT',
          message: 'El modelo tardó demasiado en responder.',
        });
      }
      throw new ServiceUnavailableException(
        {
          code: 'LLM_UNAVAILABLE',
          message: `No se pudo conectar con el proveedor de IA en ${endpoint.origin}.`,
        },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
