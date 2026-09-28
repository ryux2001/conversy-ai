export type IconName =
  | "chat"
  | "voice"
  | "sparkle"
  | "plus"
  | "send"
  | "close"
  | "clock"
  | "arrow"
  | "check"
  | "retry"
  | "person"
  | "menu";

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    focusable: false as const,
  };

  switch (name) {
    case "chat":
      return <svg {...common}><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-1-4v-3.5a7.5 7.5 0 1 1 15 0Z" /><path d="M8 11h.01M12 11h.01M16 11h.01" strokeWidth="2.6" /></svg>;
    case "voice":
      return <svg {...common}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" /></svg>;
    case "sparkle":
      return <svg {...common}><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></svg>;
    case "plus":
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "send":
      return <svg {...common}><path d="m21 3-7.1 18-3.6-7.3L3 10.1 21 3Z" /><path d="M10.3 13.7 15 9" /></svg>;
    case "close":
      return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    case "clock":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" /></svg>;
    case "arrow":
      return <svg {...common}><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
    case "check":
      return <svg {...common}><path d="m5 12 4.3 4.3L19 6.5" /></svg>;
    case "retry":
      return <svg {...common}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.2 9A7 7 0 0 1 18 6l2 2m-16 8 2 2a7 7 0 0 0 11.8-3" /></svg>;
    case "person":
      return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>;
    case "menu":
      return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
  }
}
