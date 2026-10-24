// Stripe tells us here when a Checkout payment completes (Stripe Dashboard > Developers > Webhooks,
// endpoint https://<your site>/api/stripe-webhook, events checkout.session.completed and
// checkout.session.async_payment_succeeded). Set STRIPE_WEBHOOK_SECRET to the signing secret it shows.
import { json } from './_lib/util.js';
import { stripeWebhook } from './_lib/pay.js';

export async function POST(request) {
  try {
    const raw = await request.text();
    return json(await stripeWebhook(raw, request.headers.get('stripe-signature')));
  } catch (e) {
    console.error('[stripe-webhook]', e.message);
    return json({ error: e.message }, e.status || 500);
  }
}
