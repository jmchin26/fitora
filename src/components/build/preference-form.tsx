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
import { LineIcon } from "@/components/ui/line-icon";

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

const CHOICE_ICONS = {
  interview: "briefcase",
  presentation: "presentation",
  casual_event: "calendar",
  minimal: "minimal",
  smart_casual: "shirt",
  relaxed: "wave",
} as const;

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
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const checked = value === option;
          const iconName = CHOICE_ICONS[option as keyof typeof CHOICE_ICONS];

          return (
            <label
              className={`flex min-h-11 cursor-pointer items-center gap-2.5 border px-3 py-2 text-xs font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${
                checked
                  ? "border-[var(--sage-dark)] bg-[#e5e8df] text-[var(--sage-dark)]"
                  : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--sage)]"
              }`}
              key={option}
            >
              <input
                checked={checked}
                className="sr-only"
                name={name}
                onChange={() => onChange(option)}
                type="radio"
                value={option}
              />
              <LineIcon
                className={`h-[1.125rem] w-[1.125rem] shrink-0 ${
                  checked ? "text-[var(--sage-dark)]" : "text-[var(--muted-ink)]"
                }`}
                name={iconName}
              />
              <span>{labels[option as keyof typeof labels]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function SizeSelect<T extends string>({
  id,
  label,
  name,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  name: string;
  options: readonly T[];
  value: string;
  onChange: (value: T) => void;
}) {
  return (
    <div className="relative min-w-0 has-[:focus-visible]:z-10 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)]">
      <label
        className="pointer-events-none absolute left-3 top-2 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[var(--muted-ink)]"
        htmlFor={id}
      >
        {label}
      </label>
      <select
        className="min-h-14 w-full cursor-pointer appearance-none bg-transparent px-3 pb-1.5 pt-6 text-sm font-semibold text-[var(--ink)] outline-none"
        id={id}
        name={name}
        onChange={(event) => onChange(event.currentTarget.value as T)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <LineIcon
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 text-[var(--muted-ink)]"
        name="chevron"
      />
    </div>
  );
}

function ColourGroup({
  describedBy,
  helperText,
  label,
  name,
  selected,
  onToggle,
}: {
  describedBy?: string;
  helperText?: string;
  label: string;
  name: "preferredColors" | "excludedColors";
  selected: readonly ProductColor[];
  onToggle: (color: ProductColor) => void;
}) {
  const featuredColors: ProductColor[] =
    name === "preferredColors"
      ? ["black", "white", "navy", "charcoal", "olive"]
      : ["stone", "beige", "brown", "grey", "burgundy"];
  const moreColors = PRODUCT_COLORS.filter(
    (color) => !featuredColors.includes(color),
  );
  const hiddenSelectionCount = moreColors.filter((color) =>
    selected.includes(color),
  ).length;

  function colorChoice(color: ProductColor) {
    const checked = selected.includes(color);

    return (
      <label
        className={`flex min-h-10 min-w-0 cursor-pointer items-center gap-1 overflow-hidden border px-1 py-2 text-xs transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${
          checked
            ? "border-[var(--sage-dark)] bg-[#e5e8df] font-semibold text-[var(--sage-dark)] shadow-[inset_0_0_0_1px_var(--sage-dark)]"
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
          className="h-3 w-3 shrink-0 rounded-full border border-black/20"
          style={{ backgroundColor: COLOR_SWATCHES[color] }}
        />
        <span className="min-w-0 whitespace-nowrap">{capitalize(color)}</span>
      </label>
    );
  }

  return (
    <fieldset
      aria-describedby={describedBy}
      aria-invalid={Boolean(describedBy)}
    >
      <legend className="text-sm font-bold text-[var(--ink)]">{label}</legend>
      {helperText ? (
        <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">{helperText}</p>
      ) : null}
      <div className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-[repeat(4,minmax(0,1fr))_minmax(5.25rem,1.15fr)]">
        {featuredColors.map(colorChoice)}
      </div>
      <details className="group mt-2">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-[var(--sage-dark)] transition-colors hover:text-[var(--ink)] [&::-webkit-details-marker]:hidden">
          More colours
          {hiddenSelectionCount > 0 ? (
            <span className="rounded-full bg-[#e5e8df] px-2 py-0.5 text-[0.65rem]">
              {hiddenSelectionCount} selected
            </span>
          ) : null}
          <LineIcon
            className="h-4 w-4 transition-transform group-open:rotate-180"
            name="chevron"
          />
        </summary>
        <div className="grid grid-cols-3 gap-1 pt-2 sm:grid-cols-4">
          {moreColors.map(colorChoice)}
        </div>
      </details>
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

  return (
    <form
      className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-6 shadow-[var(--shadow-soft)] xl:sticky xl:top-24 xl:w-full xl:flex-1"
      id="preference-form"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="flex items-center gap-4 border-b border-[var(--line)] pb-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#efebe2] text-[var(--sage-dark)]">
          <LineIcon className="h-6 w-6" name="tag" />
        </span>
        <div>
          <h2 className="font-serif text-2xl tracking-[-0.035em]">Tell us what fits</h2>
          <p className="mt-1 text-xs text-[var(--muted-ink)]">Prices and stock are verified before an outfit is shown.</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
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
          <p className="mt-1 text-xs text-[var(--muted-ink)]" id="budget-help">
            One top, one bottom, and one pair of shoes · USD
          </p>
          <div
            className={`mt-2 flex min-h-12 overflow-hidden border bg-[var(--surface-strong)] transition-colors focus-within:border-[var(--sage-dark)] focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[var(--focus)] ${
              errors.budgetUsd ? "border-[#8a352d]" : "border-[var(--line)]"
            }`}
          >
            <span
              aria-hidden="true"
              className="flex w-11 shrink-0 items-center justify-center border-r border-[var(--line)] bg-[var(--surface)] font-serif text-lg text-[var(--sage-dark)]"
            >
              $
            </span>
            <input
              aria-describedby={`budget-help${errors.budgetUsd ? " budget-error" : ""}`}
              aria-invalid={Boolean(errors.budgetUsd)}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent px-3.5 py-2 text-sm font-semibold tabular-nums text-[var(--ink)] outline-none"
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
          <div className="mt-2 grid grid-cols-3 divide-x divide-[var(--line)] border border-[var(--line)] bg-[var(--surface-strong)]">
            <SizeSelect
              id="top-size"
              label="Top"
              name="topSize"
              onChange={(topSize) => updateDraft({ topSize })}
              options={CLOTHING_SIZES}
              value={draft.topSize}
            />
            <SizeSelect
              id="bottom-size"
              label="Bottom"
              name="bottomSize"
              onChange={(bottomSize) => updateDraft({ bottomSize })}
              options={CLOTHING_SIZES}
              value={draft.bottomSize}
            />
            <SizeSelect
              id="shoe-size"
              label="Shoes · EU"
              name="shoeSize"
              onChange={(shoeSize) => updateDraft({ shoeSize })}
              options={SHOE_SIZES}
              value={draft.shoeSize}
            />
          </div>
        </fieldset>

        <div>
          <ColourGroup
            describedBy={
              errors.preferredColors ? "preferred-colours-error" : undefined
            }
            helperText="Choose colours you would like us to prioritise."
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
            helperText="These colours will not appear in your outfits."
            label="Colours to avoid (optional)"
            name="excludedColors"
            onToggle={(color) => toggleColour("excludedColors", color)}
            selected={draft.excludedColors}
          />
          <ErrorMessage
            id="excluded-colours-error"
            message={errors.excludedColors}
          />
        </div>

        <ErrorMessage id="form-error" message={errors.form} />

        <button
          className="mt-1 flex min-h-12 w-full items-center justify-center gap-3 bg-[var(--sage-dark)] px-5 py-3 font-bold text-white transition-colors hover:bg-[var(--ink)] active:bg-black disabled:cursor-wait disabled:opacity-70"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Building outfit options…" : "Build outfit options"}
          {!isSubmitting ? <LineIcon className="h-5 w-5" name="arrow" /> : null}
        </button>
      </div>
    </form>
  );
}
