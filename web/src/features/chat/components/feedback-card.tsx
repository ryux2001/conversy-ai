import type { FeedbackState } from "../types";
import type { Locale } from "@/shared/lib/copy";
import { copy } from "@/shared/lib/copy";
import { Icon } from "@/shared/components/icon";

export function FeedbackCard({
  state,
  locale,
  onRetry,
  showAudioNoCorrection,
}: {
  state: FeedbackState | undefined;
  locale: Locale;
  onRetry: () => void;
  showAudioNoCorrection?: boolean;
}) {
  const text = copy[locale];
  if (!state) return null;

  if (state.status === "loading") {
    return (
      <div className="feedback-card feedback-card--loading" role="status">
        <span className="feedback-status-mark"><Icon name="sparkle" size={14} /></span>
        <span>{text.feedbackPending}</span>
        <span className="mini-loader" aria-hidden="true" />
      </div>
    );
  }

  if (state.status === "error") {
    let errorMessage = text.feedbackError;
    switch (state.code) {
      case "NETWORK_ERROR":
        errorMessage = text.feedbackErrorNetwork;
        break;
      case "LLM_UNAVAILABLE":
        errorMessage = text.feedbackErrorModel;
        break;
      case "LLM_PROVIDER_ERROR":
        errorMessage = text.feedbackErrorProvider;
        break;
      case "LLM_TIMEOUT":
        errorMessage = text.feedbackErrorTimeout;
        break;
      case "LLM_OUTPUT_TRUNCATED":
      case "LLM_EMPTY_RESPONSE":
        errorMessage = text.feedbackErrorIncomplete;
        break;
      case "LLM_TUTOR_CONTRACT_INVALID":
        errorMessage = text.feedbackErrorLanguage;
        break;
      case "LLM_INVALID_JSON":
        errorMessage = text.feedbackErrorInvalid;
        break;
      case "LLM_FEEDBACK_INCONSISTENT":
        errorMessage = text.feedbackErrorInconsistent;
        break;
    }

    return (
      <div className="feedback-card feedback-card--error" role="status">
        <span>{errorMessage}</span>
        <button className="text-action" type="button" onClick={onRetry}>
          <Icon name="retry" size={14} /> {text.retry}
        </button>
      </div>
    );
  }

  if (showAudioNoCorrection && !state.feedback.hasCorrection) {
    return (
      <div className="feedback-card" role="status">
        <span>{text.voiceNoCorrection}</span>
      </div>
    );
  }

  return null;
}
