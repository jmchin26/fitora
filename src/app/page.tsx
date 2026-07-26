import Link from "next/link";

import { brand } from "@/lib/brand";

export default function Home() {
  return (
    <main id="main-content" className="baseline-shell">
      <div className="baseline-kicker">AI styling, verified by code</div>
      <h1>{brand.name}</h1>
      <p className="baseline-tagline">{brand.tagline}</p>
      <p className="baseline-copy">
        Tell us the occasion, budget, sizes, colours, and mood. Fitora will
        assemble complete looks from a fixed local catalogue and keep every
        recommendation within your verified constraints.
      </p>
      <Link className="baseline-action" href="/build">
        Build my outfit
      </Link>
      <p className="baseline-status" role="status">
        Development baseline · Rules fallback · Mock payment mode
      </p>
    </main>
  );
}

