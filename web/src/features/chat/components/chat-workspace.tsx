"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "@/features/navigation/components/sidebar";
import { requestChatReply } from "@/features/chat/lib/chat-api";
import type { ConversationMessage, FeedbackState, TutorFeedback } from "@/features/chat/types";
import { MessageComposer } from "@/features/chat/components/message-composer";
import { MessageList } from "@/features/chat/components/message-list";
import { requestFeedback } from "@/features/tutor/lib/tutor-api";
import { decodeAudioToMono16k } from "@/features/chat/lib/audio";
import { whisperClient, getCachedWhisperFiles, deleteCachedWhisperModel } from "@/features/speech/lib/whisper-client";
import { WHISPER_MODEL_SOURCE, WHISPER_CACHE_VERIFICATION_FILES } from "@/features/speech/lib/whisper-config";
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

export function ChatWorkspace({
  mode,
  locale,
  onLocaleChange,
  isActive,
}: {
  mode: "text" | "voice";
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  isActive: boolean;
}) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [feedbacks, setFeedbacks] = useState<Record<string, FeedbackState>>({});
  const [tutorMessages, setTutorMessages] = useState<TutorMessage[]>([]);
  const [tutorNotification, setTutorNotification] = useState<TutorMessage | null>(null);
  const [hasUnreadTutorMessage, setHasUnreadTutorMessage] = useState(false);
  const [composerValue, setComposerValue] = useState("");
  const [isReplyPending, setIsReplyPending] = useState(false);
  const [isAudioProcessing, setIsAudioProcessing] = useState(false);
  const [speechModelState, setSpeechModelState] = useState<"idle" | "cached" | "preparing" | "ready" | "error">("idle");
  const [speechModelError, setSpeechModelError] = useState("");
  const [speechModelProgress, setSpeechModelProgress] = useState("");
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
  const speechAborts = useRef(new Map<string, AbortController>());
  const audioResources = useRef(new Map<string, { url: string; blob?: Blob; bytes: number }>());
  const failedContext = useRef<ConversationMessage[] | null>(null);
  const text = copy[locale];

  useEffect(() => () => {
    speechAborts.current.forEach((controller) => controller.abort());
    speechAborts.current.clear();
    audioResources.current.forEach(({ url }) => URL.revokeObjectURL(url));
    audioResources.current.clear();
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    isTutorOpenRef.current = isTutorOpen && isActive;
  }, [isActive, isTutorOpen]);

  useEffect(() => {
    if (isActive || mode !== "voice") return;
    whisperClient.terminate();
    const resetTimer = window.setTimeout(() => {
      setSpeechModelState(WHISPER_MODEL_SOURCE === "hub" ? "cached" : "idle");
      setSpeechModelError("");
      setSpeechModelProgress("");
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [isActive, mode]);

  useEffect(() => {
    if (mode !== "voice" || !isActive || WHISPER_MODEL_SOURCE !== "hub") return;
    let active = true;
    void getCachedWhisperFiles().then((files) => {
      if (active && files.length === WHISPER_CACHE_VERIFICATION_FILES.length) setSpeechModelState("cached");
    }).catch(() => undefined);
    return () => { active = false; };
  }, [isActive, mode]);

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
    options: { suppressTutorMessage?: boolean } = {},
  ): Promise<TutorFeedback | null> => {
    feedbackAborts.current.get(messageId)?.abort();
    const controller = new AbortController();
    feedbackAborts.current.set(messageId, controller);
    setFeedbacks((current) => ({ ...current, [messageId]: { status: "loading" } }));

    try {
      const feedback = await requestFeedback(context, controller.signal);
      if (sessionVersion.current === version) {
        setFeedbacks((current) => ({ ...current, [messageId]: { status: "ready", feedback } }));
        if (!options.suppressTutorMessage && feedback.hasCorrection && feedback.suggestion?.trim() && !proactiveMessageIds.current.has(messageId)) {
          proactiveMessageIds.current.add(messageId);
          const original = context.at(-1)?.content.trim() ?? "";
          const suggestion = feedback.suggestion.trim();
          const correctedQuote = `“${/[.!?]$/.test(suggestion) ? suggestion : `${suggestion}.`}”`;
          const explanation = feedback.explanation.trim();
          const canContrast = original.length <= 180 && suggestion.length <= 180;
          const tutorMessage: TutorMessage = {
            id: crypto.randomUUID(),
            role: "tutor",
            kind: "correction",
            targetMessageId: feedback.targetMessageId,
            correction: feedback,
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
      return feedback;
    } catch (error) {
      if (!controller.signal.aborted && sessionVersion.current === version) {
        const code = error instanceof ApiRequestError ? error.code : "UNKNOWN";
        setFeedbacks((current) => current[messageId]?.status === "ready"
          ? current
          : { ...current, [messageId]: { status: "error", code } });
      }
      return null;
    } finally {
      if (feedbackAborts.current.get(messageId) === controller) {
        feedbackAborts.current.delete(messageId);
      }
    }
  }, []);

  const rememberAudio = useCallback((messageId: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    audioResources.current.set(messageId, { url, blob, bytes: blob.size });
    let totalBytes = 0;
    for (const resource of audioResources.current.values()) totalBytes += resource.bytes;
    const evicted: string[] = [];
    for (const [id, resource] of audioResources.current) {
      if (audioResources.current.size <= 12 && totalBytes <= 40 * 1024 * 1024) break;
      if (id === messageId) continue;
      URL.revokeObjectURL(resource.url);
      audioResources.current.delete(id);
      totalBytes -= resource.bytes;
      evicted.push(id);
    }
    if (evicted.length) {
      const evictedSet = new Set(evicted);
      setMessages((current) => current.map((message) => evictedSet.has(message.id)
        ? { ...message, audioUrl: undefined, audioState: "audio-error" }
        : message));
    }
    return url;
  }, []);

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
        const voiceTurn = context.at(-1)?.modality === "audio";
        setMessages([...context, voiceTurn ? { ...reply, modality: "audio", audioState: "ready" } : reply]);
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

  function releaseAudio(messageId: string) {
    const resource = audioResources.current.get(messageId);
    if (resource) URL.revokeObjectURL(resource.url);
    audioResources.current.delete(messageId);
  }

  async function prepareSpeechModel() {
    if (speechModelState === "preparing" || speechModelState === "ready") return;
    const version = sessionVersion.current;
    setSpeechModelState("preparing");
    setSpeechModelError("");
    setSpeechModelProgress("");
    try {
      await whisperClient.prepare((event) => {
        if (event.status === "progress" && event.file && typeof event.progress === "number" && sessionVersion.current === version && isActive) {
          const file = event.file.split("/").at(-1) ?? event.file;
          setSpeechModelProgress(`${file} · ${Math.round(event.progress)}%`);
        }
      });
      if (sessionVersion.current === version) {
        setSpeechModelState("ready");
        setSpeechModelProgress("");
      }
    } catch (error) {
      if (sessionVersion.current === version && (mode !== "voice" || isActive)) {
        setSpeechModelState("error");
        setSpeechModelProgress("");
        setSpeechModelError(error instanceof Error ? error.message : "WHISPER_FAILED");
      }
    }
  }

  async function removeSpeechModel() {
    if (mode === "voice") whisperClient.terminate();
    await deleteCachedWhisperModel();
    if (mode === "voice") {
      setSpeechModelState("idle");
      setSpeechModelError("");
      setSpeechModelProgress("");
    }
  }

  async function transcribeVoiceMessage(
    messageId: string,
    baseContext: ConversationMessage[],
    source: Blob,
    version: number,
  ) {
    speechAborts.current.get(messageId)?.abort();
    const controller = new AbortController();
    speechAborts.current.set(messageId, controller);
    setIsAudioProcessing(true);
    setMessages((current) => current.map((message) => message.id === messageId
      ? { ...message, audioState: "transcribing", audioError: undefined }
      : message));

    try {
      const audio = await decodeAudioToMono16k(source);
      const transcript = await whisperClient.transcribe(audio.samples, controller.signal);
      if (controller.signal.aborted || sessionVersion.current !== version) return;

      const userMessage: ConversationMessage = {
        id: messageId,
        role: "user",
        content: transcript.text,
        modality: "audio",
        audioUrl: audioResources.current.get(messageId)?.url,
        audioState: "ready",
      };
      const context = [...baseContext, userMessage];
      setMessages(context);
      setFeedbacks((current) => ({ ...current, [messageId]: { status: "loading" } }));

      void requestReply(context, version);
      void evaluate(context, messageId, version);
      audioResources.current.set(messageId, { ...audioResources.current.get(messageId)!, blob: undefined });
    } catch (error) {
      if (!controller.signal.aborted && sessionVersion.current === version) {
        const detail = error instanceof Error ? error.message : text.transcriptionFailed;
        setMessages((current) => current.map((message) => message.id === messageId
          ? { ...message, audioState: "transcription-error", audioError: detail }
          : message));
      }
    } finally {
      if (speechAborts.current.get(messageId) === controller) speechAborts.current.delete(messageId);
      if (sessionVersion.current === version) setIsAudioProcessing(false);
    }
  }

  function sendAudioMessage(audio: Blob) {
    if (isReplyPending || isAudioProcessing) return;
    const messageId = crypto.randomUUID();
    const audioUrl = rememberAudio(messageId, audio);
    const pendingMessage: ConversationMessage = {
      id: messageId, role: "user", content: "", modality: "audio", audioUrl, audioState: "transcribing",
    };
    const baseContext = messages.filter((message) => message.content.trim());
    setMessages([...baseContext, pendingMessage]);
    void transcribeVoiceMessage(messageId, baseContext, audio, sessionVersion.current);
  }

  function retryTranscription(messageId: string) {
    const resource = audioResources.current.get(messageId);
    const index = messages.findIndex((message) => message.id === messageId);
    if (!resource?.blob || index < 0 || isAudioProcessing || isReplyPending) return;
    void transcribeVoiceMessage(messageId, messages.slice(0, index).filter((message) => message.content.trim()), resource.blob, sessionVersion.current);
  }

  function editVoiceTranscript(messageId: string, transcript: string) {
    if (mode !== "voice" || isAudioProcessing || isReplyPending) return;
    const messageIndex = messages.findIndex((message) => message.id === messageId);
    const latestUserMessage = messages.slice().reverse().find((message) => message.role === "user");
    const original = messages[messageIndex];
    if (!original || original.id !== latestUserMessage?.id || original.modality !== "audio" || !transcript.trim()) return;

    sessionVersion.current += 1;
    const version = sessionVersion.current;
    chatAbort.current?.abort();
    chatAbort.current = null;
    feedbackAborts.current.forEach((controller) => controller.abort());
    feedbackAborts.current.clear();
    const correctedMessage: ConversationMessage = { ...original, content: transcript.trim(), audioState: "ready", audioError: undefined };
    const context = [...messages.slice(0, messageIndex), correctedMessage];
    failedContext.current = null;
    proactiveMessageIds.current.delete(messageId);
    setMessages(context);
    setFeedbacks((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });
    setTutorMessages([]);
    setTutorNotification(null);
    setHasUnreadTutorMessage(false);
    isTutorOpenRef.current = false;
    setIsTutorOpen(false);
    setSessionKey((current) => current + 1);
    setReplyError(false);
    setReplyErrorDetail("");
    void requestReply(context, version);
    void evaluate(context, messageId, version);
    setAnnouncement(text.transcriptEdited);
  }

  function discardAudioMessage(messageId: string) {
    speechAborts.current.get(messageId)?.abort();
    speechAborts.current.delete(messageId);
    feedbackAborts.current.get(messageId)?.abort();
    feedbackAborts.current.delete(messageId);
    releaseAudio(messageId);
    setMessages((current) => current.filter((message) => message.id !== messageId));
    setFeedbacks((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }

  function sendMessage() {
    const content = composerValue.trim();
    if (!content || isReplyPending || isAudioProcessing) return;

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
    speechAborts.current.forEach((controller) => controller.abort());
    speechAborts.current.clear();
    whisperClient.terminate();
    audioResources.current.forEach(({ url }) => URL.revokeObjectURL(url));
    audioResources.current.clear();
    failedContext.current = null;
    setMessages([]);
    setFeedbacks({});
    setTutorMessages([]);
    setTutorNotification(null);
    setHasUnreadTutorMessage(false);
    proactiveMessageIds.current.clear();
    setComposerValue("");
    setIsReplyPending(false);
    setIsAudioProcessing(false);
    setSpeechModelState("idle");
    setSpeechModelError("");
    setSpeechModelProgress("");
    setReplyError(false);
    setReplyErrorDetail("");
    setIsTutorOpen(false);
    setSessionKey((current) => current + 1);
    setAnnouncement(text.newChatNotice);
  }

  return (
    <div className="app-shell">
      <Sidebar locale={locale} activeMode={mode} onNewConversation={startNewConversation} />
      <main className="main-panel" aria-label={text.chatRegion}>
        <header className="topbar">
          <div className="topbar-context">
            <span className="context-dot" aria-hidden="true" />
            <span>{text.workspace}</span>
            <span className="context-slash">/</span>
            <span className="context-current">{mode === "voice" ? text.voiceConversation : text.conversation}</span>
          </div>
          <div className="topbar-actions">
            <div className="language-switch" role="group" aria-label={text.interfaceLanguage}>
              <button type="button" aria-pressed={locale === "en"} onClick={() => onLocaleChange("en")}>EN</button>
              <button type="button" aria-pressed={locale === "es"} onClick={() => onLocaleChange("es")}>ES</button>
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
                <h1 id={`welcome-title-${mode}`}>{mode === "voice" ? text.voiceEmptyTitle : text.emptyTitle}</h1>
                <p>{mode === "voice" ? text.voiceEmptyDescription : text.emptyDescription}</p>
                {mode === "text" ? (
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
                ) : null}
              </section>
            ) : (
            <MessageList
                messages={messages}
                feedbacks={feedbacks}
                locale={locale}
                isReplyPending={isReplyPending}
                latestUserMessageId={messages.slice().reverse().find((message) => message.role === "user")?.id ?? null}
                transcriptEditingDisabled={isReplyPending || isAudioProcessing}
                onEditTranscript={editVoiceTranscript}
              onRetryFeedback={retryFeedback}
              onRetryTranscription={retryTranscription}
              onDiscardAudio={discardAudioMessage}
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
            key={`${mode}-${isActive ? "active" : "inactive"}`}
            mode={mode}
            isActive={isActive}
            locale={locale}
            value={composerValue}
            onChange={setComposerValue}
            onSend={sendMessage}
            onSendAudio={sendAudioMessage}
            disabled={isReplyPending || isAudioProcessing}
            speechModelState={speechModelState}
            speechModelError={speechModelError}
            speechModelProgress={speechModelProgress}
            onPrepareSpeech={() => void prepareSpeechModel()}
            onRemoveSpeech={WHISPER_MODEL_SOURCE === "hub" ? () => void removeSpeechModel() : undefined}
            modelSource={WHISPER_MODEL_SOURCE}
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
        idPrefix={mode}
        open={isTutorOpen && isActive}
        onClose={closeTutor}
        locale={locale}
        conversation={messages}
        isConversationReplyPending={isReplyPending}
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
