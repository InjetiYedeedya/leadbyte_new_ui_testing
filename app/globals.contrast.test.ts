import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The palette, as arithmetic.
 *
 * ## Why this test exists
 *
 * A design audit (2026-09-10) found that every NAMED token pairing passed WCAG
 * AA and every alpha-modified derivative failed — placeholders at 2.49:1,
 * badge text at 2.81:1, two focus indicators implemented as a 1.13:1
 * background change. Nothing had gone wrong in review; there was simply no
 * mechanism that could notice, because a ratio is not visible by reading a
 * class name.
 *
 * So this reads the real `@theme` block and does the sums. It fails on the
 * value, not on the spelling — a future `--color-warn` that looks fine and
 * misses 4.5:1 by 0.08 (which is exactly what happened) stops here.
 *
 * ## What it does not cover
 *
 * Pairings nobody uses. The list below is the set the app actually renders,
 * so adding a token is not a failure — pairing it against something is what
 * needs a line here.
 */

const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

/** Pulls a token straight out of the `@theme` block, so the test reads truth. */
function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS);
  if (!match) throw new Error(`--color-${name} not found in app/globals.css`);
  return match[1]!;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio, rounded to 2dp the way the spec's examples are. */
function ratio(fg: string, bg: string): number {
  const a = luminance(rgb(fg));
  const b = luminance(rgb(bg));
  const value = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return Math.round(value * 100) / 100;
}

/** What Tailwind's `/NN` opacity modifier actually paints, composited. */
function withAlpha(fg: string, bg: string, alpha: number): string {
  const f = rgb(fg);
  const b = rgb(bg);
  const mixed = f.map((c, i) => Math.round(c * alpha + b[i]! * (1 - alpha)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const AA_NORMAL = 4.5;
/** 1.4.11: the boundary that identifies a control, and focus indicators. */
const AA_NON_TEXT = 3;

describe("token pairings the app renders", () => {
  const surfaces = ["surface", "ground", "surface-raised"] as const;

  it.each(surfaces)("ink reads on %s", (bg) => {
    expect(ratio(token("ink"), token(bg))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(surfaces)("ink-soft reads on %s", (bg) => {
    expect(ratio(token("ink-soft"), token(bg))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(["good", "warn", "crit", "info"] as const)(
    "%s reads on its own -soft background",
    (tone) => {
      expect(ratio(token(tone), token(`${tone}-soft`))).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  /*
   * The Overview intro.
   *
   * It had a tinted wash and these asserted against it. The wash is gone —
   * it was the "large blue banner" a design review named as the problem — so
   * the intro now sits on the page background like everything else, and this
   * asserts the pairing it actually uses. `accent-ink` is in the list because
   * the site link and the scroll cue are both set in it.
   */
  it.each(["ink", "ink-soft", "accent-ink"] as const)(
    "%s reads on the page background, where the Overview intro sits",
    (fg) => {
      expect(ratio(token(fg), token("ground"))).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(["good", "warn", "crit", "info"] as const)(
    "%s reads on surface-raised, where the audit screens put it",
    (tone) => {
      expect(ratio(token(tone), token("surface-raised"))).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );

  it.each(["accent", "good", "crit"] as const)("a white label reads on the %s fill", (fill) => {
    // Was `bg-accent text-ground`. `ground` is a tinted page colour now, and
    // a label on a solid fill wants pure white — so every one of those 79
    // buttons says `text-surface`, and this checks the three fills that carry
    // one. Tying the label to `ground` is what kept the page near-white.
    expect(ratio(token("surface"), token(fill))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("no component still paints a label with the page colour", () => {
    // `text-ground` on a coloured fill would now be tinted-on-tinted. A grep,
    // because a ratio cannot see a class name.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of require("node:fs").readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx$/.test(entry.name) && !entry.name.includes(".test.")) {
          if (/text-ground/.test(readFileSync(path, "utf8"))) offenders.push(path);
        }
      }
    };
    walk(join(process.cwd(), "components"));
    walk(join(process.cwd(), "app"));
    expect(offenders).toEqual([]);
  });

  it.each(["accent", "accent-ink"] as const)("%s reads as link text on surface", (tone) => {
    expect(ratio(token(tone), token("surface"))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it.each(["accent", "accent-ink", "ink", "ink-soft"] as const)(
    "%s reads on accent-soft, which carries label text and not just tint",
    (tone) => {
      // `accent-soft` exists so the brand can be a background — a count badge,
      // a panel header. The moment it is only decorative it will get text put
      // on it anyway, so it is held to the text floor from the start.
      expect(ratio(token(tone), token("accent-soft"))).toBeGreaterThanOrEqual(AA_NORMAL);
    },
  );
});

describe("alpha-modified text", () => {
  /**
   * The failure this file was written for. `text-ink-soft/60` on white is
   * 2.49:1 — it looked like a softer grey and was a WCAG failure. Every such
   * site now uses the full token; this asserts the alphas stay unused rather
   * than trusting anyone to remember why.
   */
  it.each([0.6, 0.7])("ink-soft at %s alpha does NOT reach AA on surface", (alpha) => {
    const composited = withAlpha(token("ink-soft"), token("surface"), alpha);
    expect(ratio(composited, token("surface"))).toBeLessThan(AA_NORMAL);
  });

  it("ink-soft at 0.8 alpha clears AA, which is not permission to use it", () => {
    // It used to fail here. The vibrant palette (2026-09-18) brought the
    // composite to exactly 4.5:1, and the darker `ink-soft` (2026-10-12, for
    // the frosted card) to about 5.8:1 — so the arithmetic that once proved
    // faded text unreadable no longer does.
    //
    // Asserted as the truth rather than left as a passing-by-luck line. The
    // grep below is what actually keeps faded text out of the app, and it
    // bans every alpha.
    const composited = withAlpha(token("ink-soft"), token("surface"), 0.8);
    expect(ratio(composited, token("surface"))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("no component uses a sub-AA ink-soft alpha for text", () => {
    // The guard that actually protects the app: a grep, because the ratio
    // above cannot see a class string.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of require("node:fs").readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx$/.test(entry.name) && !entry.name.includes(".test.")) {
          const src = readFileSync(path, "utf8");
          if (/text-ink-soft\/(1|2|3|4|5|6|7)\d?\b/.test(src)) offenders.push(path);
        }
      }
    };
    walk(join(process.cwd(), "components"));
    walk(join(process.cwd(), "app"));
    expect(offenders).toEqual([]);
  });
});

describe("non-text contrast", () => {
  it("the focus ring is distinguishable from the surface it sits on", () => {
    // `outline-accent` is the app's one focus colour. A focus indicator is
    // non-text and needs 3:1 (1.4.11).
    for (const bg of ["surface", "ground", "surface-raised"] as const) {
      expect(ratio(token("accent"), token(bg))).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  /**
   * `border` on `surface` is 1.28:1 and this test says so out loud rather than
   * asserting it passes.
   *
   * It is the boundary of every text input, which 1.4.11 wants at 3:1 — and it
   * is also the hairline that keeps the app from looking assembled from a kit.
   * That trade-off is a live decision (see the design audit), so this asserts
   * the CURRENT value: if someone darkens the token, this fails and they are
   * made to come and delete the test on purpose.
   */
  it("documents that the hairline border is deliberately below 3:1", () => {
    expect(ratio(token("border"), token("surface"))).toBeLessThan(AA_NON_TEXT);
  });
});
