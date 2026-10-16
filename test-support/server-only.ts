// Test stand-in for the `server-only` marker package, which throws when
// imported outside a React Server environment. The real guard applies to the
// Next.js build; unit tests import server modules directly on purpose.
export {};
