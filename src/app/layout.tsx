import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Fitora — AI outfit planning",
    template: "%s · Fitora",
  },
  description:
    "Build a complete, catalogue-verified outfit for the moment, then review your checkout before continuing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
