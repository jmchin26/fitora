import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Fitora — AI outfit planning",
    template: "%s · Fitora",
  },
  description:
    "Build a complete, catalogue-verified outfit for the moment, then approve a secure sandbox checkout.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

