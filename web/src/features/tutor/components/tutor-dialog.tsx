"use client";

import { useEffect, useRef, useState, type Dispatch, type FormEvent, type KeyboardEvent, type SetStateAction } from "react";
import type { ReactNode } from "react";
import type { ConversationMessage, FeedbackState, TutorFeedback } from "@/features/chat/types";
import type { Locale } from "@/shared/lib/copy";
import { copy } from "@/shared/lib/copy";
import { Icon } from "@/shared/components/icon";
import { ApiRequestError } from "@/shared/lib/api-client";
import { requestTutorReply } from "../lib/tutor-api";
import type { TutorMessage } from "../types";

function inlineText(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function tutorText(content: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let listTag: "ul" | "ol" | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(<p key={`p-${blocks.length}`}>{inlineText(paragraph.join(" "))}</p>);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (!list.length || !listTag) return;
    const List = listTag;
    blocks.push(
      <List key={`list-${blocks.length}`}>
        {list.map((item, index) => <li key={index}>{inlineText(item)}</li>)}
      </List>,
    );
    list = [];
    listTag = null;
  };

  for (const line of content.replace(/\r/g, "").split("\n")) {
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const nextListTag = bullet ? "ul" : numbered ? "ol" : null;

    if (nextListTag) {
      flushParagraph();
      if (listTag && listTag !== nextListTag) flushList();
      listTag = nextListTag;
      list.push((bullet ?? numbered)![1]);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }

  flushParagraph();
  flushList();
  return blocks;
}

function tutorErrorMessage(code: string | null, locale: Locale) {
  const text = copy[locale];
  switch (code) {
    case "NETWORK_ERROR":
      return text.tutorErrorNetwork;
    case "LLM_UNAVAILABLE":
      return text.tutorErrorModel;
    case "LLM_PROVIDER_ERROR":
      return text.tutorErrorProvider;
    case "LLM_TIMEOUT":
      return text.tutorErrorTimeout;
    case "LLM_OUTPUT_TRUNCATED":
    case "LLM_EMPTY_RESPONSE":
      return text.tutorErrorIncomplete;
    case "LLM_TUTOR_CONTRACT_INVALID":
      return text.tutorErrorLanguage;
    default:
      return text.tutorError;
  }
}

export function TutorDialog({
  open,
  onClose,
  locale,
  conversation,
  isConversationReplyPending,
  feedbacks,
  messages,
  onMessagesChange,
  onFeedback,
}: {
  open: boolean;
  onClose: () => void;
  locale: Locale;
  conversation: ConversationMessage[];
  isConversationReplyPending: boolean;
  feedbacks: Record<string, FeedbackState>;
  messages: TutorMessage[];
  onMessagesChange: Dispatch<SetStateAction<TutorMessage[]>>;
  onFeedback: (feedback: TutorFeedback) => void;
}) {
  const text = copy[locale];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastRequest = useRef<{
    conversation: ConversationMessage[];
    messages: TutorMessage[];
    feedback?: TutorFeedback;
  } | null>(null);
  const [question, setQuestion] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [tutorErrorCode, setTutorErrorCode] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isPending]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function requestReply(
    chatContext: ConversationMessage[],
    tutorContext: TutorMessage[],
    latestFeedback?: TutorFeedback,
  ) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsPending(true);
    setTutorErrorCode(null);

    try {
      const reply = await requestTutorReply(
        chatContext,
        tutorContext,
        controller.signal,
        latestFeedback,
      );
      if (!controller.signal.aborted) {
        if (reply.feedback) onFeedback(reply.feedback);
        onMessagesChange((current) => current.some((message) => message.id === reply.message.id)
          ? current
          : [...current, reply.message]);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setTutorErrorCode(error instanceof ApiRequestError ? error.code : "UNKNOWN");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted) setIsPending(false);
    }
  }

  function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = question.trim();
    if (!content || isPending || isConversationReplyPending) return;
    const userMessage: TutorMessage = { id: crypto.randomUUID(), role: "user", content };
    const tutorContext = [...messages, userMessage];
    const chatContext = conversation.slice(-24);
    const latestPracticeMessage = [...chatContext].reverse().find((message) => message.role === "user");
    const latestFeedbackState = latestPracticeMessage
      ? feedbacks[latestPracticeMessage.id]
      : undefined;
    const latestFeedback = latestFeedbackState?.status === "ready"
      ? latestFeedbackState.feedback
      : undefined;
    lastRequest.current = { conversation: chatContext, messages: tutorContext, feedback: latestFeedback };
    onMessagesChange((current) => [...current, userMessage]);
    setQuestion("");
    void requestReply(chatContext, tutorContext, latestFeedback);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const recentFeedback = Object.values(feedbacks)
    .filter((entry): entry is Extract<FeedbackState, { status: "ready" }> => entry.status === "ready")
    .slice(-4)
    .reverse();

  return (
    <dialog
      ref={dialogRef}
      className="tutor-dialog"
      aria-labelledby="tutor-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className="tutor-panel">
        <header className="tutor-header">
          <div className="tutor-header__identity">
            <div className="tutor-header__mark"><Icon name="sparkle" size={18} /></div>
            <div>
              <h2 id="tutor-title">{text.tutorTitle}</h2>
              <p>{text.tutorDescription}</p>
            </div>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={text.close}>
            <Icon name="close" size={19} />
          </button>
        </header>

        <div className="tutor-content">
          <details className="recent-feedback">
            <summary>{text.recentFeedback}<span>{recentFeedback.length}</span></summary>
            <div className="recent-feedback__list">
              {recentFeedback.length ? recentFeedback.map(({ feedback }) => (
                <div className="recent-feedback-item" key={feedback.targetMessageId}>
                  {feedback.hasCorrection && feedback.suggestion ? <p><strong>{feedback.suggestion}</strong></p> : null}
                  <span>{feedback.explanation || text.noCorrection}</span>
                </div>
              )) : <p className="recent-feedback-empty">{text.noFeedbackYet}</p>}
            </div>
          </details>

          {isConversationReplyPending ? (
            <p className="tutor-waiting" role="status">{text.tutorWaitingForConversation}</p>
          ) : <p className="tutor-guidance">{text.askTutor}</p>}
          <div className="tutor-message-list" role="log" aria-label={text.tutorMessagesRegion} aria-live="polite" aria-relevant="additions text">
            {messages.map((message) => (
              <article className={`tutor-message tutor-message--${message.role}`} key={message.id}>
                {message.role === "tutor" ? <span className="tutor-message__avatar" aria-hidden="true"><Icon name="sparkle" size={14} /></span> : null}
                <div className="tutor-message__content">{tutorText(message.content)}</div>
              </article>
            ))}
            {isPending ? (
              <div className="tutor-message tutor-message--tutor" role="status">
                <span className="tutor-message__avatar" aria-hidden="true"><Icon name="sparkle" size={14} /></span>
                <p className="tutor-typing"><span /><span /><span /><span className="visually-hidden">{text.tutorThinking}</span></p>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          {tutorErrorCode ? (
            <div className="tutor-error" role="alert">
              <p>{tutorErrorMessage(tutorErrorCode, locale)}</p>
              <small>{text.tutorErrorCode}: {tutorErrorCode}</small>
              <button type="button" className="text-action" onClick={() => {
                if (lastRequest.current) {
                  void requestReply(
                    lastRequest.current.conversation,
                    lastRequest.current.messages,
                    lastRequest.current.feedback,
                  );
                }
              }}><Icon name="retry" size={14} /> {text.retry}</button>
            </div>
          ) : null}
        </div>

        <form className="tutor-composer" onSubmit={sendQuestion}>
          <label className="visually-hidden" htmlFor="tutor-question">{text.tutorPlaceholder}</label>
          <textarea
            id="tutor-question"
            rows={1}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={text.tutorPlaceholder}
            maxLength={4_000}
            disabled={isPending || isConversationReplyPending}
          />
          <button className="send-button send-button--tutor" type="submit" aria-label={text.sendQuestion} disabled={isPending || isConversationReplyPending || !question.trim()}>
            <Icon name="send" size={17} />
          </button>
        </form>
      </div>
    </dialog>
  );
}
