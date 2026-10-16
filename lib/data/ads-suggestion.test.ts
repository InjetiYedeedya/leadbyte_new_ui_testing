import { parseSuggestion, readSuggestion } from "@/lib/data/ads-suggestion";

/** The agent's real reply, from a live run on 2026-09-04. */
const OUTPUT = `Recommended Campaign Type(s)
- Search
Objective of the campaign: Lead generation
Ad goal: Leads
Bidding Strategy: Maximize conversions (use when aiming for the highest number of leads)
Budget Allocation Logic: 100% to Search campaign
Key Risk + Mitigation:
- Risk of low call volume; mitigate by optimizing ad copy for call-to-action.
- Risk of high CPC; mitigate by refining keyword targeting.
Immediate Next Actions:
- Set up the Search campaign with targeted keywords related to travel.
- Create compelling ad copy emphasizing the 5% off offer.`;

describe("readSuggestion", () => {
  it("reads the live response shape", () => {
    const { output, userDetails } = readSuggestion([
      {
        output: OUTPUT,
        user_details: { "Business name": "ZippyGo", "Budget display": "$30 / day" },
        status: "complete",
        validation: true,
      },
    ]);

    expect(output).toContain("Recommended Campaign Type(s)");
    expect(userDetails["Business name"]).toBe("ZippyGo");
  });

  it("accepts the object form as well as n8n's single-element array", () => {
    expect(readSuggestion({ output: "hello" }).output).toBe("hello");
    expect(readSuggestion([{ output: "hello" }]).output).toBe("hello");
  });

  it("looks inside `data` when the Lambda nests it", () => {
    expect(readSuggestion({ success: true, data: { output: "nested" } }).output).toBe("nested");
  });

  it("returns empty rather than rendering [object Object]", () => {
    expect(readSuggestion(null).output).toBe("");
    expect(readSuggestion({ unexpected: true }).output).toBe("");
  });
});

describe("parseSuggestion", () => {
  const sections = parseSuggestion(OUTPUT);

  it("finds a heading by the bullets underneath it", () => {
    // "Recommended Campaign Type(s)" has no colon — it is a heading because a
    // bullet follows it.
    const types = sections.find((s) => s.title === "Recommended Campaign Type(s)");
    expect(types?.bullets).toEqual(["Search"]);
  });

  it("keeps a heading that carries its own answer whole", () => {
    // Splitting "Bidding Strategy: Maximize conversions" at the colon would
    // leave the heading and lose the answer.
    const bidding = sections.find((s) => s.title === "Bidding Strategy");
    expect(bidding?.body[0]).toContain("Maximize conversions");
  });

  it("groups the numbered next actions under their heading", () => {
    const actions = sections.find((s) => s.title === "Immediate Next Actions");
    expect(actions?.bullets).toHaveLength(2);
    expect(actions?.bullets[0]).toBe(
      "Set up the Search campaign with targeted keywords related to travel.",
    );
  });

  it("strips the bullet marker but not the sentence", () => {
    const risks = sections.find((s) => s.title === "Key Risk + Mitigation");
    expect(risks?.bullets[0]?.startsWith("Risk of low call volume")).toBe(true);
  });

  it("keeps unparsed text rather than dropping it", () => {
    // A plan that does not match the expected shape must still be readable.
    const odd = parseSuggestion("Just one line with no structure at all");
    expect(odd[0]?.body).toEqual(["Just one line with no structure at all"]);
  });

  it("returns nothing for an empty reply", () => {
    expect(parseSuggestion("")).toEqual([]);
  });
});

describe("parseSuggestion, when the agent writes Markdown", () => {
  it("drops heading hashes and paired emphasis", () => {
    const sections = parseSuggestion(
      ["## Recommended Campaign Type(s)", "- Search", "**Bidding Strategy:** Maximize conversions"].join("\n"),
    );

    expect(sections[0]?.title).toBe("Recommended Campaign Type(s)");
    expect(sections[1]?.title).toBe("Bidding Strategy");
    expect(sections[1]?.body).toEqual(["Maximize conversions"]);
  });

  it("still reads a lone asterisk as a bullet, not emphasis", () => {
    const sections = parseSuggestion(["Next Actions:", "* Set up the campaign"].join("\n"));

    expect(sections[0]?.bullets).toEqual(["Set up the campaign"]);
  });

  it("leaves an unmatched marker alone rather than guessing", () => {
    const sections = parseSuggestion("Budget is 50% of spend * 2");

    expect(sections[0]?.body).toEqual(["Budget is 50% of spend * 2"]);
  });
});

describe("parseSuggestion, on a Meta plan (LBS-1245)", () => {
  it("reads a bare heading over an empty bullet as its own, empty section", () => {
    const sections = parseSuggestion(
      ["Recommended Campaign Type(s)", "- Engagement", "Recommended Subgoal", "-", "Budget: 500"].join("\n"),
    );

    expect(sections.map((s) => s.title)).toEqual([
      "Recommended Campaign Type(s)",
      "Recommended Subgoal",
      "Budget",
    ]);
    expect(sections[0]?.body).toEqual([]);
    expect(sections[0]?.bullets).toEqual(["Engagement"]);
    expect(sections[1]?.body).toEqual(["Not specified"]);
    expect(sections[1]?.bullets).toEqual([]);
  });

  it("knows a plan label with no colon and nothing under it", () => {
    const sections = parseSuggestion(["Recommended Subgoal", "Bidding Strategy: Lowest cost"].join("\n"));

    expect(sections[0]?.title).toBe("Recommended Subgoal");
    expect(sections[0]?.body).toEqual(["Not specified"]);
    expect(sections[1]?.title).toBe("Bidding Strategy");
  });

  it("reads an en dash as a bullet marker", () => {
    const sections = parseSuggestion(["Placements:", "– Feeds", "– Reels"].join("\n"));

    expect(sections[0]?.bullets).toEqual(["Feeds", "Reels"]);
  });

  it("keeps the workflow's own Accept/Reject verdicts out of the plan", () => {
    const sections = parseSuggestion(
      [
        "Recommended Campaign Type(s)",
        "- Traffic",
        "Reject: Sales objective needs a pixel",
        "- Reject: Leads (no form)",
        "Accept: Traffic",
      ].join("\n"),
    );

    expect(sections).toHaveLength(1);
    expect(sections[0]?.bullets).toEqual(["Traffic"]);
    expect(sections[0]?.body).toEqual([]);
  });
});

describe("the legacy spec's four reply shapes", () => {
  it("reads the plain-text plan with its user details", () => {
    const reply = readSuggestion([
      {
        output: "Objective of the campaign: Lead generation\nAd goal: Leads\nBudget Allocation Logic: ...",
        user_details: { automation_mode: "full" },
      },
    ]);
    expect(reply.output.startsWith("Objective of the campaign")).toBe(true);
    expect(reply.userDetails.automation_mode).toBe("full");
    expect(reply.semiAllowed).toBe(true);
    expect(parseSuggestion(reply.output).map((s) => s.title)).toEqual([
      "Objective of the campaign",
      "Ad goal",
      "Budget Allocation Logic",
    ]);
  });

  it("renders a verdict as headed sections", () => {
    const reply = readSuggestion({
      result: "does_not_work",
      why: ["Budget too low for lead objective"],
      recommended_campaign: { campaign_type: "Traffic", daily_budget: "20" },
    });
    expect(reply.output).not.toBe("");
    expect(parseSuggestion(reply.output)).toEqual([
      { title: "Result", body: ["does not work"], bullets: [] },
      { title: "Reason", body: [], bullets: ["Budget too low for lead objective"] },
      { title: "Recommended campaign", body: ["Traffic"], bullets: ["Daily Budget: 20"] },
    ]);
  });

  it("renders a verdict sent as a JSON string inside `output`, with its suggestions", () => {
    const reply = readSuggestion({
      output: JSON.stringify({
        result: "works",
        reason: "Budget fits the goal",
        suggestions: [{ campaign_type: "Reels", reason: "Cheaper reach" }, "Test two headlines"],
      }),
    });
    const sections = parseSuggestion(reply.output);
    expect(sections[1]).toEqual({ title: "Reason", body: ["Budget fits the goal"], bullets: [] });
    expect(sections[2]).toEqual({
      title: "Suggestions",
      body: [],
      bullets: ["Reels: Cheaper reach", "Test two headlines"],
    });
  });

  it("renders suggestions alone as one card each", () => {
    const reply = readSuggestion({ suggestions: [{ title: "Use video", detail: "Reels perform better..." }, { text: "Go wider" }] });
    expect(parseSuggestion(reply.output)).toEqual([
      { title: "Use video", body: ["Reels perform better..."], bullets: [] },
      { title: "Suggestion 2", body: ["Go wider"], bullets: [] },
    ]);
  });

  it("falls back to `message`, then `response`", () => {
    expect(readSuggestion({ message: "plain text plan" }).output).toBe("plain text plan");
    expect(readSuggestion({ response: ["first", "second"] }).output).toBe("first");
    expect(readSuggestion({ output: "wins", message: "loses" }).output).toBe("wins");
  });

  it("reads an explicit null automation mode as semi not allowed — and only that", () => {
    expect(readSuggestion({ user_details: { automation_mode: null }, output: "x" }).semiAllowed).toBe(false);
    expect(readSuggestion({ user_details: {}, output: "x" }).semiAllowed).toBe(true);
    expect(readSuggestion({ output: "x" }).semiAllowed).toBe(true);
    expect(readSuggestion({ user_details: { automation_mode: "semi" }, output: "x" }).semiAllowed).toBe(true);
    // The null is not kept as a detail: only text and numbers are.
    expect(readSuggestion({ user_details: { automation_mode: null }, output: "x" }).userDetails).toEqual({});
  });
});
