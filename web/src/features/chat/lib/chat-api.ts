import { postJson } from "@/shared/lib/api-client";
import type { ConversationMessage } from "../types";

export async function requestChatReply(
  messages: ConversationMessage[],
  signal: AbortSignal,
): Promise<ConversationMessage> {
  const result = await postJson<{ message: ConversationMessage }>(
    "/chat/reply",
    { messages },
    signal,
  );
  return result.message;
}
