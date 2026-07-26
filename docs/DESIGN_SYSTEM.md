# Fitora Design System

This design system translates the editorial-fashion brief into accessible web tokens and interaction rules. Product requirements override generic pattern-library suggestions.

## Direction

- Editorial, warm, grounded, and product-first.
- Generous whitespace and a clear reading rhythm rather than dense dashboard chrome.
- Display typography uses a classic serif system stack; functional copy uses a neutral sans-serif system stack.
- Motion is subtle, purposeful, and fully reduced when `prefers-reduced-motion` is active.
- No neon AI visual language, decorative gradients, glass effects, emoji icons, or unlicensed brand imagery.

## Core tokens

| Role | Token | Value |
| --- | --- | --- |
| Canvas | `--canvas` | `#F3EFE7` |
| Surface | `--surface` | `#FBF9F4` |
| Primary text | `--ink` | `#20231E` |
| Secondary text | `--muted-ink` | `#5F665B` |
| Sage accent | `--sage` | `#667260` |
| Primary action | `--sage-dark` | `#465141` |
| Border | `--line` | `#D8D1C5` |
| Focus ring | `--focus` | `#33452F` |

## Typography

- Display: `Iowan Old Style`, `Palatino Linotype`, `Georgia`, serif.
- Interface and body: `Inter`, system UI, `Segoe UI`, sans-serif.
- Body copy never falls below 16 px on mobile.
- Long copy stays within roughly 65–75 characters per line.
- Prices and scores use tabular figures.

## Interaction and accessibility

- Every control has a programmatic label and visible focus state.
- Touch targets are at least 44 × 44 px with at least 8 px separation.
- Errors sit beside the affected field and explain how to recover.
- Loading, empty, pending, approved, declined, and failure states use text as well as colour.
- Primary actions use one clear visual treatment per screen; secondary actions remain subordinate.
- Layout is mobile-first and verified at 375, 768, 1024, and 1440 px widths.
- Product media reserves a 4:5 aspect ratio to avoid layout shift.

