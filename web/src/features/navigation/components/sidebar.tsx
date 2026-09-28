"use client";

import { useEffect, useRef, useState } from "react";
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!sidebarRef.current?.contains(event.target as Node)) setIsMobileMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMobileMenuOpen]);

  return (
    <aside ref={sidebarRef} className="sidebar" aria-label={text.sidebarLabel}>
      <Link className="brand" href="/" aria-label="Conversy — English practice">
        <span className="brand-mark" aria-hidden="true">c</span>
        <span className="brand-name">conversy<span className="brand-period">.</span></span>
      </Link>

      <button
        className="mobile-menu-toggle"
        type="button"
        aria-expanded={isMobileMenuOpen}
        aria-controls="mobile-sidebar-menu"
        aria-label={isMobileMenuOpen ? text.closeMobileMenu : text.openMobileMenu}
        onClick={() => setIsMobileMenuOpen((open) => !open)}
      >
        <Icon name={isMobileMenuOpen ? "close" : "menu"} size={19} />
      </button>

      <button className="new-chat-button" type="button" onClick={() => {
        setIsMobileMenuOpen(false);
        onNewConversation();
      }} aria-label={text.newConversation}>
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

      <div id="mobile-sidebar-menu" className="mobile-sidebar-menu" hidden={!isMobileMenuOpen}>
        <div className="sidebar-section-label">{text.yourSpace}</div>
        <nav className="side-navigation" aria-label={text.sidebarLabel}>
          <Link className="side-link side-link--active" href="/" aria-current="page" aria-label={text.selectedPractice} onClick={() => setIsMobileMenuOpen(false)}>
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
      </div>
    </aside>
  );
}
