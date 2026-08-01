import Image from "next/image";

import type {
  VerifiedOrder,
  VerifiedOrderItem,
} from "@/lib/checkout/order";
import { formatUsd } from "@/lib/money";

type OrderReviewProps = {
  order: VerifiedOrder;
};

const CATEGORY_LABELS: Record<VerifiedOrderItem["category"], string> = {
  top: "Top",
  bottom: "Bottom",
  shoes: "Shoes",
};

function OrderItem({ item }: { item: VerifiedOrderItem }) {
  return (
    <li className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 border-t border-[var(--line)] py-5 first:border-t-0 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="relative aspect-[4/5] overflow-hidden bg-[#e8e1d5]">
        <Image
          alt={`${item.name}, ${CATEGORY_LABELS[item.category].toLowerCase()}`}
          className="object-contain p-2"
          fill
          sizes="104px"
          src={item.imagePath}
          unoptimized
        />
      </div>

      <div className="min-w-0">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--sage-dark)]">
          {CATEGORY_LABELS[item.category]}
        </p>
        <h2 className="mt-1 font-serif text-xl leading-tight tracking-[-0.02em]">
          {item.name}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted-ink)]">
          Size <span className="font-semibold text-[var(--ink)]">{item.selectedSize}</span>
          <span aria-hidden="true"> · </span>
          Quantity {item.quantity}
        </p>
      </div>

      <p className="col-start-2 font-semibold tabular-nums sm:col-start-auto sm:text-right">
        {formatUsd(item.lineTotalCents)}
      </p>
    </li>
  );
}

export function OrderReview({ order }: OrderReviewProps) {
  return (
    <section
      aria-labelledby="checkout-order-title"
      className="border border-[var(--line)] bg-[var(--surface)]"
    >
      <div className="border-b border-[var(--line)] px-5 py-6 sm:px-8 sm:py-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--sage-dark)]">
          Your order
        </p>
        <h1
          className="mt-2 font-serif text-3xl tracking-[-0.04em] sm:text-4xl"
          id="checkout-order-title"
        >
          Review your outfit
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted-ink)] sm:text-base">
          Check each piece and size before continuing to payment.
        </p>
      </div>

      <div className="px-5 sm:px-8">
        <ul aria-label="Verified order items">
          {order.items.map((item) => (
            <OrderItem item={item} key={item.category} />
          ))}
        </ul>
      </div>

      <div className="border-t-2 border-[var(--ink)] bg-[#eeeadf] px-5 py-5 sm:px-8">
        <dl className="grid gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted-ink)]">
              Sold by
            </dt>
            <dd className="mt-1 font-semibold">Fitora</dd>
            <dd className="text-xs text-[var(--muted-ink)]">
              Prices shown in {order.currency}
            </dd>
          </div>
          <div className="sm:text-right">
            <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted-ink)]">
              Order total
            </dt>
            <dd className="mt-1 font-serif text-3xl tracking-[-0.04em] tabular-nums">
              {formatUsd(order.totalCents)}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
