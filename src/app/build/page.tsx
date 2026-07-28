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
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[color:rgba(243,239,231,0.92)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12">
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
        <section className="relative mx-auto grid w-full max-w-[96rem] gap-8 overflow-hidden px-6 py-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:gap-16 lg:px-12 lg:py-5">
          <div aria-hidden="true" className="editorial-grid pointer-events-none absolute inset-0 z-0" />
          <div className="relative z-10">
            <h1 className="max-w-4xl font-serif text-[clamp(3.5rem,6vw,6.5rem)] font-medium leading-[0.82] tracking-[-0.065em]">
              Fit your moment.
            </h1>
          </div>
          <div className="relative z-10 max-w-2xl self-end lg:pb-2">
            <p className="max-w-xl text-lg leading-8 text-[var(--ink)]">
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
