import Link from "next/link";

import { EditorialLookPreview } from "@/components/home/editorial-look-preview";
import { ProcessSteps } from "@/components/home/process-steps";
import { SiteHeader } from "@/components/home/site-header";
import { LineIcon } from "@/components/ui/line-icon";

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
            <p className="text-[0.66rem] font-bold uppercase tracking-[0.18em] text-[var(--sage-dark)]">
              The Fitora edit
            </p>

            <h1
              id="hero-title"
              className="mt-4 max-w-[16ch] font-serif text-[clamp(3rem,4.5vw,4.7rem)] font-medium leading-[0.92] tracking-[-0.055em]"
            >
              A complete look,
              <br />
              {" "}put together for you.
            </h1>

            <p className="mt-6 max-w-[35rem] text-base leading-7 text-[var(--muted-ink)]">
              Choose the moment, tell us what fits, and discover three
              coordinated outfits within your budget.
            </p>

            <div className="mt-7 flex flex-col items-start gap-4">
              <Link
                className="group inline-flex min-h-13 items-center justify-center gap-4 bg-[var(--ink)] px-7 py-3 font-bold text-white no-underline transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-[var(--sage-dark)]"
                href="/build"
              >
                Style my look
                <LineIcon className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" name="arrow" />
              </Link>

              <p className="font-serif text-lg italic text-[var(--muted-ink)]">
                Interview · Presentation · Off-duty
              </p>
            </div>
          </div>

          <EditorialLookPreview />
        </section>

        <ProcessSteps />
      </main>
    </div>
  );
}
