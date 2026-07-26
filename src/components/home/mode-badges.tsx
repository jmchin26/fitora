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
  const invalidModes = [
    modes.ai === "invalid",
    modes.payment === "invalid",
  ] as const;

  return (
    <div
      aria-hidden={compact || undefined}
      aria-label={compact ? undefined : "Active provider modes"}
      className={`flex flex-wrap items-center ${compact ? "gap-x-5 gap-y-2" : "justify-end gap-2"}`}
      role={compact ? undefined : "group"}
    >
      {labels.map((label, index) => {
        const isInvalid = invalidModes[index];

        return (
          <span
            className={
              compact
                ? `inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] ${isInvalid ? "text-[#783129]" : "text-[var(--muted-ink)]"}`
                : `inline-flex min-h-8 items-center gap-2 border px-3 text-[0.6875rem] font-bold uppercase tracking-[0.1em] ${isInvalid ? "border-[#8a352d] bg-[#f5e9e4] text-[#783129]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted-ink)]"}`
            }
            data-readiness={isInvalid ? "invalid" : "ready"}
            key={label}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${isInvalid ? "bg-[#8a352d]" : index === 0 ? "bg-[var(--sage)]" : "bg-[var(--muted-ink)]"}`}
            />
            <span>{label}</span>
          </span>
        );
      })}
    </div>
  );
}
