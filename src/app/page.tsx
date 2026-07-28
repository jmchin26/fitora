import Link from "next/link";

import { EditorialLookPreview } from "@/components/home/editorial-look-preview";
import { ModeBadges } from "@/components/home/mode-badges";
import { ProcessSteps } from "@/components/home/process-steps";
import { SiteHeader } from "@/components/home/site-header";
import { brand } from "@/lib/brand";

export default function Home() {
  return (
    <div className="min-h-dvh overflow-hidden bg-[var(--canvas)] text-[var(--ink)]">
      <SiteHeader />

      <main id="main-content" tabIndex={-1}>
        <section
          aria-labelledby="hero-title"
          className="relative mx-auto grid min-h-[calc(100vh-77px)] w-full max-w-[96rem] items-center gap-12 overflow-hidden px-5 pb-20 pt-10 sm:px-8 sm:pt-16 lg:grid-cols-[minmax(0,0.88fr)_minmax(34rem,1.12fr)] lg:gap-20 lg:px-16 lg:pb-24 lg:pt-16"
        >
          <div aria-hidden="true" className="editorial-grid pointer-events-none absolute inset-0 z-0 opacity-70" />
          <div className="relative z-10 max-w-2xl">
            <p className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted-ink)]">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-[var(--sage)]"
              />
              AI styling, verified by code
            </p>

            <h1
              id="hero-title"
              className="mt-7 max-w-[11ch] font-['Iowan_Old_Style','Palatino_Linotype',Georgia,serif] text-[clamp(3.8rem,10vw,7.9rem)] font-medium leading-[0.88] tracking-[-0.065em]"
            >
              {brand.tagline}
            </h1>

            <p className="mt-8 max-w-[37rem] text-lg leading-8 text-[var(--muted-ink)] sm:text-xl sm:leading-9">
              Share the occasion, budget, sizes, colours, and mood, then get
              up to three complete outfits checked against a fixed local catalogue
              before you approve anything.
            </p>

            <div className="mt-10 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <Link
                className="group inline-flex min-h-14 items-center justify-center gap-4 border border-[var(--sage-dark)] bg-[var(--sage-dark)] px-7 py-3 font-bold text-white no-underline shadow-[0_12px_30px_rgba(70,81,65,0.18)] transition-[background-color,color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-[var(--ink)] hover:shadow-[0_16px_36px_rgba(32,35,30,0.22)]"
                href="/build"
              >
                Build my outfit
                <svg
                  aria-hidden="true"
                  className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M5 12h14m-5-5 5 5-5 5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </Link>

              <p className="text-sm leading-6 text-[var(--muted-ink)]">
                No account needed
                <span aria-hidden="true" className="mx-2 text-[var(--line)]">
                  /
                </span>
                30-piece curated catalogue
              </p>
            </div>

            <ul className="mt-10 grid max-w-[39rem] grid-cols-3 border-y border-[var(--line)] py-4 text-sm text-[var(--muted-ink)]">
              {["Catalogue checked", "Budget locked", "You approve payment"].map((item) => (
                <li className="flex items-center gap-2 border-r border-[var(--line)] px-3 first:pl-0 last:border-r-0" key={item}>
                  <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--sage-dark)]" fill="none" viewBox="0 0 20 20">
                    <path d="m4 10 3.5 3.5L16 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <EditorialLookPreview />
        </section>

        <ProcessSteps />
      </main>

      <footer className="mx-auto flex w-full max-w-[88rem] flex-col gap-5 border-t border-[var(--line)] px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <p className="font-['Iowan_Old_Style','Palatino_Linotype',Georgia,serif] text-xl tracking-[-0.03em]">
          Fitora
        </p>
        <ModeBadges compact />
      </footer>
    </div>
  );
}
