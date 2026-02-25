// api/create-checkout.js
// Creates a Stripe Checkout session for the Pro upgrade flow.
// Called by the pricing/upgrade page after the user is authenticated.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── Your Stripe Price IDs — update after creating products in Stripe dashboard ──
const PRICES = {
  pro_monthly: 'price_REPLACE_WITH_YOUR_MONTHLY_PRICE_ID',  // e.g. $9.99/mo
  pro_annual:  'price_REPLACE_WITH_YOUR_ANNUAL_PRICE_ID',   // e.g. $79/yr
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, plan = 'pro_monthly' } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const priceId = PRICES[plan];
  if (!priceId) {
    return res.status(400).json({ error: `Unknown plan: ${plan}` });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode:               'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],

      // This is how stripe-webhook.js knows which Supabase user to upgrade
      client_reference_id: userId,

      success_url: 'https://scaledmoney.com/tools/sprint-planner?upgraded=1',
      cancel_url:  'https://scaledmoney.com/upgrade?cancelled=1',

      // Pre-fill email if you have it (optional — retrieve from Supabase first)
      // customer_email: userEmail,

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
