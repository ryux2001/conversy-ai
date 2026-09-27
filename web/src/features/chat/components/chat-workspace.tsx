"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "@/features/navigation/components/sidebar";
import { requestChatReply } from "@/features/chat/lib/chat-api";
import type { ConversationMessage, FeedbackState } from "@/features/chat/types";
import { MessageComposer } from "@/features/chat/components/message-composer";
import { MessageList } from "@/features/chat/components/message-list";
import { requestFeedback } from "@/features/tutor/lib/tutor-api";
import { TutorDialog } from "@/features/tutor/components/tutor-dialog";
import type { TutorMessage } from "@/features/tutor/types";
import { ApiRequestError } from "@/shared/lib/api-client";
import { Icon } from "@/shared/components/icon";
import { copy, type Locale } from "@/shared/lib/copy";

const starterPrompts = [
  { label: "promptDay", value: "promptDayText" },
  { label: "promptFilm", value: "promptFilmText" },
  { label: "promptCoffee", value: "promptCoffeeText" },
] as const;

export function ChatWorkspace() {
  const [locale, setLocale] = useState<Locale>("es");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [feedbacks, setFeedbacks] = useState<Record<string, FeedbackState>>({});
  const [tutorMessages, setTutorMessages] = useState<TutorMessage[]>([]);
  const [tutorNotification, setTutorNotification] = useState<TutorMessage | null>(null);
  const [hasUnreadTutorMessage, setHasUnreadTutorMessage] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [isReplyPending, setIsReplyPending] = useState(false);
  const [replyError, setReplyError] = useState(false);
  const [replyErrorDetail, setReplyErrorDetail] = useState("");
  const [isTutorOpen, setIsTutorOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const sessionVersion = useRef(0);
  const isTutorOpenRef = useRef(false);
  const proactiveMessageIds = useRef(new Set<string>());
  const chatAbort = useRef<AbortController | null>(null);
  const feedbackAborts = useRef(new Map<string, AbortController>());
  const failedContext = useRef<ConversationMessage[] | null>(null);
  const text = copy[locale];

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const explainError = useCallback((error: unknown) => {
    if (error instanceof Error && error.message !== "NETWORK_ERROR") return error.message;
    return locale === "es"
      ? "No se pudo conectar con el servidor local. Comprueba que el backend y llama.cpp estén activos."
      : "Couldn't reach the local server. Check that the backend and llama.cpp are running.";
  }, [locale]);

  const evaluate = useCallback(async (
    context: ConversationMessage[],
    messageId: string,
    version: number,
  ) => {
    feedbackAborts.current.get(messageId)?.abort();
    const controller = new AbortController();
    feedbackAborts.current.set(messageId, controller);
    setFeedbacks((current) => ({ ...current, [messageId]: { status: "loading" } }));

    try {
      const feedback = await requestFeedback(context, controller.signal);
      if (sessionVersion.current === version) {
        setFeedbacks((current) => ({ ...current, [messageId]: { status: "ready", feedback } }));
        if (feedback.hasCorrection && feedback.suggestion?.trim() && !proactiveMessageIds.current.has(messageId)) {
          proactiveMessageIds.current.add(messageId);
          const original = context.at(-1)?.content.trim() ?? "";
          const suggestion = feedback.suggestion.trim();
          const correctedQuote = `“${/[.!?]$/.test(suggestion) ? suggestion : `${suggestion}.`}”`;
          const explanation = feedback.explanation.trim();
          const canContrast = original.length <= 180 && suggestion.length <= 180;
          const tutorMessage: TutorMessage = {
            id: crypto.randomUUID(),
            role: "tutor",
            content: canContrast
              ? `${copy.es.tutorCorrectionPrefix} “${original}”, ${copy.es.tutorCorrectionJoin} ${correctedQuote}${explanation ? ` ${explanation}` : ""}`
              : `${copy.es.tutorCorrectionIntro} ${correctedQuote}${explanation ? ` ${explanation}` : ""}`,
          };
          setTutorMessages((current) => [...current, tutorMessage]);
          if (!isTutorOpenRef.current) {
            setTutorNotification(tutorMessage);
            setHasUnreadTutorMessage(true);
          }
        }
      }
    } catch (error) {
      if (!controller.signal.aborted && sessionVersion.current === version) {
        const code = error instanceof ApiRequestError ? error.code : "UNKNOWN";
        setFeedbacks((current) => current[messageId]?.status === "ready"
          ? current
          : { ...current, [messageId]: { status: "error", code } });
      }
    } finally {
      if (feedbackAborts.current.get(messageId) === controller) {
        feedbackAborts.current.delete(messageId);
      }
    }
  }, [locale]);

  const requestReply = useCallback(async (context: ConversationMessage[], version: number) => {
    chatAbort.current?.abort();
    const controller = new AbortController();
    chatAbort.current = controller;
    setReplyError(false);
    setReplyErrorDetail("");
    setIsReplyPending(true);

    try {
      const reply = await requestChatReply(context, controller.signal);
      if (sessionVersion.current === version) {
        setMessages([...context, reply]);
        failedContext.current = null;
      }
    } catch (error) {
      if (!controller.signal.aborted && sessionVersion.current === version) {
        failedContext.current = context;
        setReplyError(true);
        setReplyErrorDetail(explainError(error));
      }
    } finally {
      if (chatAbort.current === controller) chatAbort.current = null;
      if (sessionVersion.current === version) setIsReplyPending(false);
    }
  }, [explainError]);

  function sendMessage() {
    const content = composerValue.trim();
    if (!content || isReplyPending) return;

    const userMessage: ConversationMessage = { id: crypto.randomUUID(), role: "user", content };
    const context = [...messages, userMessage];
    const version = sessionVersion.current;
    setMessages(context);
    setComposerValue("");
    setAnnouncement("");
    setFeedbacks((current) => ({ ...current, [userMessage.id]: { status: "loading" } }));
    void evaluate(context, userMessage.id, version);
    void requestReply(context, version);
  }

  function retryFeedback(messageId: string) {
    const messageIndex = messages.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) return;
    void evaluate(messages.slice(0, messageIndex + 1), messageId, sessionVersion.current);
  }

  function openTutor() {
    isTutorOpenRef.current = true;
    setIsTutorOpen(true);
    setTutorNotification(null);
    setHasUnreadTutorMessage(false);
  }

  function closeTutor() {
    isTutorOpenRef.current = false;
    setIsTutorOpen(false);
  }

  function startNewConversation() {
    sessionVersion.current += 1;
    isTutorOpenRef.current = false;
    chatAbort.current?.abort();
    chatAbort.current = null;
    feedbackAborts.current.forEach((controller) => controller.abort());
    feedbackAborts.current.clear();
    failedContext.current = null;
    setMessages([]);
    setFeedbacks({});
    setTutorMessages([]);
    setTutorNotification(null);
    setHasUnreadTutorMessage(false);
    proactiveMessageIds.current.clear();
    setComposerValue("");
    setIsReplyPending(false);
    setReplyError(false);
    setReplyErrorDetail("");
    setIsTutorOpen(false);
    setSessionKey((current) => current + 1);
    setAnnouncement(text.newChatNotice);
  }

  return (
    <div className="app-shell">
      <Sidebar locale={locale} onNewConversation={startNewConversation} />
      <main className="main-panel" aria-label={text.chatRegion}>
        <header className="topbar">
          <div className="topbar-context">
            <span className="context-dot" aria-hidden="true" />
            <span>{text.workspace}</span>
            <span className="context-slash">/</span>
            <span className="context-current">{text.conversation}</span>
          </div>
          <div className="topbar-actions">
            <div className="language-switch" role="group" aria-label={text.interfaceLanguage}>
              <button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
              <button type="button" aria-pressed={locale === "es"} onClick={() => setLocale("es")}>ES</button>
            </div>
            <button className="topbar-new-chat" type="button" onClick={startNewConversation} aria-label={text.newConversation}>
              <Icon name="plus" size={17} />
              <span>{text.newConversation}</span>
            </button>
          </div>
        </header>

        <div className="conversation-layout">
          <div className="conversation-scroll">
            {messages.length === 0 ? (
              <section className="empty-state" aria-labelledby="welcome-title">
                <div className="welcome-mark" aria-hidden="true"><span>c</span><i /></div>
                <h1 id="welcome-title">{text.emptyTitle}</h1>
                <p>{text.emptyDescription}</p>
                <div className="starter-prompts" aria-label={text.emptyDescription}>
                  {starterPrompts.map(({ label, value }) => (
                    <button
                      type="button"
                      className="starter-prompt"
                      key={label}
                      onClick={() => {
                        setComposerValue(text[value]);
                        document.getElementById("chat-message")?.focus();
                      }}
                    >
                      <span>{text[label]}</span>
                      <Icon name="arrow" size={15} />
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <MessageList
                messages={messages}
                feedbacks={feedbacks}
                locale={locale}
                isReplyPending={isReplyPending}
                onRetryFeedback={retryFeedback}
              />
            )}

            {replyError ? (
              <div className="reply-error" role="alert">
                <p>{text.replyErrorTitle}</p>
                {replyErrorDetail ? <p className="reply-error__detail">{replyErrorDetail}</p> : null}
                <button type="button" className="text-action" onClick={() => {
                  if (failedContext.current) void requestReply(failedContext.current, sessionVersion.current);
                }}>
                  <Icon name="retry" size={15} /> {text.retry}
                </button>
              </div>
            ) : null}
            <div className="visually-hidden" role="status" aria-live="polite">{announcement}</div>
          </div>

          <MessageComposer
            locale={locale}
            value={composerValue}
            onChange={setComposerValue}
            onSend={sendMessage}
            disabled={isReplyPending}
          />
        </div>
      </main>

      {tutorNotification && !isTutorOpen ? (
        <div className="tutor-notification" role="status" aria-atomic="true">
          <button className="tutor-notification__open" type="button" onClick={openTutor} aria-label={text.tutorNotificationTitle}>
            <span className="tutor-notification__icon" aria-hidden="true"><Icon name="sparkle" size={16} /></span>
            <span className="tutor-notification__copy">
              <span className="tutor-notification__title">{text.tutorNotificationTitle}</span>
              <span className="tutor-notification__preview">{tutorNotification.content}</span>
            </span>
          </button>
          <button
            className="tutor-notification__dismiss"
            type="button"
            onClick={() => setTutorNotification(null)}
            aria-label={text.dismissTutorNotification}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      ) : null}

      <button
        className={`tutor-launcher${hasUnreadTutorMessage ? " tutor-launcher--unread" : ""}`}
        type="button"
        onClick={openTutor}
        aria-label={hasUnreadTutorMessage ? text.tutorUnread : text.tutorOpen}
      >
        <span className="tutor-launcher__icon"><Icon name="sparkle" size={19} /></span>
        <span>{text.tutor}</span>
        <span className={`tutor-launcher__status${hasUnreadTutorMessage ? " tutor-launcher__status--unread" : ""}`} aria-hidden="true" />
      </button>

      <TutorDialog
        key={sessionKey}
        open={isTutorOpen}
        onClose={closeTutor}
        locale={locale}
        conversation={messages}
        feedbacks={feedbacks}
        messages={tutorMessages}
        onMessagesChange={setTutorMessages}
        onFeedback={(feedback) => {
          if (feedback.hasCorrection) proactiveMessageIds.current.add(feedback.targetMessageId);
          setFeedbacks((current) => ({
            ...current,
            [feedback.targetMessageId]: { status: "ready", feedback },
          }));
        }}
      />
    </div>
  );
}
