import { postJson } from "@/shared/lib/api-client";
import type { ConversationMessage, TutorFeedback } from "@/features/chat/types";
import type { TutorMessage } from "../types";

export async function requestFeedback(
  messages: ConversationMessage[],
  signal: AbortSignal,
): Promise<TutorFeedback> {
  const result = await postJson<{ feedback: TutorFeedback }>(
    "/tutor/evaluate",
    { messages },
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
    { conversation, tutorMessages, latestFeedback },
    signal,
  );
  return result;
}
