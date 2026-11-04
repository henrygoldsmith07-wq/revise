// Whether this deployment sells Plus. Deliberately free of "server-only" and of
// Stripe itself, so the public pages (and the landing-site generator, which
// bundles them) can ask without pulling in the payment client.
//
// STRIPE_SECRET_KEY is the switch: setting it is the deployment saying it
// charges for Plus, and /api/ai enforces it from then on.

export function plusOnSale(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
