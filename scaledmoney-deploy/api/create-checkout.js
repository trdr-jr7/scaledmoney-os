// api/create-checkout.js
// Creates a Stripe Checkout session for the Pro upgrade flow.
// Called by the pricing/upgrade page after the user is authenticated.
//
// Vercel Environment Variables required:
//   STRIPE_SECRET_KEY         — from Stripe Dashboard → API keys
//   STRIPE_PRICE_MONTHLY      — Price ID for monthly plan (e.g. price_1Qx...)
//   STRIPE_PRICE_ANNUAL       — Price ID for annual plan  (e.g. price_1Qy...)

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── Price IDs from Vercel environment variables ──────────────
const PRICES = {
    pro_monthly: process.env.STRIPE_PRICE_MONTHLY,
    pro_annual:  process.env.STRIPE_PRICE_ANNUAL,
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
    }

  // ── Guard: make sure Stripe is configured ──────────────────
  if (!process.env.STRIPE_SECRET_KEY) {
        console.error('STRIPE_SECRET_KEY is not set');
        return res.status(500).json({ error: 'Stripe is not configured. Please set STRIPE_SECRET_KEY in Vercel environment variables.' });
  }

  const { userId, plan = 'pro_monthly' } = req.body;

  if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
  }

  const priceId = PRICES[plan];
    if (!priceId) {
          console.error(`Missing price ID for plan "${plan}". Set STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL in Vercel env vars.`);
          return res.status(500).json({ error: `Price not configured for plan: ${plan}. Please set the STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL environment variables in Vercel.` });
    }

  try {
        const session = await stripe.checkout.sessions.create({
                mode: 'subscription',
                payment_method_types: ['card'],
                line_items: [{ price: priceId, quantity: 1 }],

                // This is how stripe-webhook.js knows which Supabase user to upgrade
                client_reference_id: userId,

                success_url: 'https://scaledmoney.com/dashboard?upgraded=1',
                cancel_url:  'https://scaledmoney.com/upgrade?cancelled=1',

                subscription_data: {
                          metadata: { supabase_user_id: userId }
                },

                allow_promotion_codes: true,
        });

      return res.status(200).json({ url: session.url });

  } catch (err) {
        console.error('Stripe checkout error:', err);
        return res.status(500).json({ error: err.message });
  }
}
