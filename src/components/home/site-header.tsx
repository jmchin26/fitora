import Link from "next/link";

import { brand } from "@/lib/brand";

import { ModeBadges } from "./mode-badges";

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-[88rem] flex-wrap items-center gap-x-6 gap-y-4 border-b border-[var(--line)] px-5 py-5 sm:flex-nowrap sm:px-8 lg:px-12">
      <Link
        aria-label="Fitora home"
        className="inline-flex min-h-11 items-center font-['Iowan_Old_Style','Palatino_Linotype',Georgia,serif] text-2xl font-semibold tracking-[-0.04em] no-underline"
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
      </nav>

      <div className="w-full border-t border-[var(--line)] pt-3 sm:w-auto sm:border-0 sm:pt-0">
        <ModeBadges />
      </div>
    </header>
  );
}
