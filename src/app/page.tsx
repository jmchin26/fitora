import Link from "next/link";

import { EditorialLookPreview } from "@/components/home/editorial-look-preview";
import { ProcessSteps } from "@/components/home/process-steps";
import { SiteHeader } from "@/components/home/site-header";
import { LineIcon } from "@/components/ui/line-icon";

const journey = [
  ["clipboard", "Describe", "Occasion, sizes and budget"],
  ["hanger", "Compare", "Up to three complete looks"],
  ["shield", "Approve", "Your choice before checkout"],
] as const;

export default function Home() {
  return (
    <div className="min-h-dvh overflow-hidden bg-[var(--canvas)] text-[var(--ink)]">
      <SiteHeader />

      <main id="main-content" tabIndex={-1}>
        <section
          aria-labelledby="hero-title"
          className="mx-auto grid w-full max-w-[96rem] items-center gap-10 px-6 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:px-12 lg:py-12"
        >
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-[0.66rem] font-bold uppercase tracking-[0.15em] text-[var(--sage-dark)]">
              <LineIcon className="h-4 w-4" name="shield" />
              Personal styling, grounded in the catalogue
            </p>

            <h1
              id="hero-title"
              className="mt-4 max-w-[16ch] font-serif text-[clamp(3rem,4.5vw,4.7rem)] font-medium leading-[0.92] tracking-[-0.055em]"
            >
              Find your next
              <br />
              {" "}complete outfit.
            </h1>

            <p className="mt-6 max-w-[35rem] text-base leading-7 text-[var(--muted-ink)]">
              Set your occasion, size and budget. We return up to three coordinated looks built from available pieces, with the full price visible before you choose.
            </p>

            <div className="mt-7 flex flex-col items-start gap-4">
              <Link
                className="group inline-flex min-h-13 items-center justify-center gap-4 bg-[var(--ink)] px-7 py-3 font-bold text-white no-underline transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-[var(--sage-dark)]"
                href="/build"
              >
                Build my outfits
                <LineIcon className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" name="arrow" />
              </Link>

              <p className="flex items-center gap-2 text-xs text-[var(--muted-ink)]">
                <LineIcon className="h-4 w-4 text-[var(--sage-dark)]" name="shield" />
                No account required <span aria-hidden="true">·</span> You approve before checkout
              </p>
            </div>

            <ol className="mt-8 grid max-w-[38rem] grid-cols-3 border-y border-[var(--line)]">
              {journey.map(([icon, title, detail]) => (
                <li className="border-r border-[var(--line)] px-3 py-4 text-left last:border-r-0" key={title}>
                  <LineIcon className="h-4 w-4 text-[var(--sage-dark)]" name={icon} />
                  <strong className="mt-3 block text-xs">{title}</strong>
                  <span className="mt-1 block text-[0.68rem] leading-4 text-[var(--muted-ink)]">{detail}</span>
                </li>
              ))}
            </ol>
          </div>

          <EditorialLookPreview />
        </section>

        <ProcessSteps />
      </main>
    </div>
  );
}
