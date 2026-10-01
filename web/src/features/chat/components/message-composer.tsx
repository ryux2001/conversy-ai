import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Locale } from "@/shared/lib/copy";
import { copy } from "@/shared/lib/copy";
import { Icon } from "@/shared/components/icon";

export function MessageComposer({
  mode,
  isActive,
  locale,
  value,
  onChange,
  onSend,
  onSendAudio,
  disabled,
  speechModelState,
  speechModelError,
  speechModelProgress,
  onPrepareSpeech,
  onRemoveSpeech,
  modelSource,
}: {
  mode: "text" | "voice";
  isActive: boolean;
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onSendAudio: (audio: Blob) => void;
  disabled: boolean;
  speechModelState: "idle" | "cached" | "preparing" | "ready" | "error";
  speechModelError: string;
  speechModelProgress: string;
  onPrepareSpeech: () => void;
  onRemoveSpeech?: () => void;
  modelSource: "hub" | "local";
}) {
  const text = copy[locale];
  const formRef = useRef<HTMLFormElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const discardRef = useRef(false);
  const previewUrlRef = useRef<string | null>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [preview, setPreview] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [recordingError, setRecordingError] = useState("");

  useEffect(() => {
    if (!isRecording) return;
    const interval = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsedSeconds(seconds);
      if (seconds >= 30) {
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== "inactive") recorder.stop();
      }
    }, 200);
    return () => window.clearInterval(interval);
  }, [isRecording]);

  useEffect(() => () => {
    isActiveRef.current = false;
    discardRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSend();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  async function startRecording() {
    setRecordingError("");
    if (speechModelState !== "ready") {
      setRecordingError(text.prepareWhisperFirst);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError(text.recordingUnavailable);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (!isActiveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      discardRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setRecordingError(text.recordingFailed);
        setIsRecording(false);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setIsRecording(false);
        if (discardRef.current) {
          chunksRef.current = [];
          setElapsedSeconds(0);
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (!blob.size) {
          setRecordingError(text.recordingFailed);
          return;
        }
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setPreview(blob);
      };
      startedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setIsRecording(true);
      recorder.start(250);
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      setRecordingError(denied ? text.microphoneDenied : text.recordingFailed);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function discardRecording() {
    discardRef.current = true;
    if (recorderRef.current?.state !== "inactive") {
      recorderRef.current?.stop();
    } else {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setIsRecording(false);
      setElapsedSeconds(0);
    }
    clearPreview();
    setRecordingError("");
  }

  function clearPreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl("");
    setPreview(null);
  }

  function sendRecording() {
    if (!preview) return;
    onSendAudio(preview);
    clearPreview();
    setElapsedSeconds(0);
  }

  return (
    <div className="composer-area">
      {mode === "voice" && isRecording ? (
        <div className="voice-capture" role="status" aria-live="polite">
          <span className="recording-indicator" aria-hidden="true" />
          <span>{text.recordingNow} · 0:{String(Math.min(elapsedSeconds, 30)).padStart(2, "0")}</span>
          <button className="voice-control-button" type="button" onClick={stopRecording} aria-label={text.stopRecording}><Icon name="check" size={16} /></button>
          <button className="voice-control-button" type="button" onClick={discardRecording} aria-label={text.cancelRecording}><Icon name="close" size={16} /></button>
        </div>
      ) : null}
      {mode === "voice" && preview && previewUrl ? (
        <div className="voice-preview">
          <span>{text.recordingPreview}</span>
          <audio controls preload="metadata" src={previewUrl} />
          <button className="voice-control-button" type="button" onClick={discardRecording} aria-label={text.cancelRecording}><Icon name="close" size={16} /></button>
          <button className="voice-send-button" type="button" onClick={sendRecording} disabled={disabled} aria-label={text.sendRecording}><Icon name="send" size={17} /></button>
        </div>
      ) : null}
      {mode === "voice" && recordingError ? <p className="voice-error" role="alert">{recordingError}</p> : null}
      {mode === "voice" ? (
        <>
          <div className="speech-model-control" aria-live="polite">
            {speechModelState === "preparing" ? <span role="status">{text.preparingWhisper}{speechModelProgress ? ` · ${speechModelProgress}` : ""}</span> : null}
            {speechModelState === "cached" ? <span role="status">{text.whisperCached}</span> : null}
            {speechModelState === "ready" ? <span role="status">{text.whisperReady}</span> : null}
            {speechModelState === "error" ? <span className="voice-error" role="alert">{text.whisperLoadFailed}{speechModelError ? ` (${speechModelError})` : ""}</span> : null}
            {speechModelState !== "ready" && speechModelState !== "preparing" ? (
              <button type="button" className="text-action" onClick={onPrepareSpeech}>{speechModelState === "error" ? text.retryWhisper : speechModelState === "cached" ? text.loadCachedWhisper : modelSource === "local" ? text.prepareLocalWhisper : text.prepareWhisper}</button>
            ) : null}
            {(speechModelState === "ready" || speechModelState === "cached") && onRemoveSpeech ? (
              <button type="button" className="text-action" onClick={onRemoveSpeech}>{text.removeWhisper}</button>
            ) : null}
          </div>
          <div className="voice-composer">
            <button className="record-button" type="button" onClick={startRecording} disabled={!isActive || disabled || speechModelState !== "ready" || isRecording || Boolean(preview)} aria-label={text.recordAudio}>
              <Icon name="voice" size={18} />
            </button>
            <p className="composer-hint">{text.voiceComposerHint}</p>
          </div>
        </>
      ) : (
        <>
          <form className="composer" ref={formRef} onSubmit={submit}>
            <label className="visually-hidden" htmlFor="chat-message">{text.composerLabel}</label>
            <textarea
              id="chat-message"
              rows={1}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={text.composerPlaceholder}
              disabled={disabled}
              maxLength={4_000}
            />
            <button className="send-button" type="submit" aria-label={text.send} disabled={disabled || !value.trim()}>
              <Icon name="send" size={18} />
            </button>
          </form>
          <p className="composer-hint">{text.keyboardHint}</p>
        </>
      )}
    </div>
  );
}
