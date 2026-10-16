import { activeIndexAt, leadOpacityAt, scrollToStackItem } from "./scroll-stack";

describe("activeIndexAt (LBS-1249)", () => {
  // The live Business profile at 681px: Brand lands at 650, Competitors at 1238, both pinned at 115.
  const landings = [112, 650, 1238];
  const pins = [115, 115, 115];

  it("lights the arriving card once it reaches the middle of the screen, not only when it pins", () => {
    // Competitors' top is at 290px here, Brand has already faded: the reader is on Competitors.
    expect(activeIndexAt(1062, landings, pins, 681)).toBe(2);
    expect(activeIndexAt(1238, landings, pins, 681)).toBe(2);
  });

  it("keeps the current card while the next is still in the lower half", () => {
    expect(activeIndexAt(900, landings, pins, 681)).toBe(1);
    expect(activeIndexAt(0, landings, pins, 681)).toBe(0);
  });

  it("falls back to the landing before the screen is measured", () => {
    expect(activeIndexAt(1100, landings, pins, 0)).toBe(1);
    expect(activeIndexAt(1238, landings, pins, 0)).toBe(2);
  });
});

describe("scrollToStackItem (2026-10-08)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("scrolls just past the item's landing, where the rail lights it", () => {
    document.body.innerHTML = `<section id="chapter-competitors" data-stack-landing="1800"></section>`;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    expect(scrollToStackItem("chapter-competitors", false)).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 1801, behavior: "auto" });
    expect(location.hash).toBe("#chapter-competitors");
  });

  it("leaves the plain anchor alone when the item is not stacked", () => {
    document.body.innerHTML = `<section id="chapter-brand"></section>`;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    expect(scrollToStackItem("chapter-brand", true)).toBe(false);
    expect(scrollToStackItem("missing", true)).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe("leadOpacityAt (2026-10-13)", () => {
  // The lead's text ends at 500px; one card flows at 900 and pins at 520,
  // under it (a docked card); a tall one flows at 1600 and pins at 150.
  const cards = [
    { flowTop: 900, pin: 520 },
    { flowTop: 1600, pin: 150 },
  ];

  it("keeps the lead whole while every card is below its text", () => {
    expect(leadOpacityAt(0, cards, 500)).toBe(1);
    // The first card docked under the text: still nothing over it.
    expect(leadOpacityAt(600, cards, 500)).toBe(1);
  });

  it("fades the lead as a card climbs over its text, and hides it once covered", () => {
    // The tall card's top reaches 452: 48px over the text, half the span.
    expect(leadOpacityAt(1148, cards, 500)).toBeCloseTo(0.5);
    expect(leadOpacityAt(1400, cards, 500)).toBe(0);
    // Scrolled back: the lead returns.
    expect(leadOpacityAt(300, cards, 500)).toBe(1);
  });

  it("stops counting a card once the next one has covered it", () => {
    const withExits = [
      { flowTop: 1600, pin: 150, goneAt: 2000 },
      { flowTop: 2600, pin: 520, goneAt: null },
    ];
    expect(leadOpacityAt(1500, withExits, 500)).toBe(0);
    // The tall card is gone; the docked one sits under the text.
    expect(leadOpacityAt(2100, withExits, 500)).toBe(1);
  });

  it("does nothing without cards to measure", () => {
    expect(leadOpacityAt(5000, [], 500)).toBe(1);
  });
});
