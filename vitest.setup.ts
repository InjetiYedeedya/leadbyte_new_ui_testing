import "@testing-library/jest-dom/vitest";

/**
 * jsdom implements neither of these, and both are needed to RENDER — not to
 * assert on, to render at all. A component that reaches for either one throws
 * during mount, so without these the component simply cannot be tested, which
 * is how the profile story arrived untestable.
 *
 * They are deliberately inert rather than clever: nothing is ever "in view"
 * and nothing ever resizes. A test that needs either behaviour should drive it
 * explicitly rather than rely on a fake that guesses.
 */
if (!("IntersectionObserver" in globalThis)) {
  class InertIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: readonly number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  globalThis.IntersectionObserver =
    InertIntersectionObserver as unknown as typeof IntersectionObserver;
}

if (!("ResizeObserver" in globalThis)) {
  class InertResizeObserver implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = InertResizeObserver as unknown as typeof ResizeObserver;
}
