type LineIconName =
  | "arrow"
  | "award"
  | "clipboard"
  | "filter"
  | "hanger"
  | "heart"
  | "lock"
  | "package"
  | "shield"
  | "tag";

export function LineIcon({
  name,
  className = "h-5 w-5",
}: {
  name: LineIconName;
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
  };

  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      {name === "arrow" ? <path {...common} d="M5 12h14m-5-5 5 5-5 5" /> : null}
      {name === "award" ? (
        <>
          <circle {...common} cx="12" cy="9" r="5" />
          <path {...common} d="m9 14-1 7 4-2 4 2-1-7M10 9l1.3 1.3L14 7.5" />
        </>
      ) : null}
      {name === "clipboard" ? (
        <>
          <rect {...common} height="17" rx="2" width="14" x="5" y="4" />
          <path {...common} d="M9 4.5V3h6v1.5M9 9h6M9 13h6M9 17h4" />
        </>
      ) : null}
      {name === "filter" ? <path {...common} d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /> : null}
      {name === "hanger" ? <path {...common} d="M12 8a2.5 2.5 0 1 0-2.5-2.5M12 8l9 7H3l9-7Z" /> : null}
      {name === "heart" ? <path {...common} d="M20.8 5.8a5 5 0 0 0-7.1 0L12 7.5l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21l8.8-8.1a5 5 0 0 0 0-7.1Z" /> : null}
      {name === "lock" ? (
        <>
          <rect {...common} height="11" rx="2" width="14" x="5" y="10" />
          <path {...common} d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      ) : null}
      {name === "package" ? (
        <>
          <path {...common} d="m4 7 8-4 8 4v10l-8 4-8-4V7Z" />
          <path {...common} d="m4 7 8 4 8-4M12 11v10" />
        </>
      ) : null}
      {name === "shield" ? <path {...common} d="M12 3 4.5 6v5.5c0 4.7 3 7.8 7.5 9.5 4.5-1.7 7.5-4.8 7.5-9.5V6L12 3Zm-3 9 2 2 4-5" /> : null}
      {name === "tag" ? <path {...common} d="M20 13 13 20l-9-9V4h7l9 9ZM8 8h.01" /> : null}
    </svg>
  );
}
