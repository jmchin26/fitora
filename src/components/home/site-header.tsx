import Link from "next/link";

import { brand } from "@/lib/brand";
import { LineIcon } from "@/components/ui/line-icon";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[color:rgba(250,248,243,0.94)] backdrop-blur-xl">
      <div className="mx-auto grid w-full max-w-[96rem] grid-cols-[1fr_auto_1fr] items-center gap-8 px-6 py-4 lg:px-12">
        <Link
          aria-label="Fitora home"
          className="inline-flex min-h-11 items-center font-serif text-[1.8rem] font-semibold tracking-[-0.045em] no-underline"
          href="/"
        >
          {brand.name}
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-10 lg:flex">
          <a className="inline-flex min-h-11 items-center text-sm font-semibold underline-offset-4 hover:underline" href="#how-it-works">
            How it works
          </a>
          <Link className="inline-flex min-h-11 items-center text-sm font-semibold underline-offset-4 hover:underline" href="/build">
            Build outfits
          </Link>
        </nav>

        <div className="ml-auto hidden items-center gap-5 text-xs font-medium text-[var(--muted-ink)] md:flex">
          <span className="inline-flex items-center gap-2">
            <LineIcon className="h-4 w-4 text-[var(--sage-dark)]" name="shield" />
            Catalogue verified
          </span>
          <span aria-hidden="true" className="h-5 w-px bg-[var(--line)]" />
          <span className="inline-flex items-center gap-2">
            <LineIcon className="h-4 w-4 text-[var(--sage-dark)]" name="lock" />
            Secure checkout
          </span>
        </div>

        <Link
          className="ml-auto inline-flex min-h-11 items-center justify-center border border-[var(--sage-dark)] bg-[var(--sage-dark)] px-4 text-sm font-bold text-white no-underline lg:hidden"
          href="/build"
        >
          Build outfits
        </Link>
      </div>
    </header>
  );
}
