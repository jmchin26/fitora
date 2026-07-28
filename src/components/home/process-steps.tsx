const steps = [
  {
    title: "Tell us the moment",
    detail: "Occasion, budget, sizes, colours, and the mood you want.",
  },
  {
    title: "Review complete looks",
    detail: "Up to three coordinated options, each validated against the catalogue.",
  },
  {
    title: "Approve and pay",
    detail: "A clear order summary first, then a separate sandbox checkout.",
  },
] as const;

export function ProcessSteps() {
  return (
    <section
      aria-labelledby="process-title"
      className="border-y border-[var(--line)] bg-[var(--surface)]"
      id="how-it-works"
    >
      <div className="mx-auto w-full max-w-[88rem] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
        <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted-ink)]">
              How Fitora works
            </p>
            <h2
              className="mt-4 max-w-[10ch] font-['Iowan_Old_Style','Palatino_Linotype',Georgia,serif] text-4xl leading-[1.02] tracking-[-0.045em] sm:text-5xl"
              id="process-title"
            >
              From brief to complete look.
            </h2>
          </div>

          <ol className="mt-4 grid border-t border-[var(--line)] sm:grid-cols-3 lg:mt-0">
            {steps.map((step, index) => (
              <li
                className="group border-b border-[var(--line)] py-7 sm:border-r sm:px-7 sm:last:border-r-0 lg:py-3 lg:pb-8"
                key={step.title}
              >
                <span className="font-['Iowan_Old_Style','Palatino_Linotype',Georgia,serif] text-2xl text-[var(--sage)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-12 text-lg font-bold leading-6 transition-transform duration-200 group-hover:translate-x-1">
                  {step.title}
                </h3>
                <p className="mt-3 max-w-[28rem] leading-7 text-[var(--muted-ink)]">
                  {step.detail}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
