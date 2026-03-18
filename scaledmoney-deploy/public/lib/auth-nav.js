// ============================================================
// lib/auth-nav.js
// Shared auth-aware navigation — toggles Login/Join to Logout
// Include on any page: <script type="module" src="/lib/auth-nav.js"></script>
// ============================================================
import { supabase, getUser } from '/lib/supabase-client.js';

(async () => {
  try {
    const user = await getUser();

    // Find the login element — supports both nav patterns:
    //   .login-pill  (dashboard, framework, graduation)
    //   #authLink    (upgrade page)
    const el = document.querySelector('.login-pill') || document.getElementById('authLink');
    if (!el) return;

    if (user) {
      // ── Logged in: show power-icon logout button ──
      el.href = '/logout';
      el.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>' +
          '<line x1="12" y1="2" x2="12" y2="12"/>' +
        '</svg>' +
        'Logout</span>';
      el.title = 'Sign out of ScaledMoney|OS';

      // Remove any disabled state or click handlers that might interfere
      el.removeAttribute('onclick');
    }
    // If not logged in, leave the element as-is (Login / Join)
  } catch (e) {
    // Silently fail — don't break the page if auth check fails
    console.warn('[auth-nav] Auth check failed:', e.message);
  }
})();
