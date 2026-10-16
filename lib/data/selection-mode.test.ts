import { readSelectionMode, SELECTION_MODES } from "@/lib/data/selection-mode";

/**
 * The asymmetry is the whole point: "auto" spends without a confirmation step,
 * so it must be chosen explicitly and can never be arrived at by accident.
 */

describe("readSelectionMode", () => {
  it("reads the two answers the dialog can give", () => {
    expect(readSelectionMode("ask")).toBe("ask");
    expect(readSelectionMode("auto")).toBe("auto");
  });

  it("resolves anything else to ask, never to auto", () => {
    // A missing, empty, misspelt or forged value must not be the one that
    // creates a campaign without showing anyone the plan.
    for (const value of [undefined, null, "", "AUTO", "Auto", "yes", 1, {}, ["auto"]]) {
      expect(readSelectionMode(value)).toBe("ask");
    }
  });
});

describe("SELECTION_MODES", () => {
  it("offers exactly the two the backend understands", () => {
    expect(SELECTION_MODES.map((m) => m.value)).toEqual(["ask", "auto"]);
  });

  it("says what each one does, since one of them spends money unattended", () => {
    for (const mode of SELECTION_MODES) {
      expect(mode.label.length).toBeGreaterThan(0);
      expect(mode.description.length).toBeGreaterThan(0);
    }
  });
});
