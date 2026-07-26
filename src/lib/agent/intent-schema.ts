import { z } from "zod";

import {
  PRODUCT_CATEGORIES,
  PRODUCT_COLORS,
  STYLES,
} from "@/lib/catalogue/schemas";

export const CHANGE_BUDGET_OPERATIONS = [
  "set",
  "increase_by",
  "decrease_by",
] as const;

export const UNSUPPORTED_REASONS = [
  "UNRECOGNIZED_COMMAND",
  "MULTIPLE_ACTIONS",
  "MISSING_TARGET",
  "AMBIGUOUS_TARGET",
  "MISSING_AMOUNT",
  "AMBIGUOUS_AMOUNT",
  "INVALID_AMOUNT",
  "UNSUPPORTED_VALUE",
  "PROMPT_INJECTION",
] as const;

const ProductCategorySchema = z.enum(PRODUCT_CATEGORIES);
const ProductColorSchema = z.enum(PRODUCT_COLORS);
const StyleSchema = z.enum(STYLES);
const ChangeBudgetOperationSchema = z.enum(CHANGE_BUDGET_OPERATIONS);
const UnsupportedReasonSchema = z.enum(UNSUPPORTED_REASONS);

export const GenerateOutfitsIntentSchema = z
  .object({ type: z.literal("GENERATE_OUTFITS") })
  .strict();

export const ReplaceItemIntentSchema = z
  .object({
    type: z.literal("REPLACE_ITEM"),
    category: ProductCategorySchema,
    requireCheaper: z.boolean(),
    targetStyle: StyleSchema.nullable(),
    targetColor: ProductColorSchema.nullable(),
  })
  .strict();

export const MakeCheaperIntentSchema = z
  .object({
    type: z.literal("MAKE_CHEAPER"),
    category: ProductCategorySchema.nullable(),
  })
  .strict();

export const ChangeStyleIntentSchema = z
  .object({
    type: z.literal("CHANGE_STYLE"),
    style: StyleSchema,
  })
  .strict();

export const ChangeBudgetIntentSchema = z
  .object({
    type: z.literal("CHANGE_BUDGET"),
    operation: ChangeBudgetOperationSchema,
    amountCents: z.number().int().safe().positive().max(1_000_000),
  })
  .strict();

export const PreferColorIntentSchema = z
  .object({
    type: z.literal("PREFER_COLOR"),
    color: ProductColorSchema,
  })
  .strict();

export const ExcludeColorIntentSchema = z
  .object({
    type: z.literal("EXCLUDE_COLOR"),
    color: ProductColorSchema,
  })
  .strict();

export const SelectOutfitIntentSchema = z
  .object({
    type: z.literal("SELECT_OUTFIT"),
    position: z
      .union([z.literal(1), z.literal(2), z.literal(3)])
      .nullable(),
  })
  .strict();

export const RequestCheckoutIntentSchema = z
  .object({ type: z.literal("REQUEST_CHECKOUT") })
  .strict();

export const HelpIntentSchema = z
  .object({ type: z.literal("HELP") })
  .strict();

export const UnsupportedIntentSchema = z
  .object({
    type: z.literal("UNSUPPORTED"),
    reason: UnsupportedReasonSchema,
  })
  .strict();

/**
 * The only model-derived command shape accepted by Fitora. Every member is
 * strict so product IDs, tool names, approval flags, and payment data cannot
 * hitchhike into deterministic domain tools.
 */
export const AgentIntentSchema = z.discriminatedUnion("type", [
  GenerateOutfitsIntentSchema,
  ReplaceItemIntentSchema,
  MakeCheaperIntentSchema,
  ChangeStyleIntentSchema,
  ChangeBudgetIntentSchema,
  PreferColorIntentSchema,
  ExcludeColorIntentSchema,
  SelectOutfitIntentSchema,
  RequestCheckoutIntentSchema,
  HelpIntentSchema,
  UnsupportedIntentSchema,
]);

export type ChangeBudgetOperation = z.infer<
  typeof ChangeBudgetOperationSchema
>;
export type UnsupportedReason = z.infer<typeof UnsupportedReasonSchema>;
export type AgentIntent = z.infer<typeof AgentIntentSchema>;
export type GenerateOutfitsIntent = z.infer<
  typeof GenerateOutfitsIntentSchema
>;
export type ReplaceItemIntent = z.infer<typeof ReplaceItemIntentSchema>;
export type MakeCheaperIntent = z.infer<typeof MakeCheaperIntentSchema>;
export type ChangeStyleIntent = z.infer<typeof ChangeStyleIntentSchema>;
export type ChangeBudgetIntent = z.infer<typeof ChangeBudgetIntentSchema>;
export type PreferColorIntent = z.infer<typeof PreferColorIntentSchema>;
export type ExcludeColorIntent = z.infer<typeof ExcludeColorIntentSchema>;
export type SelectOutfitIntent = z.infer<typeof SelectOutfitIntentSchema>;
export type RequestCheckoutIntent = z.infer<
  typeof RequestCheckoutIntentSchema
>;
export type HelpIntent = z.infer<typeof HelpIntentSchema>;
export type UnsupportedIntent = z.infer<typeof UnsupportedIntentSchema>;
