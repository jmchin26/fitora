import Image from "next/image";
import { useState } from "react";

import type {
  Outfit,
  ScoreBreakdown,
  SelectedProduct,
} from "@/lib/catalogue/schemas";
import { formatUsd } from "@/lib/money";

type OutfitCardProps = {
  index: number;
  outfit: Outfit;
  budgetCents: number;
  selected: boolean;
  disabled?: boolean;
  onSelect: (outfit: Outfit) => void;
};

const SCORE_COMPONENTS: ReadonlyArray<{
  key: keyof ScoreBreakdown;
  label: string;
  maximum: number;
}> = [
  { key: "occasion", label: "Occasion", maximum: 30 },
  { key: "style", label: "Style", maximum: 25 },
  { key: "colorCompatibility", label: "Colour harmony", maximum: 20 },
  { key: "preferredColors", label: "Preferred colours", maximum: 15 },
  { key: "budgetEfficiency", label: "Budget efficiency", maximum: 10 },
];

function ProductImage({ item }: { item: SelectedProduct }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-[#e8e1d5]">
      {failed ? (
        <div
          aria-label={item.product.altText}
          className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-[var(--muted-ink)]"
          role="img"
        >
          Product image unavailable
        </div>
      ) : (
        <Image
          alt={item.product.altText}
          className="object-contain p-3"
          fill
          onError={() => setFailed(true)}
          sizes="(max-width: 639px) 30vw, (max-width: 1279px) 18vw, 11vw"
          src={item.product.imagePath}
          unoptimized
        />
      )}
    </div>
  );
}

function ProductDetails({
  item,
  label,
}: {
  item: SelectedProduct;
  label: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t border-[var(--line)] py-3.5 first:border-t-0">
      <div className="min-w-0">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--muted-ink)]">
          {label}
        </p>
        <h4 className="mt-0.5 font-semibold leading-snug">
          {item.product.name}
        </h4>
        <p className="mt-1 text-xs text-[var(--sage-dark)]">
          In stock · Size {item.selectedSize}
        </p>
      </div>
      <p className="font-semibold tabular-nums">
        {formatUsd(item.product.priceCents)}
      </p>
    </div>
  );
}

export function OutfitCard({
  index,
  outfit,
  budgetCents,
  selected,
  disabled = false,
  onSelect,
}: OutfitCardProps) {
  const cardId = `outfit-option-${index + 1}`;
  const titleId = `${cardId}-title`;
  const explanationId = `${cardId}-explanation`;
  const totalId = `${cardId}-total`;
  const budgetRemainingCents = Math.max(0, budgetCents - outfit.totalCents);

  return (
    <article
      aria-labelledby={titleId}
      className={`flex h-full flex-col border bg-[var(--surface)] transition-colors ${
        selected
          ? "border-[var(--sage-dark)] ring-2 ring-[var(--sage-dark)] ring-offset-2 ring-offset-[var(--canvas)]"
          : "border-[var(--line)]"
      }`}
    >
      <div className="grid grid-cols-3 gap-px bg-[var(--line)]">
        <ProductImage item={outfit.top} />
        <ProductImage item={outfit.bottom} />
        <ProductImage item={outfit.shoes} />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex min-h-11 items-center justify-between gap-4">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--sage-dark)]">
              Look {String(index + 1).padStart(2, "0")}
            </p>
            <h3
              className="mt-1 font-serif text-2xl tracking-[-0.03em]"
              id={titleId}
            >
              Verified outfit {String(index + 1).padStart(2, "0")}
            </h3>
          </div>
          <label
            className={`flex min-h-11 items-center gap-2 text-sm font-semibold ${
              disabled ? "cursor-not-allowed" : "cursor-pointer"
            }`}
            htmlFor={cardId}
          >
            <span>Select</span>
            <input
              aria-describedby={`${explanationId} ${totalId}`}
              checked={selected}
              className="h-5 w-5 shrink-0 accent-[var(--sage-dark)]"
              disabled={disabled}
              id={cardId}
              name="selectedOutfit"
              onChange={() => onSelect(outfit)}
              type="radio"
              value={outfit.id}
            />
            <span className="sr-only">
              verified outfit {String(index + 1).padStart(2, "0")}
            </span>
          </label>
        </div>

        <div className="mt-5">
          <ProductDetails item={outfit.top} label="Top" />
          <ProductDetails item={outfit.bottom} label="Bottom" />
          <ProductDetails item={outfit.shoes} label="Shoes" />
        </div>

        <div className="mt-auto border-t-2 border-[var(--ink)] pt-4">
          <div className="flex items-end justify-between gap-4" id={totalId}>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted-ink)]">
                Verified total
              </p>
              <p className="mt-1 text-sm text-[var(--muted-ink)]">
                {formatUsd(budgetRemainingCents)} left in budget
              </p>
            </div>
            <p className="font-serif text-3xl tracking-[-0.04em] tabular-nums">
              {formatUsd(outfit.totalCents)}
            </p>
          </div>
        </div>

        <div className="mt-5 border-l-2 border-[var(--sage)] pl-4">
          <p
            className="text-sm leading-relaxed text-[var(--muted-ink)]"
            id={explanationId}
          >
            {outfit.explanation}
          </p>
        </div>

        <details className="group mt-5 border-t border-[var(--line)] pt-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
            <span>Why it ranks · {outfit.score}/100</span>
            <span
              aria-hidden="true"
              className="text-lg font-normal transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <dl className="space-y-2 pb-1 pt-3">
            {SCORE_COMPONENTS.map((component) => (
              <div
                className="flex items-center justify-between gap-4 text-sm"
                key={component.key}
              >
                <dt className="text-[var(--muted-ink)]">{component.label}</dt>
                <dd className="font-semibold tabular-nums">
                  {outfit.scoreBreakdown[component.key]} / {component.maximum}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </article>
  );
}
