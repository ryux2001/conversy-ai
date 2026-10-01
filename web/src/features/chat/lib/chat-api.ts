import { postJson } from "@/shared/lib/api-client";
import type { ConversationMessage } from "../types";

export async function requestChatReply(
  messages: ConversationMessage[],
  signal: AbortSignal,
): Promise<ConversationMessage> {
  const result = await postJson<{ message: ConversationMessage }>(
    "/chat/reply",
    {
      messages: messages.filter((message) => message.content.trim()).map(({ id, role, content }) => ({ id, role, content })),
      ...(messages.at(-1)?.modality === "audio" ? { latestMessageModality: "audio" } : {}),
    },
    signal,
  );
  return result.message;
}
