import { resolveTutorTask } from './tutor-task.js';
import type { ConversationMessage, TutorMessage, TutorTaskReference } from '../../common/conversation.js';

const conversation: ConversationMessage[] = [
  { id: 'u1', role: 'user', content: 'Eden hazard maybe?' },
  { id: 'a1', role: 'assistant', content: 'Eden Hazard is indeed a great choice; what do you think defines his best moments?' },
  { id: 'u2', role: 'user', content: 'Could be the form of dribbling, thats was beautiful' },
  { id: 'a2', role: 'assistant', content: 'His dribbling was indeed spectacular—what part of it stood out most?' },
];

function tutorHistory(question: string, task?: TutorTaskReference): TutorMessage[] {
  return [
    {
      id: 't1',
      role: 'tutor',
      content: 'Tu última frase expresa que su regate fue bonito.',
      ...(task ? { task } : {}),
    },
    { id: 'q1', role: 'user', content: question },
  ];
}

describe('resolveTutorTask', () => {
  it('targets Conversy when the learner asks what the last reply meant', () => {
    const resolution = resolveTutorTask(
      'Qué me quiso decir en el último mensaje? No entendí exactamente lo que me quiso decir',
      conversation,
      [{ id: 'q1', role: 'user', content: 'Qué me quiso decir en el último mensaje?' }],
    );

    expect(resolution.reference).toMatchObject({
      intent: 'explain_message',
      source: 'practice_assistant',
      targetMessageId: 'a2',
    });
    expect(resolution.target?.content).toBe(conversation[3]?.content);
    expect(resolution.clarification).toBeNull();
  });

  it('uses an explicit AI reference to resolve a follow-up', () => {
    const resolution = resolveTutorTask(
      'Me refiero a la IA, qué me quiso decir en el último mensaje?',
      conversation,
      tutorHistory('Para ayudarte mejor, ¿podrías decirme qué querías expresar?', {
        intent: 'explain_message',
        source: 'tutor',
        targetMessageId: 't1',
        reason: 'inferred',
      }),
    );

    expect(resolution.reference.source).toBe('practice_assistant');
    expect(resolution.reference.reason).toBe('explicit');
    expect(resolution.target?.id).toBe('a2');
  });

  it('keeps a short follow-up attached to the exact prior target', () => {
    const resolution = resolveTutorTask(
      'Pero eso, ¿qué quiso decir?',
      [...conversation, { id: 'a3', role: 'assistant', content: 'A newer reply arrived.' }],
      tutorHistory('¿Qué me quiso decir?', {
        intent: 'explain_message',
        source: 'practice_assistant',
        targetMessageId: 'a2',
        reason: 'inferred',
      }),
    );

    expect(resolution.reference.reason).toBe('follow_up');
    expect(resolution.target?.id).toBe('a2');
  });

  it('understands a follow-up asking what Conversy is asking about', () => {
    const resolution = resolveTutorTask(
      '¿Y qué me está preguntando exactamente?',
      conversation,
      tutorHistory('¿Qué quiso decir Conversy con su último mensaje?', {
        intent: 'explain_message',
        source: 'practice_assistant',
        targetMessageId: 'a2',
        reason: 'explicit',
      }),
    );

    expect(resolution.reference).toMatchObject({
      intent: 'explain_message',
      source: 'practice_assistant',
      targetMessageId: 'a2',
      reason: 'follow_up',
    });
    expect(resolution.target?.content).toBe(conversation[3]?.content);
  });

  it('resolves explicit questions about the learner or tutor message separately', () => {
    const learner = resolveTutorTask('Qué quise decir yo en mi última frase?', conversation, []);
    const tutor = resolveTutorTask('Qué quisiste decir tú con tu último mensaje?', conversation, [
      { id: 't1', role: 'tutor', content: 'Usa do antes del sujeto.' },
      { id: 'q1', role: 'user', content: 'Qué quisiste decir tú con tu último mensaje?' },
    ]);

    expect(learner.reference).toMatchObject({ intent: 'explain_message', source: 'practice_user', targetMessageId: 'u2' });
    expect(tutor.reference).toMatchObject({ intent: 'explain_message', source: 'tutor', targetMessageId: 't1' });
  });

  it('asks a short clarification if there is no safe target', () => {
    const resolution = resolveTutorTask('¿Qué significa?', [], [
      { id: 'q1', role: 'user', content: '¿Qué significa?' },
    ]);

    expect(resolution.reference.intent).toBe('clarify');
    expect(resolution.clarification).toContain('respuesta de Conversy');
  });
});
