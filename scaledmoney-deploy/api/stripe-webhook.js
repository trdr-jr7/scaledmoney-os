// api/stripe-webhook.js
// Vercel serverless function — receives Stripe events and
// updates the member_tiers table in Supabase.
//
// Vercel Environment Variables required (set in Vercel dashboard):
//   STRIPE_WEBHOOK_SECRET  — from Stripe Dashboard → Webhooks → signing secret
//   STRIPE_SECRET_KEY      — from Stripe Dashboard → API keys
//   SUPABASE_URL           — from Supabase Dashboard → Settings → API
//   SUPABASE_SERVICE_KEY   — from Supabase Dashboard → Settings → API (service_role key)

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// ── Config ───────────────────────────────────────────────────
const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service role — bypasses RLS for server-side writes
);

// ── Vercel config: disable body parsing so we can verify signature ──
export const config = { api: { bodyParser: false } };

// ── Raw body helper ───────────────────────────────────────────
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Main handler ──────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify webhook signature — rejects any requests not from Stripe
  const rawBody = await getRawBody(req);
  const sig     = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // ── Handle events ───────────────────────────────────────────
  try {
    switch (event.type) {

      // ── Payment successful — upgrade to Pro ─────────────────
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        // client_reference_id should be the Supabase user ID
        // Set this when creating the Stripe Checkout session on your pricing page
        const userId = session.client_reference_id;

        if (!userId) {
          console.warn('checkout.session.completed: no client_reference_id');
          break;
        }

        // Get subscription period end
        let periodEnd = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        }

        const { error } = await supabase
          .from('member_tiers')
          .upsert({
            user_id:                userId,
            tier:                   'pro',
            stripe_customer_id:     customerId,
            stripe_subscription_id: subscriptionId,
            current_period_end:     periodEnd,
            updated_at:             new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (error) throw error;
        console.log(`User ${userId} upgraded to Pro`);
        break;
      }

      // ── Subscription renewed ─────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.billing_reason !== 'subscription_cycle') break;

        const customerId = invoice.customer;
        const sub = await stripe.subscriptions.retrieve(invoice.subscription);
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

        const { error } = await supabase
          .from('member_tiers')
          .update({
            tier:               'pro',
            current_period_end: periodEnd,
            updated_at:         new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);

        if (error) throw error;
        console.log(`Subscription renewed for customer ${customerId}`);
        break;
      }

      // ── Subscription cancelled / payment failed ───────────────
      case 'customer.subscription.deleted':
      case 'invoice.payment_failed': {
        const obj = event.data.object;
        const customerId = obj.customer || (obj.lines?.data?.[0]?.subscription ? obj.customer : null);
        if (!customerId) break;

        const { error } = await supabase
          .from('member_tiers')
          .update({
            tier:       'free',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);

        if (error) throw error;
        console.log(`Subscription downgraded to free for customer ${customerId}`);
        break;
      }

      default:
        // Ignore all other Stripe events
        break;
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  // Always return 200 to acknowledge receipt to Stripe
  return res.status(200).json({ received: true });
}
