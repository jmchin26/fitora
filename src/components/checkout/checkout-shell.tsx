import Link from "next/link";
import type { ReactNode } from "react";

import { ModeBadges } from "@/components/home/mode-badges";

export function CheckoutShell({
  children,
  eyebrow,
}: {
  children: ReactNode;
  eyebrow: string;
}) {
  return (
    <div className="min-h-dvh bg-[var(--canvas)] text-[var(--ink)]">
      <header className="border-b border-[var(--line)]">
        <div className="mx-auto flex w-full max-w-[82rem] flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12">
          <Link
            aria-label="Fitora home"
            className="font-serif text-2xl font-semibold tracking-[-0.04em]"
            href="/"
          >
            Fitora
          </Link>
          <ModeBadges />
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-[82rem] px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-20"
        id="main-content"
        tabIndex={-1}
      >
        <div className="mb-9 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--sage-dark)]">
            {eyebrow}
          </p>
          <Link
            className="text-sm font-semibold underline decoration-[var(--line)] underline-offset-4 hover:decoration-[var(--ink)]"
            href="/build"
          >
            Back to outfit builder
          </Link>
        </div>
        {children}
      </main>

      <footer className="border-t border-[var(--line)] px-5 py-7 text-sm text-[var(--muted-ink)] sm:px-8 lg:px-12">
        <div className="mx-auto flex w-full max-w-[82rem] flex-col justify-between gap-2 sm:flex-row">
          <p>Fictional products · Simulated inventory · Demo merchant</p>
          <p>No card data is collected by Fitora.</p>
        </div>
      </footer>
    </div>
  );
}
