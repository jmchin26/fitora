# Fitora Product Image Plan

## Scope

Prepare exactly 30 local product images matching the catalogue:

- 10 tops;
- 10 bottoms;
- 10 pairs of shoes.

## Visual direction

- editorial ecommerce photography;
- gender-neutral smart-casual styling;
- neutral studio background;
- consistent soft light and shadow;
- no people required;
- no visible logos, trademarks, text, watermarks, or packaging;
- realistic materials and proportions;
- each image contains one clearly identifiable product;
- consistent 4:5 portrait framing.

## Technical target

- source size: approximately 1024 × 1280 pixels or larger at 4:5;
- delivery: optimized WebP, quality balanced for web;
- suggested rendered width variants handled by Next Image;
- target optimized file size: generally below 250 KB when practical;
- descriptive alt text stored in catalogue data, not inferred from filename.

## Naming convention

```text
public/products/top-01.webp
...
public/products/top-10.webp
public/products/bottom-01.webp
...
public/products/bottom-10.webp
public/products/shoes-01.webp
...
public/products/shoes-10.webp
```

Product IDs and image filenames must remain stable after tests are written.

## Placeholder requirement

Before final assets exist, generate local SVG or CSS placeholders that:

- preserve 4:5 layout;
- show category and product name;
- are clearly placeholders;
- do not hotlink remote images;
- do not block the rest of development.

## Asset validation script

Add a small script or test that verifies:

- all 30 catalogue image paths exist;
- no duplicate paths;
- file extensions are allowed;
- dimensions are valid after final assets are supplied;
- the manifest contains exactly 30 entries.
