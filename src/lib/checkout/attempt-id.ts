import { z } from "zod";

/**
 * Opaque locator shared by forms, signed workflow state, callback paths, and
 * cookie names. Requiring the lowercase RFC variant/version form keeps every
 * boundary in agreement before a provider-side effect can begin.
 */
export const CheckoutAttemptIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    "Checkout attempt ID must be a lowercase RFC UUID.",
  );

export type CheckoutAttemptId = z.infer<
  typeof CheckoutAttemptIdSchema
>;
