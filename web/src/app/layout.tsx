import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conversy — English practice",
  description: "A calm space to practice English and get thoughtful guidance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
