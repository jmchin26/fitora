import Link from "next/link";

export default function BuildPage() {
  return (
    <main id="main-content" className="baseline-shell">
      <div className="baseline-kicker">Fitora · Build</div>
      <h1>Fit your moment.</h1>
      <p className="baseline-copy">
        The verified preference and outfit experience is being assembled in the
        next implementation phase.
      </p>
      <Link className="baseline-action" href="/">
        Return home
      </Link>
    </main>
  );
}

