import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  TOPICS_MAX,
  copyProblems,
  parseGenerated,
  readCopyForm,
} from "./ads-copy";

/**
 * The limits here are the service's own, read from its `validation.py`. They
 * matter because of HOW it enforces them: anything longer is trimmed and the
 * trim is reported as a note, so a headline written past the limit is not
 * refused — it is silently cut, and the advert that runs is one the customer
 * never saw. Catching it here is what makes what they approve what goes out.
 */

const GENERATED = {
  title: "LeadByte: Automate Your Marketing Workflows",
  title_length: 43,
  description: "LeadByte simplifies your marketing with AI automation.",
  description_length: 53,
  topics: ["ai marketing automation", "lead qualification"],
  attempts: 1,
  notes: [],
  brief_source: "stored" as const,
};

function form(values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : [value]) data.append(name, entry);
  }
  return data;
}

describe("the limits are the service's", () => {
  it("matches what the Lambda enforces", () => {
    expect(TITLE_MAX).toBe(50);
    expect(DESCRIPTION_MAX).toBe(100);
  });
});

describe("parseGenerated", () => {
  it("reads a real generate reply", () => {
    expect(parseGenerated(GENERATED)).toEqual({
      title: GENERATED.title,
      description: GENERATED.description,
      topics: GENERATED.topics,
    });
  });

  it("survives a reply missing the fields it should have", () => {
    expect(parseGenerated({})).toEqual({ title: "", description: "", topics: [] });
    expect(parseGenerated({ topics: ["ok", 7 as never, null as never] }).topics).toEqual(["ok"]);
  });
});

describe("copyProblems", () => {
  const copy = (over: Partial<ReturnType<typeof parseGenerated>> = {}) => ({
    ...parseGenerated(GENERATED),
    ...over,
  });

  it("passes an advert that can run", () => {
    expect(copyProblems(copy())).toEqual([]);
  });

  it("catches copy the service would cut", () => {
    const long = copyProblems(copy({ title: "x".repeat(TITLE_MAX + 1) }));
    expect(long[0]!.field).toBe("headline");
    expect(long[0]!.message).toContain(String(TITLE_MAX));

    expect(copyProblems(copy({ description: "y".repeat(DESCRIPTION_MAX + 1) }))[0]!.field).toBe(
      "description",
    );
  });

  it("accepts copy exactly at the limit", () => {
    expect(copyProblems(copy({ title: "x".repeat(TITLE_MAX) }))).toEqual([]);
  });

  it("refuses an advert with nothing to appear against", () => {
    // Topics are the ONLY targeting this platform offers, so an empty list is
    // not a weaker campaign — it is one with no audience.
    expect(copyProblems(copy({ topics: [] }))[0]!.field).toBe("context_hints");
    expect(copyProblems(copy({ topics: ["  "] }))[0]!.field).toBe("context_hints");
  });

  it("names every problem at once", () => {
    expect(copyProblems({ title: "", description: "", topics: [] })).toHaveLength(3);
  });
});

describe("readCopyForm", () => {
  it("reads the edited advert back", () => {
    expect(
      readCopyForm(
        form({ headline: " Edited ", description: " Body ", topics: ["one", "two"] }),
      ),
    ).toEqual({ title: "Edited", description: "Body", topics: ["one", "two"] });
  });

  /** The same topic twice is not twice the targeting. */
  it("drops blanks and duplicates", () => {
    expect(readCopyForm(form({ topics: ["one", "", "one", "  ", "two"] })).topics).toEqual([
      "one",
      "two",
    ]);
  });

  it("caps the list rather than storing an unbounded one", () => {
    const many = Array.from({ length: TOPICS_MAX + 5 }, (_, i) => `topic-${i}`);
    expect(readCopyForm(form({ topics: many })).topics).toHaveLength(TOPICS_MAX);
  });
});
