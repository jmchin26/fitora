import type { Metadata } from "next";
import Link from "next/link";

import { BuildExperience } from "@/components/build/build-experience";
import { ModeBadges } from "@/components/home/mode-badges";

export const metadata: Metadata = {
  title: "Build an outfit",
  description:
    "Set your occasion, sizes, colours, style, and budget to build up to three catalogue-verified outfits.",
};

export default function BuildPage() {
  return (
    <div className="min-h-dvh bg-[var(--canvas)] text-[var(--ink)]">
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[color:rgba(243,239,231,0.92)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12">
          <Link
            className="font-serif text-2xl font-semibold tracking-[-0.04em]"
            href="/"
          >
            Fitora
          </Link>
          <ModeBadges />
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="relative mx-auto grid w-full max-w-[96rem] gap-8 overflow-hidden px-5 pb-12 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(24rem,1.2fr)] lg:gap-20 lg:px-16 lg:pb-16 lg:pt-20">
          <div aria-hidden="true" className="editorial-grid pointer-events-none absolute inset-0 z-0" />
          <div className="relative z-10">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--sage-dark)]">
              The outfit edit
            </p>
            <h1 className="mt-5 max-w-4xl font-serif text-[clamp(3.5rem,9vw,8.5rem)] font-medium leading-[0.84] tracking-[-0.065em]">
              Fit your moment.
            </h1>
          </div>
          <div className="relative z-10 max-w-2xl self-end lg:pb-2">
            <p className="font-serif text-2xl leading-tight tracking-[-0.025em] sm:text-3xl">
              Up to three complete looks, coordinated around the details that matter.
            </p>
            <p className="mt-5 max-w-xl text-[var(--muted-ink)]">
              Set your occasion, sizes, colours, style, and total budget. Fitora
              will rank in-stock pieces from one curated merchant and
              return up to three verified combinations in USD.
            </p>
          </div>
        </section>

        <BuildExperience />
      </main>

      <footer className="border-t border-[var(--line)] px-5 py-8 text-sm text-[var(--muted-ink)] sm:px-8 lg:px-12">
        <div className="mx-auto flex w-full max-w-[90rem] flex-col justify-between gap-2 sm:flex-row">
          <p>Curated products · Checked availability · Fitora merchant</p>
          <p>No account or personal profile required.</p>
        </div>
      </footer>
    </div>
  );
}
