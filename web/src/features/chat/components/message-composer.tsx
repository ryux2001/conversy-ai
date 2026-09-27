import { useRef, type FormEvent, type KeyboardEvent } from "react";
import type { Locale } from "@/shared/lib/copy";
import { copy } from "@/shared/lib/copy";
import { Icon } from "@/shared/components/icon";

export function MessageComposer({
  locale,
  value,
  onChange,
  onSend,
  disabled,
}: {
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  const text = copy[locale];
  const formRef = useRef<HTMLFormElement>(null);

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

  return (
    <div className="composer-area">
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
    </div>
  );
}
