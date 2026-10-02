import type { TutorFeedback } from './tutor.service.js';
import { feedbackMatchesSource, hasTutorInstructionLeak } from './tutor-validation.js';

function correction(
  suggestion: string,
  original: string,
  replacement: string,
  type: NonNullable<TutorFeedback['issues']>[number]['type'],
): TutorFeedback {
  return {
    targetMessageId: 'u1',
    hasCorrection: true,
    suggestion,
    explanation: 'Se hizo un cambio pequeño en la frase.',
    issues: [{ original, replacement, type }],
  };
}

describe('tutor output validation', () => {
  it('rejects explanations that expose an internal JSON instruction', () => {
    expect(hasTutorInstructionLeak(
      'La clave explanation de tu respuesta JSON debe estar íntegramente en español.',
    )).toBe(true);
    expect(hasTutorInstructionLeak(
      'JSON significa JavaScript Object Notation; sirve para intercambiar datos.',
    )).toBe(false);
  });

  it('rejects additions copied from an earlier conversation turn', () => {
    expect(feedbackMatchesSource('Could be the form of dribbling, thats was beautiful', correction(
      'Eden Hazard maybe? Could be the form of dribbling, that was beautiful.',
      'thats',
      'that',
      'grammar',
    ))).toBe(false);
  });

  it('accepts a minimal correction to the target sentence', () => {
    expect(feedbackMatchesSource('Could be the form of dribbling, thats was beautiful', correction(
      'Could be the form of dribbling, that was beautiful',
      'thats',
      'that',
      'grammar',
    ))).toBe(true);
  });

  it('matches issue types to spelling, capitalization and punctuation changes', () => {
    expect(feedbackMatchesSource('My favorite p!ayer is Lionel Messi?', correction(
      'My favorite player is Lionel Messi?',
      'p!ayer',
      'player',
      'spelling',
    ))).toBe(true);
    expect(feedbackMatchesSource('My favorite player is lionel Messi?', correction(
      'My favorite player is Lionel Messi?',
      'lionel',
      'Lionel',
      'capitalization',
    ))).toBe(true);
    expect(feedbackMatchesSource('Hello', correction(
      'Hello?',
      '',
      '?',
      'punctuation',
    ))).toBe(true);
  });

  it('rejects punctuation explanations that change an unlisted mark', () => {
    expect(feedbackMatchesSource('Hello', {
      targetMessageId: 'u1',
      hasCorrection: false,
      suggestion: null,
      explanation: 'Se añadió el signo de interrogación.',
      issues: [],
    })).toBe(false);
  });
});
