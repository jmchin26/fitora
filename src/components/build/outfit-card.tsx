import Image from "next/image";
import { useState } from "react";

import { LineIcon } from "@/components/ui/line-icon";
import type { Outfit, SelectedProduct } from "@/lib/catalogue/schemas";
import { formatUsd } from "@/lib/money";

type OutfitCardProps = {
  index: number;
  outfit: Outfit;
  budgetCents: number;
  selected: boolean;
  disabled?: boolean;
  onSelect: (outfit: Outfit) => void;
};

function ProductImage({ item, featured = false }: { item: SelectedProduct; featured?: boolean }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`relative overflow-hidden bg-[#eeeae2] ${featured ? "h-full min-h-[22rem]" : "min-h-0"}`}>
      {failed ? (
        <div aria-label={item.product.altText} className="flex h-full items-center justify-center px-3 text-center text-xs font-semibold text-[var(--muted-ink)]" role="img">
          Product image unavailable
        </div>
      ) : (
        <Image
          alt={item.product.altText}
          className="object-contain p-4"
          fill
          onError={() => setFailed(true)}
          sizes={featured ? "(max-width: 1279px) 42vw, 25vw" : "(max-width: 1279px) 20vw, 10vw"}
          src={item.product.imagePath}
          unoptimized
        />
      )}
    </div>
  );
}

function ProductDetails({ item }: { item: SelectedProduct }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-5 border-t border-[var(--line)] py-2 first:border-t-0">
      <div className="min-w-0">
        <h4 className="font-semibold leading-snug">{item.product.name}</h4>
        <p className="mt-0.5 text-xs text-[var(--muted-ink)]">In stock · Size {item.selectedSize}</p>
      </div>
      <p className="font-semibold tabular-nums">{formatUsd(item.product.priceCents)}</p>
    </div>
  );
}

export function OutfitCard({ index, outfit, budgetCents, selected, disabled = false, onSelect }: OutfitCardProps) {
  const cardId = `outfit-option-${index + 1}`;
  const titleId = `${cardId}-title`;
  const explanationId = `${cardId}-explanation`;
  const totalId = `${cardId}-total`;
  const budgetRemainingCents = Math.max(0, budgetCents - outfit.totalCents);

  return (
    <article
      aria-labelledby={titleId}
      className={`overflow-hidden rounded-md border bg-[var(--surface-strong)] transition-[border-color,box-shadow] duration-200 ${
        selected ? "border-[var(--sage-dark)] shadow-[var(--shadow-lifted)] ring-1 ring-[var(--sage-dark)]" : "border-[var(--line)] hover:border-[var(--sage)] hover:shadow-[var(--shadow-soft)]"
      }`}
    >
      <div className="grid xl:grid-cols-[0.92fr_1.08fr]">
        <div className="grid min-h-[22rem] grid-cols-[1fr_0.34fr] gap-2 border-b border-[var(--line)] bg-[#e8e3da] p-2 xl:border-b-0 xl:border-r">
          <ProductImage featured item={outfit.top} />
          <div className="grid grid-rows-2 gap-2">
            <ProductImage item={outfit.bottom} />
            <ProductImage item={outfit.shoes} />
          </div>
        </div>

        <div className="flex min-w-0 flex-col p-5">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-[var(--sage-dark)]">Complete outfit</p>
              <h3 className="mt-2 font-serif text-3xl tracking-[-0.035em]" id={titleId}>Look {String(index + 1).padStart(2, "0")}</h3>
            </div>
          </div>

          <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--muted-ink)]" id={explanationId}>{outfit.explanation}</p>
          <div className="mt-2"><ProductDetails item={outfit.top} /><ProductDetails item={outfit.bottom} /><ProductDetails item={outfit.shoes} /></div>

          <div className="mt-auto flex items-end justify-between gap-5 border-y border-[var(--line)] py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted-ink)]">Outfit total</p>
              <p className="mt-1 font-serif text-2xl font-semibold tabular-nums">{formatUsd(outfit.totalCents)}</p>
            </div>
            <p className="text-right text-xs leading-5 text-[var(--muted-ink)]">
              In stock<br />{formatUsd(budgetRemainingCents)} under budget
            </p>
          </div>

          <div className="mt-4 flex items-center justify-end" id={totalId}>
            <label className={`inline-flex min-h-11 items-center gap-3 bg-[var(--sage-dark)] px-5 font-bold text-white ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-[var(--ink)]"}`} htmlFor={cardId}>
              <span>{selected ? "Selected" : "Select look"}</span>
              <input aria-describedby={`${explanationId} ${totalId}`} aria-label={`Select outfit ${String(index + 1).padStart(2, "0")}`} checked={selected} className="sr-only" disabled={disabled} id={cardId} name="selectedOutfit" onChange={() => onSelect(outfit)} type="radio" value={outfit.id} />
              <LineIcon className="h-4 w-4" name="arrow" />
            </label>
          </div>
        </div>
      </div>
    </article>
  );
}
