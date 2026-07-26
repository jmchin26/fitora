const outfitItems = [
  { name: "Harbor Knit Polo", price: "$40" },
  { name: "Stone Straight Chinos", price: "$40" },
  { name: "Minimal Court Sneakers", price: "$49" },
] as const;

function OutfitSilhouettes() {
  return (
    <svg
      aria-hidden="true"
      className="h-auto w-full"
      fill="none"
      viewBox="0 0 520 600"
    >
      <circle cx="232" cy="274" fill="var(--canvas)" r="190" />
      <path
        d="M122 74c25-18 45-26 67-31 11 25 28 37 50 37s39-12 50-37c23 5 44 14 69 31l-34 104-48-18v142H202V160l-47 18-33-104Z"
        fill="#27364d"
        stroke="var(--sage-dark)"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M202 160c24 10 49 10 74 0M239 80v222"
        stroke="var(--sage-dark)"
        strokeWidth="1.5"
      />
      <circle cx="251" cy="111" fill="var(--surface)" r="3" />
      <circle cx="251" cy="139" fill="var(--surface)" r="3" />
      <path
        d="M185 330h113l-10 211h-58l-6-132-7 132h-58l-4-211Z"
        fill="var(--line)"
        stroke="var(--muted-ink)"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="m224 409 4-69" stroke="var(--muted-ink)" strokeWidth="1.5" />
      <path
        d="M95 523c38 0 60 9 83 31 8 7 6 24-8 28H80c-13-1-18-10-11-21l26-38Zm270 0c38 0 60 9 83 31 8 7 6 24-8 28h-90c-13-1-18-10-11-21l26-38Z"
        fill="var(--surface)"
        stroke="var(--ink)"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="M73 565h108M343 565h108" stroke="var(--ink)" strokeWidth="2" />
      <path
        d="M388 93h72M388 105h45M55 275h75M82 287h48"
        stroke="var(--line)"
        strokeWidth="2"
      />
    </svg>
  );
}

export function EditorialLookPreview() {
  return (
    <figure
      aria-label="A sample catalogue-verified Fitora outfit"
      className="relative mx-auto w-full max-w-[44rem] lg:mx-0 lg:justify-self-end"
    >
      <div
        aria-hidden="true"
        className="absolute -right-10 -top-10 hidden h-36 w-36 rounded-full border border-[var(--line)] lg:block"
      />

      <div className="relative grid overflow-hidden border border-[var(--line)] bg-[var(--surface)] shadow-[0_24px_70px_rgba(32,35,30,0.10)] sm:grid-cols-[minmax(0,1.45fr)_minmax(12rem,0.7fr)]">
        <div className="relative flex min-h-[31rem] items-center border-b border-[var(--line)] p-6 sm:min-h-[38rem] sm:border-b-0 sm:border-r sm:p-8">
          <div className="absolute left-6 top-6 flex w-[calc(100%-3rem)] items-start justify-between sm:left-8 sm:top-8 sm:w-[calc(100%-4rem)]">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted-ink)]">
              Sample look 01
            </p>
            <p
              aria-hidden="true"
              className="font-['Iowan_Old_Style','Palatino_Linotype',Georgia,serif] text-3xl text-[var(--line)]"
            >
              01
            </p>
          </div>

          <OutfitSilhouettes />

          <p className="absolute bottom-6 left-6 text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted-ink)] sm:bottom-8 sm:left-8">
            Navy / Stone / White
          </p>
        </div>

        <figcaption className="flex flex-col justify-between p-6 sm:p-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--sage-dark)]">
              Catalogue verified
            </p>
            <h2 className="mt-4 font-['Iowan_Old_Style','Palatino_Linotype',Georgia,serif] text-3xl leading-tight tracking-[-0.035em]">
              Presentation,
              <br />
              smart casual
            </h2>
          </div>

          <ol className="mt-8 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {outfitItems.map((item) => (
              <li
                className="grid grid-cols-[1fr_auto] gap-4 py-4 text-sm leading-5"
                key={item.name}
              >
                <span>{item.name}</span>
                <span className="tabular-nums text-[var(--muted-ink)]">
                  {item.price}
                </span>
              </li>
            ))}
          </ol>

          <dl className="mt-7 flex items-end justify-between gap-4">
            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted-ink)]">
                Total
              </dt>
              <dd className="mt-1 font-['Iowan_Old_Style','Palatino_Linotype',Georgia,serif] text-3xl tabular-nums">
                $129
              </dd>
            </div>
            <div className="pb-1 text-right">
              <dt className="sr-only">Items</dt>
              <dd className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted-ink)]">
                3 pieces
              </dd>
            </div>
          </dl>
        </figcaption>
      </div>
    </figure>
  );
}
