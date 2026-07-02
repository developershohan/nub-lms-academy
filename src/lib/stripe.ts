import "server-only";
import Stripe from "stripe";

/** Payments are optional in development (per the project's free-tier stack) - callers must
 * handle `null` by surfacing a clear "payments aren't configured yet" error, never by crashing. */
export function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}
