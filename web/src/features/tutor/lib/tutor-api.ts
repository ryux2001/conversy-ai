import { postJson } from "@/shared/lib/api-client";
import type { ConversationMessage, TutorFeedback } from "@/features/chat/types";
import type { TutorMessage } from "../types";

export async function requestFeedback(
  messages: ConversationMessage[],
  signal: AbortSignal,
): Promise<TutorFeedback> {
  const result = await postJson<{ feedback: TutorFeedback }>(
    "/tutor/evaluate",
    {
      messages: messages.filter((message) => message.content.trim()).map(({ id, role, content }) => ({ id, role, content })),
      ...(messages.at(-1)?.modality === "audio" ? { latestMessageModality: "audio" } : {}),
    },
    signal,
  );
  return result.feedback;
}

export async function requestTutorReply(
  conversation: ConversationMessage[],
  tutorMessages: TutorMessage[],
  signal: AbortSignal,
  latestFeedback?: TutorFeedback,
): Promise<{ message: TutorMessage; feedback?: TutorFeedback }> {
  const result = await postJson<{ message: TutorMessage; feedback?: TutorFeedback }>(
    "/tutor/reply",
    {
      conversation: conversation.filter((message) => message.content.trim()).map(({ id, role, content }) => ({ id, role, content })),
      tutorMessages,
      latestFeedback,
    },
    signal,
  );
  return result;
}
