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
          className="relative mx-auto grid w-full max-w-[96rem] items-center gap-12 overflow-hidden px-6 py-10 lg:grid-cols-[0.86fr_1.14fr] lg:gap-16 lg:px-12 lg:py-8"
        >
          <div aria-hidden="true" className="editorial-grid pointer-events-none absolute inset-0 z-0 opacity-70" />
          <div className="relative z-10 max-w-2xl">
            <p className="flex items-center gap-2 text-[0.66rem] font-bold uppercase tracking-[0.15em] text-[var(--sage-dark)]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--sage-dark)] text-white"><LineIcon className="h-3 w-3" name="shield" /></span>
              Verified styles. Made for you.
            </p>

            <h1
              id="hero-title"
              className="mt-5 max-w-[18ch] font-serif text-[clamp(3.25rem,4.8vw,4.8rem)] font-medium leading-[0.9] tracking-[-0.055em]"
            >
              Complete outfits,{" "}
              <br />
              built around you.
            </h1>

            <p className="mt-6 max-w-[35rem] text-base leading-7 text-[var(--muted-ink)]">
              Share your occasion, size and budget. Get up to three coordinated, catalogue-verified outfits—ready to approve before checkout.
            </p>

            <div className="mt-7 flex flex-col items-start gap-4">
              <Link
                className="group inline-flex min-h-14 items-center justify-center gap-4 border border-[var(--sage-dark)] bg-[var(--sage-dark)] px-7 py-3 font-bold text-white no-underline shadow-[0_12px_30px_rgba(70,81,65,0.18)] transition-[background-color,color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-[var(--ink)] hover:shadow-[0_16px_36px_rgba(32,35,30,0.22)]"
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

            <ol className="mt-8 grid max-w-[38rem] grid-cols-3 gap-3">
              {[
                ["clipboard", "1. Describe", "Tell us the occasion, size and budget."],
                ["hanger", "2. Review", "See up to three verified outfits."],
                ["shield", "3. Approve", "Approve before secure checkout."],
              ].map(([icon, title, detail]) => (
                <li className="relative border-t border-[var(--line)] pt-5 text-center" key={title}>
                  <span className="mx-auto flex h-10 w-10 -translate-y-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--canvas)] text-[var(--sage-dark)]">
                    <LineIcon className="h-5 w-5" name={icon as "clipboard" | "hanger" | "shield"} />
                  </span>
                  <strong className="-mt-7 block text-xs">{title}</strong>
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
