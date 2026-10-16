// The test files use `describe`, `it`, `expect` and `vi` without importing
// them — `globals: true` in vitest.config.ts puts them there at run time. This
// line tells TypeScript (and the editor) about the same globals, so a test file
// no longer shows "Cannot find name 'describe'" on every line.
/// <reference types="vitest/globals" />
