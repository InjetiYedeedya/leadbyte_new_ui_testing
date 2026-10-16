import { render } from "@testing-library/react";
import { CardColumns, SpanAllColumns } from "./card-columns";

describe("CardColumns", () => {
  it("spaces cards with a bottom margin and pulls the last one back", () => {
    const { container } = render(
      <CardColumns>
        <div>one</div>
      </CardColumns>,
    );
    const board = container.firstElementChild!;
    expect(board.className).toContain("[&>*]:mb-4");
    expect(board.className).toContain("-mb-4");
  });
});

describe("SpanAllColumns", () => {
  /**
   * Measured on a real account (2026-09-21): the longest column ended at
   * 1415px and the full-width card began at 1415px exactly, touching it,
   * while every other gap on the board was 16px. A column box ends flush
   * with its content, so the last card's `mb-4` is dropped at the fragment
   * boundary and cannot space the spanning card below it.
   */
  it("carries its own top margin, because the column above cannot supply one", () => {
    const { container } = render(
      <SpanAllColumns>
        <div>wide</div>
      </SpanAllColumns>,
    );
    const wrapper = container.firstElementChild!;
    expect(wrapper.className).toContain("mt-4");
    expect(wrapper.className).toContain("[column-span:all]");
  });
});
