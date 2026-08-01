import Image from "next/image";
import Link from "next/link";

const steps = [
  { title: "For the interview", detail: "Quiet confidence in considered layers.", image: "/products/top-01.svg" },
  { title: "For the presentation", detail: "Polished pieces with an easy point of view.", image: "/products/top-02.svg" },
  { title: "For the weekend", detail: "Relaxed proportions, finished with intention.", image: "/products/top-09.svg" },
];

export function ProcessSteps() {
  return (
    <section aria-labelledby="process-title" className="border-t border-[var(--line)] bg-[var(--surface)]" id="shop-the-moment">
      <div className="mx-auto w-full max-w-[96rem] px-6 py-14 lg:px-12 lg:py-20">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[var(--sage-dark)]">Shop the moment</p>
        <h2 className="mt-3 font-serif text-4xl tracking-[-0.045em]" id="process-title">
          Where are you headed?
        </h2>

        <ol className="mt-9 grid gap-px bg-[var(--line)] lg:grid-cols-3">
          {steps.map((step) => (
            <li className="bg-[var(--surface)]" key={step.title}>
              <Link className="group block" href="/build">
                <div className="relative aspect-[4/3] overflow-hidden bg-[#ece7de]">
                  <Image alt="" className="object-contain p-8 transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" fill sizes="(max-width: 1023px) 100vw, 33vw" src={step.image} unoptimized />
                </div>
                <div className="flex items-end justify-between gap-6 p-6">
                  <div>
                    <h3 className="font-serif text-2xl">{step.title}</h3>
                    <p className="mt-1 text-sm text-[var(--muted-ink)]">{step.detail}</p>
                  </div>
                  <span aria-hidden="true" className="text-xl transition-transform duration-200 group-hover:translate-x-1">→</span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
