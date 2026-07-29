import Link from "next/link";

import { brand } from "@/lib/brand";
import { LineIcon } from "@/components/ui/line-icon";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[color:rgba(255,255,255,0.94)] backdrop-blur-xl">
      <div className="mx-auto grid w-full max-w-[96rem] grid-cols-[1fr_auto_1fr] items-center gap-6 px-6 py-3 lg:px-12">
        <Link
          aria-label="Fitora home"
          className="inline-flex min-h-10 items-center font-serif text-[1.7rem] font-semibold tracking-[-0.045em] no-underline"
          href="/"
        >
          {brand.name}
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-8 lg:flex">
          <a className="inline-flex min-h-10 items-center border-b-2 border-transparent text-sm font-semibold transition-colors hover:border-[var(--ink)]" href="#how-it-works">
            How it works
          </a>
          <Link className="inline-flex min-h-10 items-center border-b-2 border-transparent text-sm font-semibold transition-colors hover:border-[var(--ink)]" href="/build">
            Build outfits
          </Link>
        </nav>

        <div className="ml-auto hidden items-center gap-4 text-xs font-medium text-[var(--muted-ink)] md:flex">
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
          className="ml-auto inline-flex min-h-10 items-center justify-center bg-[var(--ink)] px-4 text-sm font-bold text-white no-underline transition-colors hover:bg-[var(--sage-dark)] lg:hidden"
          href="/build"
        >
          Build outfits
        </Link>
      </div>
    </header>
  );
}
