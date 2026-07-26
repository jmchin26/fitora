const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function assertCents(value: number, label = "Amount"): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of cents.`);
  }

  return value;
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => {
    const next = total + assertCents(value);

    if (!Number.isSafeInteger(next)) {
      throw new RangeError("Amount exceeds the safe integer range.");
    }

    return next;
  }, 0);
}

export function formatUsd(cents: number): string {
  return usdFormatter.format(assertCents(cents) / 100);
}

export function centsToDecimalString(cents: number): string {
  return (assertCents(cents) / 100).toFixed(2);
}

