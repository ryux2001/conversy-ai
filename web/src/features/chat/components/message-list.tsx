import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ConversationMessage, FeedbackState } from "../types";
import type { Locale } from "@/shared/lib/copy";
import { copy } from "@/shared/lib/copy";
import { Icon } from "@/shared/components/icon";
import { FeedbackCard } from "./feedback-card";
import { SpeechPlayback } from "./speech-playback";

export function MessageList({
  messages,
  feedbacks,
  locale,
  isReplyPending,
  onRetryFeedback,
  onRetryTranscription,
  onDiscardAudio,
  latestUserMessageId,
  transcriptEditingDisabled,
  onEditTranscript,
}: {
  messages: ConversationMessage[];
  feedbacks: Record<string, FeedbackState>;
  locale: Locale;
  isReplyPending: boolean;
  onRetryFeedback: (messageId: string) => void;
  onRetryTranscription: (messageId: string) => void;
  onDiscardAudio: (messageId: string) => void;
  latestUserMessageId: string | null;
  transcriptEditingDisabled: boolean;
  onEditTranscript: (messageId: string, transcript: string) => void;
}) {
  const text = copy[locale];
  const endRef = useRef<HTMLDivElement>(null);
  const [editingTranscriptId, setEditingTranscriptId] = useState<string | null>(null);
  const [editedTranscript, setEditedTranscript] = useState("");

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
              {message.modality === "audio" && message.role === "user" ? (
                <div className="user-audio-message">
                  {message.audioUrl ? <audio controls preload="metadata" src={message.audioUrl} aria-label={text.playAudio} /> : null}
                  {message.content ? (
                    <>
                      <p className="audio-transcript--visible">{message.content}</p>
                      {message.id === latestUserMessageId && message.audioState === "ready" ? (
                        editingTranscriptId === message.id ? (
                          <form className="audio-transcript-editor" onSubmit={(event: FormEvent<HTMLFormElement>) => {
                            event.preventDefault();
                            const transcript = editedTranscript.trim();
                            if (!transcript || transcriptEditingDisabled) return;
                            onEditTranscript(message.id, transcript);
                            setEditingTranscriptId(null);
                            setEditedTranscript("");
                          }}>
                            <label htmlFor={`transcript-editor-${message.id}`}>{text.editTranscript}</label>
                            <textarea
                              id={`transcript-editor-${message.id}`}
                              value={editedTranscript}
                              onChange={(event) => setEditedTranscript(event.target.value)}
                              disabled={transcriptEditingDisabled}
                              rows={2}
                              required
                            />
                            <div className="audio-transcript-editor__actions">
                              <button className="text-action" type="submit" disabled={transcriptEditingDisabled || !editedTranscript.trim()}>{text.saveTranscript}</button>
                              <button className="text-action" type="button" onClick={() => {
                                setEditingTranscriptId(null);
                                setEditedTranscript("");
                              }}>{text.cancelTranscriptEdit}</button>
                            </div>
                          </form>
                        ) : (
                          <button
                            className="text-action audio-transcript-edit-button"
                            type="button"
                            onClick={() => {
                              setEditedTranscript(message.content);
                              setEditingTranscriptId(message.id);
                            }}
                            disabled={transcriptEditingDisabled}
                          >
                            {text.editTranscript}
                          </button>
                        )
                      ) : null}
                    </>
                  ) : null}
                  {message.audioState === "transcribing" ? <p className="audio-processing" role="status">{text.transcribing}</p> : null}
                  {message.audioState === "transcription-error" ? (
                    <div className="audio-message-error" role="alert">
                      <p>{text.transcriptionFailed}</p>
                      {message.audioError ? <p className="audio-error-detail">{message.audioError}</p> : null}
                      <button className="text-action" type="button" onClick={() => onRetryTranscription(message.id)}>{text.retryTranscription}</button>
                      <button className="text-action" type="button" onClick={() => onDiscardAudio(message.id)}>{text.cancelRecording}</button>
                    </div>
                  ) : null}
                  {message.audioState === "audio-error" ? <p className="audio-processing">{text.audioUnavailable}</p> : null}
                </div>
              ) : message.modality === "audio" && message.role === "assistant" ? (
                <SpeechPlayback
                  text={message.content}
                  locale={locale}
                  audioUrl={message.audioUrl}
                  pending={message.audioState === "synthesizing"}
                />
              ) : <p>{message.content}</p>}
            </div>
            {message.role === "user" && message.content.trim() ? (
              <FeedbackCard
                state={feedbacks[message.id]}
                locale={locale}
                onRetry={() => onRetryFeedback(message.id)}
                showAudioNoCorrection={message.modality === "audio"}
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
