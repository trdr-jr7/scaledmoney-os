// ============================================================
// lib/supabase-client.js
// Shared Supabase client — import into every tool page.
//
// SETUP: Replace the two placeholder values below with your
// actual values from Supabase Dashboard → Settings → API
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL     = 'https://tvjrzidpeccirpqjpsjb.supabase.co';      // e.g. https://xyzxyz.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2anJ6aWRwZWNjaXJwcWpwc2piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNTMzNDIsImV4cCI6MjA4NzYyOTM0Mn0.O1xudg2Q7ndqzXHECNMMZaMavkAyEhLLRXqemfNjaic'; // starts with eyJ...

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:    true,   // keeps user logged in across page loads
    autoRefreshToken:  true,
    detectSessionInUrl: true,  // handles email confirm redirect
    storageKey: 'scaledmoney-auth',
  }
});

// ── CONVENIENCE HELPERS ─────────────────────────────────────

/** Returns the current session user, or null if not logged in. */
export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Returns the user's tier ('free' | 'pro'). Defaults to 'free'. */
export async function getUserTier() {
  const user = await getUser();
  if (!user) return 'free';

  const { data, error } = await supabase
    .from('member_tiers')
    .select('tier')
    .eq('user_id', user.id)
    .single();

  if (error || !data) return 'free';
  return data.tier;
}

/** Redirect to login page if user is not authenticated. */
export async function requireAuth(redirectTo = '/login') {
  const user = await getUser();
  if (!user) {
    window.location.href = `${redirectTo}?next=${encodeURIComponent(window.location.pathname)}`;
    return null;
  }
  return user;
}

/** Redirect to login page if user is not Pro. */
export async function requirePro(redirectTo = '/login') {
  const user = await requireAuth(redirectTo);
  if (!user) return null;
  const tier = await getUserTier();
  if (tier !== 'pro') {
    window.location.href = '/upgrade';
    return null;
  }
  return user;
}

/** Sign out and redirect. */
export async function signOut(redirectTo = '/login') {
  await supabase.auth.signOut();
  window.location.href = redirectTo;
}

// ── SPRINT PLAN PERSISTENCE ──────────────────────────────────

/**
 * Save a sprint plan to Supabase.
 * @param {number} slot  — 0, 1, or 2
 * @param {object} snap  — full snapshot object from buildSnapshot()
 */
export async function saveSprintPlan(slot, snap) {
  const user = await getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('sprint_plans')
    .upsert({
      user_id:     user.id,
      slot,
      sprint_num:  snap.sprintNum  ? parseInt(snap.sprintNum) : null,
      sprint_goal: snap.sprintGoal || null,
      start_date:  snap.startDate  ? snap.startDate.split('T')[0] : null,
      end_date:    snap.endDate    ? snap.endDate.split('T')[0]   : null,
      length_days: snap.sprintLength || null,
      plan_data:   snap,
      saved_at:    new Date().toISOString(),
    }, { onConflict: 'user_id,slot' });

  if (error) throw error;
}

/**
 * Load all sprint plans for the current user.
 * Returns array of up to 3 snapshot objects, indexed by slot.
 */
export async function loadSprintPlans() {
  const user = await getUser();
  if (!user) return [null, null, null];

  const { data, error } = await supabase
    .from('sprint_plans')
    .select('slot, plan_data, saved_at')
    .eq('user_id', user.id)
    .order('slot');

  if (error || !data) return [null, null, null];

  const slots = [null, null, null];
  data.forEach(row => {
    if (row.slot >= 0 && row.slot <= 2) {
      slots[row.slot] = row.plan_data;
    }
  });
  return slots;
}

/**
 * Delete a single sprint plan slot.
 */
export async function deleteSprintPlan(slot) {
  const user = await getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('sprint_plans')
    .delete()
    .eq('user_id', user.id)
    .eq('slot', slot);

  if (error) throw error;
}
