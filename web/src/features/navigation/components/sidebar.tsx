import Link from "next/link";
import type { Locale } from "@/shared/lib/copy";
import { copy } from "@/shared/lib/copy";
import { Icon } from "@/shared/components/icon";

export function Sidebar({
  locale,
  onNewConversation,
}: {
  locale: Locale;
  onNewConversation: () => void;
}) {
  const text = copy[locale];

  return (
    <aside className="sidebar" aria-label={text.sidebarLabel}>
      <Link className="brand" href="/" aria-label="Conversy — English practice">
        <span className="brand-mark" aria-hidden="true">c</span>
        <span className="brand-name">conversy<span className="brand-period">.</span></span>
      </Link>

      <button className="new-chat-button" type="button" onClick={onNewConversation} aria-label={text.newConversation}>
        <Icon name="plus" size={17} />
        <span>{text.newConversation}</span>
      </button>

      <div className="sidebar-section-label">{text.yourSpace}</div>
      <nav className="side-navigation">
        <Link className="side-link side-link--active" href="/" aria-current="page" aria-label={text.selectedPractice}>
          <Icon name="chat" size={18} />
          <span>{text.practice}</span>
          <span className="active-dot" aria-hidden="true" />
        </Link>
        <span className="side-link side-link--disabled" aria-disabled="true">
          <Icon name="voice" size={18} />
          <span>{text.voicePractice}</span>
          <span className="soon-label">{text.comingSoon}</span>
        </span>
      </nav>

      <div className="sidebar-bottom">
        <div className="temporary-note-icon"><Icon name="clock" size={16} /></div>
        <div>
          <p>{text.temporaryChat}</p>
          <span>{text.chatNotSaved}</span>
        </div>
      </div>
    </aside>
  );
}
