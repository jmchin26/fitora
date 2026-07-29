import { LineIcon } from "@/components/ui/line-icon";

const steps = [
  { icon: "clipboard" as const, title: "1. Describe", detail: "Tell us the occasion, size and budget. We will handle the styling." },
  { icon: "hanger" as const, title: "2. Review", detail: "Receive up to three coordinated outfits made from verified catalogue items." },
  { icon: "shield" as const, title: "3. Approve", detail: "Approve your favourite outfit and check out securely. Simple and transparent." },
];

export function ProcessSteps() {
  return (
    <section aria-labelledby="process-title" className="border-t border-[var(--line)] bg-[var(--surface)]" id="how-it-works">
      <div className="mx-auto grid w-full max-w-[96rem] grid-cols-[0.68fr_2.32fr] px-6 py-9 lg:px-12">
        <div className="border-r border-[var(--line)] pr-9">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[var(--sage-dark)]">How Fitora works</p>
          <h2 className="mt-3 max-w-[16ch] font-serif text-3xl leading-[1.05] tracking-[-0.04em]" id="process-title">
            Shopping, with a clearer next step.
          </h2>
          <p className="mt-3 max-w-xs text-sm leading-6 text-[var(--muted-ink)]">
            Verified catalogue items. Real outfit logic. You stay in control from start to finish.
          </p>
        </div>

        <ol className="grid grid-cols-3">
          {steps.map((step) => (
            <li className="grid grid-cols-[3.25rem_1fr] gap-4 border-r border-[var(--line)] px-7 last:border-r-0" key={step.title}>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--sage-dark)]">
                <LineIcon className="h-6 w-6" name={step.icon} />
              </span>
              <div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
