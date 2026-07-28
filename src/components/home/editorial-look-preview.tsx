import Image from "next/image";

import { LineIcon } from "@/components/ui/line-icon";

const outfitItems = [
  { name: "Harbor Knit Polo", colour: "Navy", price: "$40", image: "/products/top-02.svg" },
  { name: "Stone Straight Chinos", colour: "Stone", price: "$40", image: "/products/bottom-03.svg" },
  { name: "Minimal Court Sneakers", colour: "White", price: "$49", image: "/products/shoes-03.svg" },
] as const;

export function EditorialLookPreview() {
  return (
    <figure
      aria-label="A sample catalogue-verified Fitora outfit"
      className="relative z-10 grid min-h-[28rem] overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface-strong)] shadow-[var(--shadow-lifted)] lg:grid-cols-[1.15fr_0.85fr]"
    >
      <div className="relative overflow-hidden border-b border-[var(--line)] bg-[#f0ece4] lg:border-b-0 lg:border-r">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.9),transparent_60%)]" />
        <div className="absolute left-[7%] top-[4%] h-[56%] w-[58%] -rotate-3 drop-shadow-[0_18px_20px_rgba(32,35,30,0.12)]">
          <Image alt="Navy Harbor Knit Polo" className="object-contain" fill priority sizes="30vw" src="/products/top-02.svg" unoptimized />
        </div>
        <div className="absolute bottom-[4%] right-[4%] h-[60%] w-[56%] rotate-3 drop-shadow-[0_18px_20px_rgba(32,35,30,0.10)]">
          <Image alt="Stone Straight Chinos" className="object-contain" fill priority sizes="28vw" src="/products/bottom-03.svg" unoptimized />
        </div>
        <div className="absolute bottom-[1%] left-[8%] h-[34%] w-[42%] -rotate-6 drop-shadow-[0_15px_16px_rgba(32,35,30,0.12)]">
          <Image alt="White Minimal Court Sneakers" className="object-contain" fill priority sizes="22vw" src="/products/shoes-03.svg" unoptimized />
        </div>
      </div>

      <figcaption className="flex flex-col p-6 lg:p-7">
        <p className="w-fit rounded-full bg-[#e7eadf] px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[var(--sage-dark)]">
          Outfit 1 of 3
        </p>
        <h2 className="mt-4 font-serif text-3xl leading-[1.05] tracking-[-0.035em]">
          Smart casual
          <br />
          weekend
        </h2>

        <dl className="mt-5 space-y-3 border-b border-[var(--line)] pb-5 text-xs">
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2"><LineIcon className="h-4 w-4" name="tag" /> Budget</dt>
            <dd className="text-[var(--muted-ink)]">Up to $150</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2"><LineIcon className="h-4 w-4" name="hanger" /> Sizes</dt>
            <dd className="text-[var(--muted-ink)]">M / 42</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-2"><LineIcon className="h-4 w-4" name="shield" /> Verified</dt>
            <dd className="text-[var(--muted-ink)]">All items checked</dd>
          </div>
        </dl>

        <ol className="divide-y divide-[var(--line)]">
          {outfitItems.map((item) => (
            <li className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 py-3 text-xs" key={item.name}>
              <span className="relative h-10 w-10 overflow-hidden bg-[#f0ece4]">
                <Image alt="" className="object-contain p-1" fill sizes="40px" src={item.image} unoptimized />
              </span>
              <span>
                <strong className="block font-semibold">{item.name}</strong>
                <span className="text-[var(--muted-ink)]">{item.colour}</span>
              </span>
              <span className="tabular-nums">{item.price}</span>
            </li>
          ))}
        </ol>

        <dl className="mt-auto flex items-center justify-between border-t border-[var(--line)] pt-4">
          <dt className="font-semibold">Total</dt>
          <dd className="font-serif text-2xl font-semibold tabular-nums">$129</dd>
        </dl>
      </figcaption>
    </figure>
  );
}
