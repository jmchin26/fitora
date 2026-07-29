import type { Metadata } from "next";
import Link from "next/link";

import { BuildExperience } from "@/components/build/build-experience";
import { LineIcon } from "@/components/ui/line-icon";

export const metadata: Metadata = {
  title: "Build an outfit",
  description:
    "Set your occasion, sizes, colours, style, and budget to build up to three catalogue-verified outfits.",
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
              Set your occasion, sizes, colours, style, and total budget. Fitora
              will rank in-stock pieces from one curated merchant and
              return up to three verified combinations in USD.
            </p>
          </div>
        </section>

        <BuildExperience />
      </main>

      <footer className="border-t border-[var(--line)] bg-[var(--surface)] px-6 py-7 text-sm text-[var(--ink)] lg:px-12">
        <div className="mx-auto grid w-full max-w-[96rem] grid-cols-3">
          <p className="flex items-center justify-center gap-3 border-r border-[var(--line)]"><LineIcon className="h-6 w-6" name="package" /> Curated products from one merchant</p>
          <p className="flex items-center justify-center gap-3 border-r border-[var(--line)]"><LineIcon className="h-6 w-6" name="shield" /> Checked availability and prices</p>
          <p className="flex items-center justify-center gap-3"><LineIcon className="h-6 w-6" name="heart" /> No account or personal profile required</p>
        </div>
      </footer>
    </div>
  );
}
