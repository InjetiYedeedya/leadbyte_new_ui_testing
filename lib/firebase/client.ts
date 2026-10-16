/**
 * Firebase Web SDK initialisation, browser-side only.
 *
 * These three values are `NEXT_PUBLIC_` on purpose — Firebase web API keys are
 * public identifiers, not secrets. The Firebase *Admin* credentials live only
 * in the backend Lambda and must never appear in this app.
 *
 * When they are unset, `getFirebaseAuth()` returns null rather than throwing,
 * and the auth form falls back to mock sign-in. An unconfigured environment is
 * a working environment — the same principle as `isBackendConfigured()`.
 */

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
};

export function isFirebaseConfigured(): boolean {
  return (
    config.apiKey.length > 0 && config.authDomain.length > 0 && config.projectId.length > 0
  );
}

/**
 * Returns the Auth instance, or null when Firebase is not configured.
 *
 * `getApps()` is checked rather than a module-level flag because React strict
 * mode and Fast Refresh both re-run module bodies in development, and
 * `initializeApp` throws on a duplicate app name.
 */
export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseConfigured()) return null;
  const app: FirebaseApp = getApps()[0] ?? initializeApp(config);
  return getAuth(app);
}
