/**
 * Pins a piece of mutable, in-memory mock state to the real Node.js
 * global object instead of a plain module-level variable.
 *
 * Why this exists: Next.js's dev server can compile the same module into
 * more than one bundle (one per route segment that imports it), which
 * means a plain `const state = {}` at module scope is not guaranteed to
 * be the *same* object across two different server actions in different
 * routes — even though it always is in a production build. This was a
 * real, reproducible bug: a gate set in one route's action was
 * occasionally invisible to another route's action reading it back.
 * `globalThis` is the one thing guaranteed to be a true process-wide
 * singleton regardless of how many module instances exist, so pinning
 * state there — the same idiom commonly used for a dev-mode Prisma
 * client singleton — makes every mock repo's in-memory state reliable
 * across routes in dev mode, not just in production.
 */
export function devGlobal<T>(key: string, init: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const fullKey = `__leadbyte_${key}`;
  if (g[fullKey] === undefined) {
    g[fullKey] = init();
  }
  return g[fullKey] as T;
}
