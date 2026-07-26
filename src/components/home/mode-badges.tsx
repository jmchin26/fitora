import {
  getProviderModes,
  providerModeLabels,
} from "@/lib/config/providers";

type ModeBadgesProps = {
  compact?: boolean;
};

export function ModeBadges({ compact = false }: ModeBadgesProps) {
  const modes = getProviderModes();
  const labels = providerModeLabels(modes);
  const hasInvalidMode = modes.ai === "invalid" || modes.payment === "invalid";

  return (
    <div
      aria-hidden={compact || undefined}
      aria-label={compact ? undefined : "Active provider modes"}
      className={`flex flex-wrap items-center ${compact ? "gap-x-5 gap-y-2" : "justify-end gap-2"}`}
      role={compact ? undefined : "group"}
    >
      {labels.map((label, index) => (
        <span
          className={
            compact
              ? "inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted-ink)]"
              : "inline-flex min-h-8 items-center gap-2 border border-[var(--line)] bg-[var(--surface)] px-3 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-[var(--muted-ink)]"
          }
          key={label}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${hasInvalidMode ? "bg-[#8a352d]" : index === 0 ? "bg-[var(--sage)]" : "bg-[var(--muted-ink)]"}`}
          />
          <span>{label}</span>
        </span>
      ))}
    </div>
  );
}
