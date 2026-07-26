import { useState, type FormEvent } from "react";

import {
  CLOTHING_SIZES,
  OCCASIONS,
  PRODUCT_COLORS,
  SHOE_SIZES,
  STYLES,
  UserPreferencesSchema,
  type ProductColor,
  type UserPreferences,
} from "@/lib/catalogue/schemas";
import { centsToDecimalString } from "@/lib/money";

export type PreferenceDraft = {
  occasion: string;
  budgetUsd: string;
  topSize: string;
  bottomSize: string;
  shoeSize: string;
  preferredColors: ProductColor[];
  excludedColors: ProductColor[];
  style: string;
};

type PreferenceField = keyof PreferenceDraft | "form";
type PreferenceErrors = Partial<Record<PreferenceField, string>>;

type PreferenceFormProps = {
  draft: PreferenceDraft;
  isSubmitting: boolean;
  onDraftChange: (draft: PreferenceDraft) => void;
  onValidSubmit: (preferences: UserPreferences) => void;
};

const OCCASION_LABELS: Record<(typeof OCCASIONS)[number], string> = {
  interview: "Interview",
  presentation: "Presentation",
  casual_event: "Casual event",
};

const STYLE_LABELS: Record<(typeof STYLES)[number], string> = {
  minimal: "Minimal",
  smart_casual: "Smart casual",
  relaxed: "Relaxed",
};

const COLOR_SWATCHES: Record<ProductColor, string> = {
  black: "#20211f",
  white: "#f8f7f2",
  navy: "#27364d",
  charcoal: "#4c504d",
  stone: "#aaa298",
  olive: "#6f7151",
  sage: "#8a987f",
  cream: "#eee5d3",
  beige: "#cdbda5",
  brown: "#795b48",
  grey: "#92958f",
  burgundy: "#744247",
};

export const DEFAULT_PREFERENCE_DRAFT: PreferenceDraft = {
  occasion: "presentation",
  budgetUsd: "150.00",
  topSize: "M",
  bottomSize: "M",
  shoeSize: "42",
  preferredColors: ["navy", "white", "black"],
  excludedColors: [],
  style: "smart_casual",
};

export function draftFromPreferences(
  preferences: UserPreferences,
): PreferenceDraft {
  return {
    occasion: preferences.occasion,
    budgetUsd: centsToDecimalString(preferences.budgetCents),
    topSize: preferences.topSize,
    bottomSize: preferences.bottomSize,
    shoeSize: preferences.shoeSize,
    preferredColors: [...preferences.preferredColors],
    excludedColors: [...preferences.excludedColors],
    style: preferences.style,
  };
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function parseBudgetCents(value: string):
  | { ok: true; value: number }
  | { ok: false; message: string } {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return { ok: false, message: "Enter your total outfit budget." };
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmedValue)) {
    return {
      ok: false,
      message:
        "Enter a USD amount with up to two decimal places, such as 150 or 150.00.",
    };
  }

  const [dollarPart, decimalPart = ""] = trimmedValue.split(".");
  const normalizedDollars = dollarPart.replace(/^0+(?=\d)/, "");

  if (normalizedDollars.length > 14) {
    return {
      ok: false,
      message: "Enter a budget within the supported USD range.",
    };
  }

  const cents =
    BigInt(normalizedDollars) * 100n +
    BigInt(decimalPart.padEnd(2, "0"));

  if (cents <= 0n) {
    return { ok: false, message: "Budget must be at least $0.01." };
  }

  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    return {
      ok: false,
      message: "Enter a budget within the supported USD range.",
    };
  }

  return { ok: true, value: Number(cents) };
}

function parsePreferenceDraft(
  draft: PreferenceDraft,
):
  | { ok: true; preferences: UserPreferences }
  | { ok: false; errors: PreferenceErrors } {
  const parsedBudget = parseBudgetCents(draft.budgetUsd);

  if (!parsedBudget.ok) {
    return { ok: false, errors: { budgetUsd: parsedBudget.message } };
  }

  const parsedPreferences = UserPreferencesSchema.safeParse({
    occasion: draft.occasion,
    budgetCents: parsedBudget.value,
    topSize: draft.topSize,
    bottomSize: draft.bottomSize,
    shoeSize: draft.shoeSize,
    preferredColors: draft.preferredColors,
    excludedColors: draft.excludedColors,
    style: draft.style,
  });

  if (parsedPreferences.success) {
    return { ok: true, preferences: parsedPreferences.data };
  }

  const errors: PreferenceErrors = {};
  const knownFields = new Set<PreferenceField>([
    "occasion",
    "budgetUsd",
    "topSize",
    "bottomSize",
    "shoeSize",
    "preferredColors",
    "excludedColors",
    "style",
  ]);

  parsedPreferences.error.issues.forEach((issue) => {
    const issueField = String(issue.path[0] ?? "form");
    const field: PreferenceField = knownFields.has(issueField as PreferenceField)
      ? (issueField as PreferenceField)
      : "form";

    if (!errors[field]) {
      errors[field] = issue.message;
    }
  });

  return { ok: false, errors };
}

function ErrorMessage({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p
      className="mt-2 text-sm font-semibold text-[#8a352d]"
      id={id}
      role="alert"
    >
      {message}
    </p>
  );
}

function ChoiceGroup<T extends string>({
  describedBy,
  label,
  name,
  options,
  value,
  onChange,
}: {
  describedBy?: string;
  label: string;
  name: string;
  options: readonly T[];
  value: string;
  onChange: (value: T) => void;
}) {
  const labels = name === "occasion" ? OCCASION_LABELS : STYLE_LABELS;

  return (
    <fieldset aria-describedby={describedBy}>
      <legend className="text-sm font-bold text-[var(--ink)]">{label}</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const checked = value === option;

          return (
            <label
              className={`flex min-h-12 cursor-pointer items-center gap-3 border px-3.5 py-2.5 text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${
                checked
                  ? "border-[var(--sage-dark)] bg-[#e5e8df] text-[var(--sage-dark)]"
                  : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--sage)]"
              }`}
              key={option}
            >
              <input
                checked={checked}
                className="h-4 w-4 accent-[var(--sage-dark)]"
                name={name}
                onChange={() => onChange(option)}
                type="radio"
                value={option}
              />
              {labels[option as keyof typeof labels]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ColourGroup({
  describedBy,
  label,
  name,
  selected,
  onToggle,
}: {
  describedBy?: string;
  label: string;
  name: "preferredColors" | "excludedColors";
  selected: readonly ProductColor[];
  onToggle: (color: ProductColor) => void;
}) {
  return (
    <fieldset
      aria-describedby={describedBy}
      aria-invalid={Boolean(describedBy)}
    >
      <legend className="text-sm font-bold text-[var(--ink)]">{label}</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRODUCT_COLORS.map((color) => {
          const checked = selected.includes(color);

          return (
            <label
              className={`flex min-h-11 cursor-pointer items-center gap-2 border px-3 py-2 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${
                checked
                  ? "border-[var(--sage-dark)] bg-[#e5e8df] font-semibold text-[var(--sage-dark)]"
                  : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--sage)]"
              }`}
              key={color}
            >
              <input
                checked={checked}
                className="sr-only"
                name={name}
                onChange={() => onToggle(color)}
                type="checkbox"
                value={color}
              />
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 rounded-full border border-black/20"
                style={{ backgroundColor: COLOR_SWATCHES[color] }}
              />
              {capitalize(color)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function PreferenceForm({
  draft,
  isSubmitting,
  onDraftChange,
  onValidSubmit,
}: PreferenceFormProps) {
  const [errors, setErrors] = useState<PreferenceErrors>({});

  function updateDraft(patch: Partial<PreferenceDraft>) {
    onDraftChange({ ...draft, ...patch });
  }

  function toggleColour(
    field: "preferredColors" | "excludedColors",
    color: ProductColor,
  ) {
    const colors = draft[field];
    const nextColors = colors.includes(color)
      ? colors.filter((currentColor) => currentColor !== color)
      : [...colors, color];

    updateDraft({ [field]: nextColors });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedDraft = parsePreferenceDraft(draft);

    if (!parsedDraft.ok) {
      setErrors(parsedDraft.errors);
      const fieldOrder: PreferenceField[] = [
        "occasion",
        "budgetUsd",
        "topSize",
        "bottomSize",
        "shoeSize",
        "preferredColors",
        "excludedColors",
        "style",
      ];
      const firstInvalidField = fieldOrder.find(
        (field) => parsedDraft.errors[field],
      );

      if (firstInvalidField) {
        event.currentTarget
          .querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)
          ?.focus();
      }
      return;
    }

    setErrors({});
    onValidSubmit(parsedDraft.preferences);
  }

  const controlClass =
    "mt-2 min-h-12 w-full border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-base text-[var(--ink)] shadow-none transition-colors hover:border-[var(--sage)] focus:border-[var(--sage-dark)] focus:outline-none";

  return (
    <form
      className="border border-[var(--line)] bg-[#ece7dd] p-5 sm:p-7 xl:sticky xl:top-6"
      id="preference-form"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="border-b border-[var(--line)] pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--sage-dark)]">
          Step 01
        </p>
        <h2 className="mt-2 font-serif text-3xl tracking-[-0.035em]">
          Tell us what fits
        </h2>
        <p className="mt-2 text-sm text-[var(--muted-ink)]">
          All prices and stock are verified again by the server before an
          outfit is shown.
        </p>
      </div>

      <div className="mt-6 space-y-7">
        <ChoiceGroup
          label="Occasion"
          name="occasion"
          onChange={(occasion) => updateDraft({ occasion })}
          options={OCCASIONS}
          value={draft.occasion}
        />

        <ChoiceGroup
          label="Style direction"
          name="style"
          onChange={(style) => updateDraft({ style })}
          options={STYLES}
          value={draft.style}
        />

        <div>
          <label className="text-sm font-bold" htmlFor="budget-usd">
            Total outfit budget
          </label>
          <p className="mt-1 text-sm text-[var(--muted-ink)]" id="budget-help">
            One top, one bottom, and one pair of shoes · USD
          </p>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-2 left-0 flex w-10 items-center justify-center border-r border-[var(--line)] text-[var(--muted-ink)]"
            >
              $
            </span>
            <input
              aria-describedby={`budget-help${errors.budgetUsd ? " budget-error" : ""}`}
              aria-invalid={Boolean(errors.budgetUsd)}
              autoComplete="off"
              className={`${controlClass} pl-12 tabular-nums`}
              id="budget-usd"
              inputMode="decimal"
              name="budgetUsd"
              onChange={(event) =>
                updateDraft({ budgetUsd: event.currentTarget.value })
              }
              placeholder="150.00"
              type="text"
              value={draft.budgetUsd}
            />
          </div>
          <ErrorMessage id="budget-error" message={errors.budgetUsd} />
        </div>

        <fieldset>
          <legend className="text-sm font-bold">Your sizes</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-sm text-[var(--muted-ink)]" htmlFor="top-size">
                Top
              </label>
              <select
                className={controlClass}
                id="top-size"
                name="topSize"
                onChange={(event) =>
                  updateDraft({ topSize: event.currentTarget.value })
                }
                value={draft.topSize}
              >
                {CLOTHING_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-sm text-[var(--muted-ink)]"
                htmlFor="bottom-size"
              >
                Bottom
              </label>
              <select
                className={controlClass}
                id="bottom-size"
                name="bottomSize"
                onChange={(event) =>
                  updateDraft({ bottomSize: event.currentTarget.value })
                }
                value={draft.bottomSize}
              >
                {CLOTHING_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-[var(--muted-ink)]" htmlFor="shoe-size">
                Shoes · EU
              </label>
              <select
                className={controlClass}
                id="shoe-size"
                name="shoeSize"
                onChange={(event) =>
                  updateDraft({ shoeSize: event.currentTarget.value })
                }
                value={draft.shoeSize}
              >
                {SHOE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <div>
          <ColourGroup
            describedBy={
              errors.preferredColors ? "preferred-colours-error" : undefined
            }
            label="Preferred colours (optional)"
            name="preferredColors"
            onToggle={(color) => toggleColour("preferredColors", color)}
            selected={draft.preferredColors}
          />
          <ErrorMessage
            id="preferred-colours-error"
            message={errors.preferredColors}
          />
        </div>

        <div>
          <ColourGroup
            describedBy={
              errors.excludedColors ? "excluded-colours-error" : undefined
            }
            label="Colours to avoid (optional)"
            name="excludedColors"
            onToggle={(color) => toggleColour("excludedColors", color)}
            selected={draft.excludedColors}
          />
          <p className="mt-2 text-sm text-[var(--muted-ink)]">
            Avoided colours are hard filters, not suggestions.
          </p>
          <ErrorMessage
            id="excluded-colours-error"
            message={errors.excludedColors}
          />
        </div>

        <ErrorMessage id="form-error" message={errors.form} />

        <button
          className="flex min-h-12 w-full items-center justify-center bg-[var(--sage-dark)] px-5 py-3 font-bold text-white transition-colors hover:bg-[var(--ink)] disabled:cursor-wait disabled:opacity-70"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Building outfit options…" : "Build outfit options"}
        </button>
      </div>
    </form>
  );
}
