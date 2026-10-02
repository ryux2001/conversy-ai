import type { TutorFeedback } from './tutor.service.js';

function normalizedToken(token: string) {
  return token.normalize('NFC').replace(/[’‘]/gu, "'");
}

function correctionTokens(text: string) {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu)?.map(normalizedToken) ?? [];
}

function sameTokens(left: string[], right: string[]) {
  return left.length === right.length && left.every((token, index) => token === right[index]);
}

function tokenizeEdits(source: string[], suggestion: string[]) {
  if (source.length > 1500 || suggestion.length > 1500) return null;
  const width = suggestion.length + 1;
  const table = new Uint16Array((source.length + 1) * width);
  for (let i = source.length - 1; i >= 0; i -= 1) {
    for (let j = suggestion.length - 1; j >= 0; j -= 1) {
      const index = i * width + j;
      table[index] = source[i] === suggestion[j]
        ? table[(i + 1) * width + j + 1]! + 1
        : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }

  const changes: Array<{ original: string[]; replacement: string[] }> = [];
  let original: string[] = [];
  let replacement: string[] = [];
  const flush = () => {
    if (original.length || replacement.length) changes.push({ original, replacement });
    original = [];
    replacement = [];
  };

  let i = 0;
  let j = 0;
  while (i < source.length || j < suggestion.length) {
    if (i < source.length && j < suggestion.length && source[i] === suggestion[j]) {
      flush();
      i += 1;
      j += 1;
    } else if (i < source.length && (
      j >= suggestion.length ||
      table[(i + 1) * width + j]! >= table[i * width + j + 1]!
    )) {
      original.push(source[i++]!);
    } else {
      replacement.push(suggestion[j++]!);
    }
  }
  flush();
  return changes;
}

function issueTypeMatches(
  original: string[],
  replacement: string[],
  type: NonNullable<TutorFeedback['issues']>[number]['type'],
) {
  const letters = (tokens: string[]) => tokens.join('').replace(/[^\p{L}\p{N}]/gu, '').toLocaleLowerCase();
  const punctuation = (tokens: string[]) => tokens.join('').match(/[.,!?;:'’…]/gu)?.join('') ?? '';
  const originalLetters = letters(original);
  const replacementLetters = letters(replacement);
  const originalText = original.join('');
  const replacementText = replacement.join('');

  if (type === 'punctuation') {
    return originalLetters === replacementLetters &&
      punctuation(original) !== punctuation(replacement);
  }
  if (type === 'capitalization') {
    return original.length === replacement.length &&
      originalLetters === replacementLetters &&
      originalText !== replacementText &&
      originalText.toLocaleLowerCase() === replacementText.toLocaleLowerCase();
  }
  if (type === 'spelling') {
    return originalLetters !== replacementLetters || punctuation(original) !== punctuation(replacement);
  }
  return originalLetters !== replacementLetters;
}

function claimsUnsupportedPunctuation(explanation: string) {
  const normalized = explanation.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return /\b(?:anadid|anadio|agregad|agrego|eliminad|elimino|quitad|quito|corregid|corrigio|faltaba|faltan)\w*\b.{0,60}\b(?:puntuacion|signo|interrogacion|exclamacion)\b/u.test(normalized) ||
    /\b(?:puntuacion|signo|interrogacion|exclamacion)\b.{0,60}\b(?:anadid|anadio|agregad|agrego|eliminad|elimino|quitad|quito|corregid|corrigio|faltaba|faltan)\w*\b/u.test(normalized);
}

export function hasTutorInstructionLeak(text: string) {
  const normalized = text.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return [
    /\b(?:la clave|the key)\s+(?:explanation|explicacion)\b.{0,100}\b(?:respuesta json|json response)\b/u,
    /\b(?:tu respuesta|the response)\b.{0,60}\b(?:incumplio las reglas|no cumplio la tarea|did not follow|rewrite from scratch)\b/u,
    /\b(?:devuelve|return|output)\b.{0,35}\b(?:un objeto json|json con las claves|json with the keys|hascorrection|issues array)\b/u,
    /\b(?:reescribe|rewrite)\b.{0,30}\b(?:desde cero|from scratch|la respuesta anterior|the previous response)\b/u,
    /\b(?:instruccion|instruction)\s+(?:del sistema|system)\b/u,
  ].some((pattern) => pattern.test(normalized));
}

export function feedbackMatchesSource(source: string, feedback: TutorFeedback, spokenMessage = false) {
  const issues = feedback.issues ?? [];
  if (!feedback.hasCorrection) {
    return feedback.suggestion === null && issues.length === 0 && !claimsUnsupportedPunctuation(feedback.explanation);
  }
  if (!feedback.suggestion?.trim() || feedback.suggestion.trim() === source.trim() || issues.length === 0) return false;

  const sourceTokens = correctionTokens(source);
  const suggestionTokens = correctionTokens(feedback.suggestion);
  const changes = tokenizeEdits(sourceTokens, suggestionTokens);
  if (!changes || changes.length !== issues.length || (spokenMessage && issues.length !== 1)) return false;

  return changes.every((change) => {
    const issue = issues.find((candidate) =>
      sameTokens(correctionTokens(candidate.original), change.original) &&
      sameTokens(correctionTokens(candidate.replacement), change.replacement),
    );
    if (!issue || (spokenMessage && issue.type !== 'grammar' && issue.type !== 'naturalness')) return false;
    if (!change.original.length && issue.type !== 'punctuation') return false;
    const changedWords = change.original.filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
    const replacementWords = change.replacement.filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
    if (spokenMessage && (changedWords > 3 || replacementWords > 3)) return false;
    return issueTypeMatches(change.original, change.replacement, issue.type);
  });
}
