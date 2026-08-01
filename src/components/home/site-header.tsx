import Link from "next/link";

import { brand } from "@/lib/brand";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[color:rgba(255,255,255,0.94)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[96rem] items-center gap-8 px-6 py-3 lg:px-12">
        <Link
          aria-label="Fitora home"
          className="inline-flex min-h-10 items-center font-serif text-[1.7rem] font-semibold tracking-[-0.045em] no-underline"
          href="/"
        >
          {brand.name}
        </Link>

        <nav aria-label="Primary navigation" className="ml-auto hidden items-center gap-8 lg:flex">
          <a className="inline-flex min-h-10 items-center border-b-2 border-transparent text-sm font-semibold transition-colors hover:border-[var(--ink)]" href="#shop-the-moment">
            Shop the moment
          </a>
          <Link className="inline-flex min-h-10 items-center border-b-2 border-transparent text-sm font-semibold transition-colors hover:border-[var(--ink)]" href="/build">
            Style a look
          </Link>
        </nav>

        <Link
          className="inline-flex min-h-10 items-center justify-center bg-[var(--ink)] px-5 text-sm font-bold text-white no-underline transition-colors hover:bg-[var(--sage-dark)]"
          href="/build"
        >
          Style a look
        </Link>
      </div>
    </header>
  );
}
