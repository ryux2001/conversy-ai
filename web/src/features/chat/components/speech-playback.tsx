"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/shared/lib/copy";
import { copy } from "@/shared/lib/copy";
import { Icon } from "@/shared/components/icon";

export function SpeechPlayback({ text, locale, audioUrl, pending }: {
  text: string;
  locale: Locale;
  audioUrl?: string;
  pending?: boolean;
}) {
  const labels = copy[locale];
  const [playing, setPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [playbackError, setPlaybackError] = useState("");

  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  async function togglePlayback() {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setPlaybackError(labels.localVoiceUnavailable);
      return;
    }
    if (playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      return;
    }

    setPlaybackError("");
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    let voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
      voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
        const timeout = window.setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1_200);
        window.speechSynthesis.addEventListener("voiceschanged", () => {
          window.clearTimeout(timeout);
          resolve(window.speechSynthesis.getVoices());
        }, { once: true });
      });
    }
    const localEnglishVoice = voices.find((voice) => voice.localService && voice.lang.toLowerCase().startsWith("en"));
    if (!localEnglishVoice) {
      setPlaybackError(labels.localVoiceUnavailable);
      return;
    }
    utterance.voice = localEnglishVoice;
    utterance.onstart = () => setPlaying(true);
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="audio-message-player">
      {!audioUrl && !pending ? (
        <button className="audio-play-button" type="button" onClick={togglePlayback} aria-label={playing ? labels.stopAudio : labels.playAudio}>
          {playing ? <span className="audio-stop-mark" aria-hidden="true" /> : <Icon name="voice" size={17} />}
        </button>
      ) : <span className="audio-play-placeholder" aria-hidden="true"><Icon name="voice" size={17} /></span>}
      {audioUrl ? <audio className="assistant-audio-control" controls preload="metadata" src={audioUrl} aria-label={labels.playAudio} /> : (
        <div className="audio-message-track" aria-hidden="true"><span className={playing ? "audio-wave audio-wave--active" : "audio-wave"} /></div>
      )}
      <span className="audio-message-caption">{labels.voiceReply}</span>
      {!audioUrl && pending ? <span className="audio-message-pending" role="status">{labels.generatingVoice}</span> : null}
      <button className="transcript-toggle" type="button" aria-expanded={showTranscript} onClick={() => setShowTranscript((visible) => !visible)}>
        {showTranscript ? labels.hideTranscript : labels.showTranscript}
      </button>
      {playbackError ? <span className="voice-error" role="alert">{playbackError}</span> : null}
      {showTranscript ? <p className="audio-transcript">{text}</p> : null}
    </div>
  );
}
