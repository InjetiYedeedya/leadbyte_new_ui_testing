/**
 * A repeatable numeric id for a row keyed on `id (N)`.
 *
 * ## Why this exists
 *
 * Several of the backend's tables are keyed on a NUMERIC `id` rather than the
 * `email` that `getPartitionKeyName()` defaults to — the Frontend Check tables
 * and the agent-setup tables both are. Sending the email as the id produces
 * `Type mismatch for key id expected: N actual: S`, and sending nothing
 * produces `Missing the key id in the item`. Both were hit for real, in
 * different features, a day apart.
 *
 * ## Why derived rather than random
 *
 * Production rows carry random ids (`599317`, `848985`), which is why those
 * tables already hold duplicates: every save wrote a new row instead of
 * updating the account's own. Hashing the email means the same account always
 * lands on the same row, so saving again UPDATES it.
 *
 * FNV-style 32-bit rolling hash: same input, same output, in every process and
 * on every deploy. Not cryptographic and it does not need to be — a collision
 * would put two accounts on one row of one table, and the space is 4 billion
 * wide.
 */
export function numericRowId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}
