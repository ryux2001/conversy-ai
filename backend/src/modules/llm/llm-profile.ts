export type LlmProfile = 'lfm25-thinking' | 'standard';

export function getConfiguredLlmProfile(): LlmProfile {
  const localOnly = (process.env.AI_LOCAL_ONLY ?? 'true').trim().toLowerCase() === 'true';
  const model = process.env.LOCAL_AI_MODEL || 'LFM2.5';
  return localOnly && /lfm2\.?5(?:-8b-a1b)?/iu.test(model)
    ? 'lfm25-thinking'
    : 'standard';
}
