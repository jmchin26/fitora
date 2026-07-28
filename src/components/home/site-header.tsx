import Link from "next/link";

import { brand } from "@/lib/brand";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[color:rgba(243,239,231,0.92)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[88rem] flex-wrap items-center gap-x-7 gap-y-4 px-5 py-4 sm:flex-nowrap sm:px-8 lg:px-12">
      <Link
        aria-label="Fitora home"
        className="inline-flex min-h-11 items-center font-['Iowan_Old_Style','Palatino_Linotype',Georgia,serif] text-[1.7rem] font-semibold tracking-[-0.045em] no-underline"
        href="/"
      >
        {brand.name}
      </Link>

      <nav
        aria-label="Primary navigation"
        className="ml-auto flex items-center gap-5"
      >
        <a
          className="hidden min-h-11 items-center text-sm font-semibold underline-offset-4 hover:underline sm:inline-flex"
          href="#how-it-works"
        >
          How it works
        </a>
        <Link
          className="inline-flex min-h-11 items-center justify-center border border-[var(--sage-dark)] bg-[var(--sage-dark)] px-5 text-sm font-bold text-white no-underline transition-[background-color,color,transform] duration-200 hover:-translate-y-0.5 hover:bg-[var(--ink)]"
          href="/build"
        >
          Start styling
        </Link>
      </nav>

      </div>
    </header>
  );
}
