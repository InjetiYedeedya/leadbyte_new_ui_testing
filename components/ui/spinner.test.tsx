import { render } from "@testing-library/react";
import { Spinner } from "./spinner";

/**
 * Small enough that the tests are about the two things a copy of it got wrong
 * before this existed: the colour, and reduced motion.
 */

describe("Spinner", () => {
  it("takes its colour from the text beside it", () => {
    // Three hand-written copies each hard-coded their own, which is why the
    // accent one had to be rewritten the first time a button changed colour.
    const { container } = render(<Spinner />);
    const ring = container.firstElementChild!;
    expect(ring.className).toContain("border-current");
    expect(ring.className).not.toMatch(/border-(ground|ink|accent)/);
  });

  it("stops rotating under reduced motion", () => {
    const { container } = render(<Spinner />);
    expect(container.firstElementChild!.className).toContain("motion-reduce:animate-none");
  });

  /** The button already carries `aria-busy`; a ring announced as well is noise. */
  it("is decorative", () => {
    const { container } = render(<Spinner />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("has a larger size for larger buttons", () => {
    const { container: sm } = render(<Spinner />);
    const { container: md } = render(<Spinner size="md" />);
    expect(sm.firstElementChild!.className).not.toBe(md.firstElementChild!.className);
  });

  /** In a flex row a ring with no `shrink-0` is squashed into an oval. */
  it("keeps its shape in a tight row", () => {
    const { container } = render(<Spinner />);
    expect(container.firstElementChild!.className).toContain("shrink-0");
  });

  /**
   * Width and height do not apply to a non-replaced INLINE element, and a bare
   * `<span>` is inline. So without a display of its own the size classes are
   * ignored and all that renders is the border — a 3px-wide dash the height of
   * the line.
   *
   * It looked right for a while by luck: every early caller put it inside an
   * `inline-flex`, which blockifies its children as flex items. The first one
   * without a flex parent — the ring beside a nav tab — drew the dash, and it
   * shipped, because nothing here asserted the one property that was being
   * borrowed from the parent.
   */
  it("carries its own display, so it does not depend on its parent", () => {
    const { container } = render(<Spinner />);
    const className = container.firstElementChild!.className;
    expect(className).toMatch(/\b(inline-block|block|flex|inline-flex)\b/);
  });
});
