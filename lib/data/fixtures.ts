import { isBackendConfigured } from "@/lib/api/config";

/**
 * Whether demo fixtures may be shown at all.
 *
 * The mock repositories exist so the whole app works with no backend
 * configured — that is a supported mode, not a broken one. But the moment a
 * real backend IS configured, every screen must show that account's own data or
 * an honest empty state, and never a fixture.
 *
 * Keying fixtures to the seeded `novaflow` business got most of the way there,
 * and it is not enough on its own: it is incidental protection that depends on
 * nobody's account id colliding with the demo's, and it did not stop
 * `activate()` copying the demo's activity into a real account — which is
 * exactly the bug this now prevents structurally.
 *
 * So: seeded business AND no backend. Both, or nothing.
 */
export function fixturesAllowed(): boolean {
  return !isBackendConfigured();
}
