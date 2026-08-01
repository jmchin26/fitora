import type { Metadata } from "next";
import Link from "next/link";

import { BuildExperience } from "@/components/build/build-experience";

export const metadata: Metadata = {
  title: "Build an outfit",
  description:
    "Set your occasion, sizes, colours, style, and budget to find three complete looks.",
};

export default function BuildPage() {
  return (
    <div className="min-h-dvh bg-[var(--canvas)] text-[var(--ink)]">
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[color:rgba(255,255,255,0.94)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8 lg:px-12">
          <Link
            className="font-serif text-2xl font-semibold tracking-[-0.04em]"
            href="/"
          >
            Fitora
          </Link>
          <Link
            className="text-sm font-semibold underline decoration-[var(--line)] underline-offset-4 hover:decoration-[var(--ink)]"
            href="/"
          >
            Back to home
          </Link>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="mx-auto grid w-full max-w-[96rem] gap-7 px-6 py-9 lg:grid-cols-[0.8fr_1.2fr] lg:items-end lg:gap-14 lg:px-12 lg:py-9">
          <div>
            <p className="text-[0.66rem] font-bold uppercase tracking-[0.15em] text-[var(--sage-dark)]">Outfit builder</p>
            <h1 className="mt-3 max-w-4xl font-serif text-[clamp(3.25rem,5.4vw,5.5rem)] font-medium leading-[0.88] tracking-[-0.06em]">
              Build a look that fits.
            </h1>
          </div>
          <div className="max-w-2xl border-l-2 border-[var(--sage-dark)] pl-5 lg:pb-1">
            <p className="max-w-xl text-base leading-7 text-[var(--ink)]">
              Tell us where you are going, what fits and what you would like
              to spend. We will put together three complete looks.
            </p>
          </div>
        </section>

        <BuildExperience />
      </main>

      <footer className="border-t border-[var(--line)] bg-[var(--surface)] px-6 py-7 text-sm text-[var(--muted-ink)] lg:px-12">
        <div className="mx-auto flex w-full max-w-[96rem] justify-between gap-6">
          <p className="font-serif text-lg text-[var(--ink)]">Fitora</p>
          <p>Style that fits the moment.</p>
        </div>
      </footer>
    </div>
  );
}
