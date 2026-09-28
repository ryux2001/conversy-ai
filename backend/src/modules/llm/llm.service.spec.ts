import {
  BadGatewayException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LlmService } from './llm.service.js';

describe('LlmService provider failures', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('AI_LOCAL_ONLY', 'true');
    vi.stubEnv('LOCAL_AI_URL', 'http://127.0.0.1:8080/v1');
    vi.stubEnv('LOCAL_AI_MODEL', 'test-model');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('reports a provider connection failure with a retryable code', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const error = await new LlmService().complete([], {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'LLM_UNAVAILABLE' });
  });

  it('converts a provider timeout to a gateway timeout', async () => {
    vi.stubEnv('LLM_TIMEOUT_MS', '5');
    fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }));

    const error = await new LlmService().complete([], {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GatewayTimeoutException);
    expect((error as GatewayTimeoutException).getResponse()).toMatchObject({ code: 'LLM_TIMEOUT' });
  });

  it('rejects a successful but empty model response', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: '' } }],
    }), { status: 200 }));

    const error = await new LlmService().complete([], {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'LLM_EMPTY_RESPONSE' });
  });

  it('rejects output exhausted before a visible answer', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: 'length', message: { content: '' } }],
    }), { status: 200 }));

    const error = await new LlmService().complete([], {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as BadGatewayException).getResponse()).toMatchObject({ code: 'LLM_OUTPUT_TRUNCATED' });
  });
});
