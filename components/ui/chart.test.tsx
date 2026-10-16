import { render } from "@testing-library/react";
import { LineChart } from "./chart";

function days(count: number) {
  return Array.from({ length: count }, (_, i) => ({ label: `${i + 1} Sept`, value: i }));
}

function labels(container: HTMLElement): string[] {
  return [...container.querySelectorAll("text")].map((node) => node.textContent ?? "");
}

describe("LineChart date axis", () => {
  /**
   * The last date always carries a label — it is the "how recent is this"
   * answer. The bug this covers drew the strided label one point before it on
   * top of it: at 38 points the stride is 6, so index 36 and index 37 were both
   * labelled, and "37 Sept" sat over "38 Sept" at tablet width.
   */
  it("never labels a date close enough to collide with the last one", () => {
    const { container } = render(<LineChart points={days(38)} />);
    const dates = labels(container).filter((text) => text.endsWith("Sept"));
    expect(dates).toContain("38 Sept");
    expect(dates).not.toContain("37 Sept");
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("labels every point on a short axis", () => {
    const { container } = render(<LineChart points={days(6)} />);
    const dates = labels(container).filter((text) => text.endsWith("Sept"));
    expect(dates).toHaveLength(6);
  });
});
