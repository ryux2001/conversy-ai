import { useEffect, useRef } from "react";
import type { ConversationMessage, FeedbackState } from "../types";
import type { Locale } from "@/shared/lib/copy";
import { copy } from "@/shared/lib/copy";
import { Icon } from "@/shared/components/icon";
import { FeedbackCard } from "./feedback-card";

export function MessageList({
  messages,
  feedbacks,
  locale,
  isReplyPending,
  onRetryFeedback,
}: {
  messages: ConversationMessage[];
  feedbacks: Record<string, FeedbackState>;
  locale: Locale;
  isReplyPending: boolean;
  onRetryFeedback: (messageId: string) => void;
}) {
  const text = copy[locale];
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isReplyPending, feedbacks]);

  return (
    <div className="message-list" role="log" aria-label={text.messagesRegion} aria-live="polite" aria-relevant="additions text">
      {messages.map((message) => (
        <article className={`message-row message-row--${message.role}`} key={message.id}>
          {message.role === "assistant" ? (
            <div className="message-avatar message-avatar--assistant" aria-hidden="true">c</div>
          ) : null}
          <div className="message-column">
            <div className="message-meta">
              <span>{message.role === "assistant" ? text.assistant : text.you}</span>
            </div>
            <div className={`message-bubble message-bubble--${message.role}`}>
              <p>{message.content}</p>
            </div>
            {message.role === "user" ? (
              <FeedbackCard
                state={feedbacks[message.id]}
                locale={locale}
                onRetry={() => onRetryFeedback(message.id)}
              />
            ) : null}
          </div>
          {message.role === "user" ? (
            <div className="message-avatar message-avatar--user" aria-hidden="true"><Icon name="person" size={16} /></div>
          ) : null}
        </article>
      ))}
      {isReplyPending ? (
        <div className="message-row message-row--assistant" role="status" aria-label={text.thinking}>
          <div className="message-avatar message-avatar--assistant" aria-hidden="true">c</div>
          <div className="message-column">
            <div className="message-meta"><span>{text.assistant}</span></div>
            <div className="message-bubble message-bubble--assistant typing-bubble">
              <span /><span /><span /><span className="visually-hidden">{text.thinking}</span>
            </div>
          </div>
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
