"use client";

import Image from "next/image";
import { useState } from "react";

import { LineIcon } from "@/components/ui/line-icon";
import type { Outfit, SelectedProduct } from "@/lib/catalogue/schemas";
import { formatUsd } from "@/lib/money";

function PreviewImage({
  item,
  featured = false,
}: {
  item: SelectedProduct;
  featured?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`relative overflow-hidden bg-[#eeeae2] ${
        featured ? "h-full" : "min-h-0"
      }`}
    >
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
          sizes={featured ? "(max-width: 1023px) 64vw, 24vw" : "(max-width: 1023px) 28vw, 11vw"}
          src={item.product.imagePath}
          unoptimized
        />
      )}
    </div>
  );
}

function PreviewProduct({ item }: { item: SelectedProduct }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-[var(--line)] py-2.5 first:border-t-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug">
          {item.product.name}
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted-ink)]">
          Size {item.selectedSize} · In stock
        </p>
      </div>
      <p className="pt-0.5 text-sm font-semibold tabular-nums">
        {formatUsd(item.product.priceCents)}
      </p>
    </div>
  );
}

export function AgentLookPreview({
  index,
  outfit,
  updated,
}: {
  index: number;
  outfit: Outfit | null;
  updated: boolean;
}) {
  if (!outfit) {
    return (
      <aside className="border border-[var(--line)] bg-[var(--surface-strong)] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--sage-dark)]">
          Live preview
        </p>
        <p className="mt-3 font-serif text-2xl">No verified look to preview.</p>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
          Adjust your preferences and build outfit options again.
        </p>
      </aside>
    );
  }

  return (
    <aside
      aria-labelledby="agent-preview-title"
      className="overflow-hidden border border-[var(--line)] bg-[var(--surface-strong)] shadow-[var(--shadow-soft)] lg:sticky lg:top-24"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] p-4">
        <div>
          <p className="text-[0.66rem] font-bold uppercase tracking-[0.14em] text-[var(--sage-dark)]">
            Live preview
          </p>
          <h3
            className="mt-1 font-serif text-2xl tracking-[-0.035em]"
            id="agent-preview-title"
          >
            Look {String(index + 1).padStart(2, "0")}
          </h3>
        </div>
        <p className="flex min-h-8 items-center gap-1.5 border border-[var(--line)] bg-[var(--surface)] px-2.5 text-xs font-semibold text-[var(--sage-dark)]">
          <LineIcon className="h-3.5 w-3.5" name={updated ? "check" : "hanger"} />
          {updated ? "Updated" : "Current"}
        </p>
      </div>

      <div className="grid h-64 grid-cols-[1fr_0.38fr] gap-1.5 border-b border-[var(--line)] bg-[#e8e3da] p-1.5 sm:h-72 lg:h-64 xl:h-72">
        <PreviewImage featured item={outfit.top} />
        <div className="grid grid-rows-2 gap-1.5">
          <PreviewImage item={outfit.bottom} />
          <PreviewImage item={outfit.shoes} />
        </div>
      </div>

      <div className="px-4 py-2">
        <PreviewProduct item={outfit.top} />
        <PreviewProduct item={outfit.bottom} />
        <PreviewProduct item={outfit.shoes} />
      </div>

      <div className="border-t border-[var(--line)] bg-[var(--surface)] px-4 py-3.5">
        <div>
          <p className="text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-[var(--muted-ink)]">
            Outfit total
          </p>
          <p className="mt-1 font-serif text-2xl font-semibold tabular-nums">
            {formatUsd(outfit.totalCents)}
          </p>
        </div>
      </div>
    </aside>
  );
}
