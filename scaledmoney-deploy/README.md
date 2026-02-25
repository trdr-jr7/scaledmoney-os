# ScaledMoney|OS™ — Deployment Guide

Domains: **scaledmoney.com** · **theleandollar.com**  
Stack: Vercel · Supabase · Stripe

---

## Folder Structure

```
scaledmoney-deploy/
├── vercel.json                          ← routing, security headers
├── package.json                         ← Stripe + Supabase deps
├── supabase/
│   └── schema.sql                       ← run once in Supabase SQL Editor
├── api/
│   └── stripe-webhook.js                ← serverless function
└── public/
    ├── login.html
    ├── logout.html
    ├── scaledmoney-os-level1.html        ← copy from Claude outputs
    ├── lib/
    │   └── supabase-client.js            ← shared auth + DB client
    └── tools/
        ├── lean-dollar-sprint-budget-planner.html
        ├── lean-dollar-gap-audit.html
        └── lean-dollar-true-cost-engine-v2.html
```

---

## Sprint 1 — Supabase Setup (30 min)

### 1. Get your API keys
Supabase Dashboard → Settings → API

Copy:
- **Project URL** — `https://xxxxxxxx.supabase.co`
- **anon / public key** — starts with `eyJ...`
- **service_role key** — starts with `eyJ...` (keep secret — server-side only)

### 2. Update supabase-client.js
Open `public/lib/supabase-client.js` and replace:
```
'YOUR_SUPABASE_URL'      →  your Project URL
'YOUR_SUPABASE_ANON_KEY' →  your anon/public key
```

### 3. Run the schema
Supabase Dashboard → SQL Editor → New Query  
Paste the entire contents of `supabase/schema.sql` → Run

This creates:
- `member_tiers` table (free/pro per user)
- `sprint_plans` table (up to 3 saved sprints per user)
- `profiles` table (display name, pay cadence)
- Row Level Security policies (users can only see their own data)
- Auto-trigger: creates a free tier row when any new user signs up

### 4. Enable Email Auth
Supabase Dashboard → Authentication → Providers → Email  
✓ Enable email provider  
✓ Confirm email = ON (recommended)  
Set **Site URL** to: `https://scaledmoney.com`  
Add to **Redirect URLs**: `https://scaledmoney.com/tools/sprint-planner`

---

## Sprint 2 — Vercel Setup (20 min)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "initial deploy"
git remote add origin https://github.com/YOUR_USERNAME/scaledmoney-os.git
git push -u origin main
```

### 2. Connect to Vercel
Vercel Dashboard → Add New Project → Import from GitHub  
Select your repo → Framework: **Other** → Deploy

### 3. Add Environment Variables
Vercel Dashboard → Project → Settings → Environment Variables

Add each of these:

| Variable | Value | Where to get it |
|---|---|---|
| `supabase_url` | `https://xxx.supabase.co` | Supabase → Settings → API |
| `supabase_anon_key` | `eyJ...` | Supabase → Settings → API |
| `supabase_service_key` | `eyJ...` | Supabase → Settings → API (service_role) |
| `stripe_secret_key` | `sk_live_...` | Stripe Dashboard → API keys |
| `stripe_webhook_secret` | `whsec_...` | Stripe Dashboard → Webhooks (step below) |

### 4. Connect Your Domains
Vercel Dashboard → Project → Settings → Domains

Add:
- `scaledmoney.com` → set A record to `76.76.21.21` at your registrar
- `www.scaledmoney.com` → CNAME to `cname.vercel-dns.com`
- `theleandollar.com` → same A record
- `www.theleandollar.com` → same CNAME

Vercel provisions HTTPS automatically within ~2 minutes.

---

## Sprint 3 — Stripe Setup (30 min, after Stripe account is live)

### 1. Create your Product
Stripe Dashboard → Products → Add Product  
- Name: `Lean Dollar Pro`  
- Pricing: Recurring · $9.99/month (and/or $79/year)  
- Copy the **Price ID** — looks like `price_1ABC...`

### 2. Create a Checkout page
Add a button to your pricing page that creates a Stripe Checkout session.  
The critical field is `client_reference_id` — set it to the Supabase user ID.

```javascript
// In your pricing page (runs after user is signed in)
import { supabase } from '/lib/supabase-client.js';

async function checkout() {
  const { data: { user } } = await supabase.auth.getUser();
  
  // Call a Vercel function (api/create-checkout.js) that creates the session
  const res = await fetch('/api/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.id })
  });
  const { url } = await res.json();
  window.location.href = url;
}
```

### 3. Register the Stripe Webhook
Stripe Dashboard → Developers → Webhooks → Add Endpoint  
- Endpoint URL: `https://scaledmoney.com/api/stripe-webhook`  
- Events to listen for:
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.subscription.deleted`

Copy the **Signing Secret** (`whsec_...`) → paste into Vercel env var `stripe_webhook_secret`

---

## Sprint 4 — Update the Sprint Budget Planner (1–2 hrs)

The Sprint Budget Planner currently uses `window.storage` (Claude artifact API).  
Replace with the Supabase client functions already built in `lib/supabase-client.js`.

Two changes in `lean-dollar-sprint-budget-planner.html`:

**1. Add import at top of the `<script type="module">` block:**
```javascript
import { supabase, getUserTier, requireAuth, saveSprintPlan, loadSprintPlans } from '/lib/supabase-client.js';
```

**2. Replace `saveSprint()` function:**
```javascript
async function saveSprint() {
  const snap = buildSnapshot(activeSprint);
  try {
    await saveSprintPlan(activeSprint, snap);
    sprintSlots[activeSprint] = snap;
    updateSprintTabs();
    showSaveIndicator('✓ Sprint ' + (activeSprint + 1) + ' saved', 'var(--em)');
  } catch(e) {
    showSaveIndicator('Save failed: ' + e.message, 'var(--danger)');
  }
}
```

**3. Replace `loadSavedSprints()` function:**
```javascript
async function loadSavedSprints() {
  try {
    const slots = await loadSprintPlans();
    slots.forEach((snap, i) => { sprintSlots[i] = snap; });
    updateSprintTabs();
  } catch(e) {
    console.error('Load failed:', e);
  }
}
```

**4. Replace `enterPlanner()` to use real auth:**
```javascript
async function enterPlanner() {
  // Check real auth state
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    window.location.href = '/login?next=/tools/sprint-planner';
    return;
  }
  const tier = await getUserTier();
  memberTier = tier;
  
  // Show member bar, hide gate
  document.getElementById('member-gate').style.display = 'none';
  document.getElementById('member-bar').style.display = 'flex';
  // ... rest of existing enterPlanner() logic
}
```

---

## Security Checklist Before Going Live

- [ ] `supabase_service_key` is only in Vercel env vars — never in frontend code
- [ ] RLS is enabled on all three Supabase tables (schema.sql does this)
- [ ] Stripe webhook signature verification is active (stripe-webhook.js does this)
- [ ] HTTPS is active on both domains (Vercel does this automatically)
- [ ] Security headers are set (vercel.json does this)
- [ ] Email confirmation is ON in Supabase auth settings
- [ ] `window.storage` calls are removed from the Sprint Budget Planner
- [ ] Terms of Service and Privacy Policy pages are live at `/terms` and `/privacy`
- [ ] Disclaimer page is live at `/disclaimer`

---

## Estimated Costs at Launch

| Service | Free Tier Limit | Paid Tier |
|---|---|---|
| Vercel | 100GB bandwidth/mo | $20/mo Pro |
| Supabase | 500MB DB, 50k MAU | $25/mo Pro |
| Stripe | None | 2.9% + $0.30/transaction |
| Domains | — | ~$25/yr combined |

At < 500 users you pay nothing except Stripe's transaction fee.

---

## Questions?
All config files were generated specifically for:
- Domains: `scaledmoney.com` / `theleandollar.com`
- Auth: Supabase email/password
- Hosting: Vercel
- Payments: Stripe (webhook-based tier upgrade)
