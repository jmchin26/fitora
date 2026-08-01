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
    <div className={`relative overflow-hidden bg-[#eeeae2] ${featured ? "h-full min-h-[14rem]" : "min-h-0"}`}>
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
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-[var(--line)] py-2.5 first:border-t-0">
      <div className="min-w-0">
        <h4 className="text-sm font-semibold leading-snug">{item.product.name}</h4>
        <p className="mt-1 text-xs text-[var(--muted-ink)]">Size {item.selectedSize} · In stock</p>
      </div>
      <p className="pt-0.5 text-sm font-semibold tabular-nums">{formatUsd(item.product.priceCents)}</p>
    </div>
  );
}

function conciseExplanation(explanation: string): string {
  const sentenceEnd = explanation.search(/[.!?](?:\s|$)/);

  return sentenceEnd === -1 ? explanation : explanation.slice(0, sentenceEnd + 1);
}

export function OutfitCard({ index, outfit, budgetCents, selected, disabled = false, onSelect }: OutfitCardProps) {
  const cardId = `outfit-option-${index + 1}`;
  const titleId = `${cardId}-title`;
  const explanationId = `${cardId}-explanation`;
  const totalId = `${cardId}-total`;
  const budgetRemainingCents = Math.max(0, budgetCents - outfit.totalCents);
  const summary = conciseExplanation(outfit.explanation);

  return (
    <article
      aria-labelledby={titleId}
      className={`overflow-hidden rounded-md border bg-[var(--surface-strong)] transition-[border-color,box-shadow] duration-200 ${
        selected ? "border-[var(--sage-dark)] shadow-[var(--shadow-lifted)] ring-1 ring-[var(--sage-dark)]" : "border-[var(--line)] hover:border-[var(--sage)] hover:shadow-[var(--shadow-soft)]"
      }`}
    >
      <div className="flex h-full flex-col">
        <div className="grid min-h-[14rem] grid-cols-[1fr_0.36fr] gap-1.5 border-b border-[var(--line)] bg-[#e8e3da] p-1.5">
          <ProductImage featured item={outfit.top} />
          <div className="grid grid-rows-2 gap-1.5">
            <ProductImage item={outfit.bottom} />
            <ProductImage item={outfit.shoes} />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-[var(--sage-dark)]">Complete outfit</p>
              <h3 className="mt-1 font-serif text-2xl tracking-[-0.035em]" id={titleId}>Look {String(index + 1).padStart(2, "0")}</h3>
            </div>
          </div>

          <p className="sr-only" id={explanationId}>{outfit.explanation}</p>
          <p aria-hidden="true" className="mt-3 min-h-10 text-sm leading-5 text-[var(--muted-ink)]">{summary}</p>
          <div className="mt-3"><ProductDetails item={outfit.top} /><ProductDetails item={outfit.bottom} /><ProductDetails item={outfit.shoes} /></div>

          <div className="-mx-5 mt-auto flex items-center justify-between gap-3 border-y border-[var(--line)] bg-[var(--surface)] px-5 py-3.5">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[var(--muted-ink)]">Outfit total</p>
              <p className="mt-1 font-serif text-2xl font-semibold tabular-nums" id={totalId}>{formatUsd(outfit.totalCents)}</p>
            </div>
            <div className="border border-[var(--line)] bg-[var(--surface-strong)] px-2.5 py-1.5 text-right">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[var(--muted-ink)]">Within budget</p>
              <p className="mt-0.5 text-xs font-semibold tabular-nums text-[var(--sage-dark)]">{formatUsd(budgetRemainingCents)} below</p>
            </div>
          </div>

          <div className="mt-4">
            <label className={`flex min-h-12 w-full items-center justify-between gap-3 px-4 font-bold text-white transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${selected ? "bg-[var(--ink)]" : "bg-[var(--sage-dark)]"} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-[var(--ink)]"}`} htmlFor={cardId}>
              <span>{selected ? "Selected look" : "Select look"}</span>
              <input aria-describedby={`${explanationId} ${totalId}`} aria-label={`Select outfit ${String(index + 1).padStart(2, "0")}`} checked={selected} className="sr-only" disabled={disabled} id={cardId} name="selectedOutfit" onChange={() => onSelect(outfit)} type="radio" value={outfit.id} />
              <LineIcon className="h-4 w-4" name={selected ? "check" : "arrow"} />
            </label>
          </div>
        </div>
      </div>
    </article>
  );
}
