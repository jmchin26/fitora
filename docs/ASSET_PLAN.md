# Fitora Product Image Catalogue

## Current asset state

The catalogue has exactly 30 local, project-authored SVG placeholders:

- 10 tops;
- 10 bottoms;
- 10 pairs of shoes.

Every catalogue `imagePath` resolves to a file in `public/products/`.
`public/products/manifest.json` is the authoritative asset ledger and maps
exactly the same 30 product IDs. Each strict manifest entry records:

- the current image path and an explicit local fallback path;
- placeholder kind and SVG format;
- the declared 640 × 800 pixel-equivalent canvas (4:5);
- project-authored source and project-owned license status;
- no attribution requirement; and
- `brandNeutral: true`.

For this manifest, `brandNeutral` means the illustration contains no real
third-party logo, trademark, packaging, or claim of commercial affiliation.
The visible “FITORA EDIT” text is the name of this fictional project, not a
representation of a real clothing brand. Product names are also fictional.

The placeholder itself is the fallback until a reviewed final image is
supplied, so `imagePath` and `fallbackPath` intentionally match. This keeps all
existing catalogue and UI paths stable.

## Automated safeguards

`tests/unit/product-assets.test.ts` fails when:

- the manifest keys differ from the 30 catalogue product IDs;
- an entry is missing, has an extra field, or disagrees with catalogue paths;
- a primary or fallback path is non-local, escapes `public/products/`, is
  missing, empty, or unexpectedly large;
- an undeclared product image appears in the directory;
- an SVG does not match its declared 640 × 800 (4:5) canvas;
- executable, embedded, data-URI, or remotely loaded SVG content appears; or
- visible SVG text differs from the exact catalogue facts and fictional project
  label allowed for that product.

These tests establish asset integrity and provenance; they do not claim that
the placeholders are product photography.

## Final-image intake

If generated or clearly licensed final images are later supplied:

1. Keep every product ID and catalogue `imagePath` stable unless the catalogue,
   manifest, and tests are deliberately updated together.
2. Require one clearly identifiable gender-neutral product on a neutral studio
   background, consistent soft light, realistic materials, and 4:5 framing.
3. Reject visible logos, trademarks, text, watermarks, branded packaging,
   people whose release is unknown, or misleading marketplace affiliation.
4. Record the exact source, license, attribution requirement, dimensions,
   format, and local fallback in the manifest. Do not guess these facts.
5. Store the file locally. Do not hotlink, scrape, or depend on a remote image.
6. Prefer optimized WebP or AVIF, generally below 250 KB when practical, and
   retain the safe SVG placeholder as fallback.
7. Run `npm test -- tests/unit/product-assets.test.ts`, then the complete
   quality gate before committing.

No third-party or generated final image pack has been supplied in this
workspace, so replacing the safe placeholders would be an unsupported claim.
