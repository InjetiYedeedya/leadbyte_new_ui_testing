import {
  buildCampaignRequest,
  needsBidAmount,
  requestProblems,
  toApiExcludes,
  toApiLocations,
  toLocationLabels,
  type AdsCopy,
} from "./ads-campaign-request";
import type { ChatGptAdsSetup } from "./chatgpt-ads-setup";

/**
 * The mapping from what someone typed to what gets sent and charged for. Every
 * rule tested here is one the service enforces with a 422 or, worse, accepts
 * and bills for.
 */

const SETUP: ChatGptAdsSetup = {
  goal: "traffic",
  budgetType: "lifetime",
  budgetAmount: 500,
  locationPicks: [{ type: "country", country: "United States" }],
  locations: [{ country: "United States", state: "", city: "", zip: "" }],
  excludeLocations: [],
  platforms: ["web"],
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  brandName: "ZippyGo",
  businessDescription:
    "ZippyGo compares fares across every airline for leisure travellers booking city breaks.",
  destinationUrl: "https://zippygo.ai/flights",
  conversionEventIds: [],
  // Traffic's automatic strategy. Its FIRST strategy is "Maximum CPC bid",
  // which is manual — so tests that expect no bid must say so explicitly.
  bidStrategy: "maximize_results",
  bidAmount: 0,
};

const COPY: AdsCopy = {
  title: "ZippyGo: compare flights for your next trip",
  description: "ZippyGo finds your cheapest fare in under a minute.",
  topics: ["cheap flights", "flight comparison"],
};

const setup = (over: Partial<ChatGptAdsSetup> = {}): ChatGptAdsSetup => ({ ...SETUP, ...over });

describe("toApiLocations", () => {
  const place = (over: Partial<{ country: string; state: string; city: string; zip: string }>) => ({
    country: "",
    state: "",
    city: "",
    zip: "",
    ...over,
  });

  it("sends a country on its own as a country on its own", () => {
    expect(toApiLocations([place({ country: "United States" })])).toEqual([
      { country: "United States" },
    ]);
  });

  /** Objects, not strings: a resolver given "Austin, Texas" has to guess. */
  it("names each level under its own key", () => {
    expect(
      toApiLocations([place({ country: "United States", state: "Texas", city: "Austin" })]),
    ).toEqual([{ country: "United States", state: "Texas", city: "Austin" }]);
  });

  /**
   * A city with no state is ambiguous across countries — there is a Springfield
   * in most of them — so a gap stops the narrowing rather than skipping a level.
   */
  it("drops a city whose state was left blank", () => {
    expect(toApiLocations([place({ country: "India", city: "Salem" })])).toEqual([
      { country: "India" },
    ]);
  });

  it("closes up a level nobody filled in", () => {
    expect(toApiLocations([place({ country: "India", state: "Tamil Nadu" })])).toEqual([
      { country: "India", state: "Tamil Nadu" },
    ]);
  });

  /**
   * The contract's own rule: `postal_code` is sent INSTEAD of state and city,
   * not alongside them. Sending all three describes two different areas.
   */
  it("sends a postcode instead of the state and city, not as well", () => {
    expect(
      toApiLocations([
        place({ country: "United States", state: "New Jersey", city: "Newark", zip: "07102" }),
      ]),
    ).toEqual([{ country: "United States", postal_code: "07102" }]);
  });

  /**
   * Two cascades can describe one place — a customer adding the same country
   * twice, or a state whose only city they then cleared. A duplicate in the
   * list is a place targeted twice.
   */
  it("says each place once", () => {
    expect(
      toApiLocations([place({ country: "India" }), place({ country: "India" })]),
    ).toEqual([{ country: "India" }]);
  });

  /**
   * `formatLocations()` builds `"Austin > Texas > United States"` for the n8n
   * webhooks. Sending that to this service's resolver is the mistake this
   * function exists to prevent.
   */
  it("never composes a display string", () => {
    const [only] = toApiLocations([
      place({ country: "United States", state: "Texas", city: "Austin" }),
    ]);
    expect(only!.country).toBe("United States");
    expect(JSON.stringify(only)).not.toContain(">");
  });

  it("is empty when nothing was chosen, rather than carrying a blank", () => {
    expect(toApiLocations([])).toEqual([]);
    expect(toApiLocations([place({})])).toEqual([]);
  });
});

describe("toApiExcludes", () => {
  /** The same object shape as the targets — the service takes one reader. */
  it("boxes each excluded country", () => {
    expect(toApiExcludes(["Canada", "Mexico"])).toEqual([
      { country: "Canada" },
      { country: "Mexico" },
    ]);
  });

  it("drops blanks rather than sending an empty country", () => {
    expect(toApiExcludes(["", "  ", "Canada", "Canada"])).toEqual([{ country: "Canada" }]);
  });
});

/**
 * `advise` and `generate` are NOT the campaign request: a live run answered
 * `sequence item 0: expected str instance, dict found`, which is Python's
 * `", ".join()` refusing a dict. Those two keep strings.
 */
describe("toLocationLabels", () => {
  const place = (over: Partial<{ country: string; state: string; city: string; zip: string }>) => ({
    country: "",
    state: "",
    city: "",
    zip: "",
    ...over,
  });

  it("reads most specific first, the way an address does", () => {
    expect(
      toLocationLabels([place({ country: "United States", state: "Texas", city: "Austin" })]),
    ).toEqual(["Austin, Texas, United States"]);
  });

  it("closes up a level nobody filled in", () => {
    expect(toLocationLabels([place({ country: "India", state: "Tamil Nadu" })])).toEqual([
      "Tamil Nadu, India",
    ]);
  });

  it("puts the postcode at the front rather than dropping it", () => {
    expect(
      toLocationLabels([
        place({ country: "United States", state: "New Jersey", city: "Newark", zip: "07102" }),
      ]),
    ).toEqual(["07102, Newark, New Jersey, United States"]);
  });

  it("says each place once and skips one with no country", () => {
    expect(
      toLocationLabels([place({ country: "India" }), place({ country: "India" }), place({})]),
    ).toEqual(["India"]);
  });

  /** `formatLocations()` builds `"Austin > Texas > India"` for the n8n webhooks. */
  it("uses commas, not the n8n separator", () => {
    const [only] = toLocationLabels([place({ country: "India", state: "Kerala" })]);
    expect(only).not.toContain(">");
    expect(only).not.toContain("|");
  });
});

describe("needsBidAmount", () => {
  it("requires one for awareness, which has no automatic bidding", () => {
    expect(needsBidAmount(setup({ goal: "awareness", bidStrategy: "max_cpm" }))).toBe(true);
    expect(needsBidAmount(setup({ goal: "traffic" }))).toBe(false);
  });

  /**
   * The bug this replaced a goal check to fix (2026-09-17). It read
   * `goal === "awareness"`, a proxy for the strategy from before there was a
   * picker — so Traffic + "Maximum CPC bid" answered false, the amount the
   * customer typed was dropped, and the campaign ran on automatic bidding.
   */
  it("follows the strategy the customer picked, not the goal", () => {
    expect(needsBidAmount(setup({ goal: "traffic", bidStrategy: "max_cpc" }))).toBe(true);
    expect(needsBidAmount(setup({ goal: "traffic", bidStrategy: "maximize_results" }))).toBe(false);
    expect(needsBidAmount(setup({ goal: "leads", bidStrategy: "max_cpc" }))).toBe(true);
    expect(needsBidAmount(setup({ goal: "leads", bidStrategy: "maximize_results" }))).toBe(false);
  });

  /** A stale or hand-edited id falls back to the strategy the form shows first. */
  it("falls back to the objective's first strategy for an id it does not know", () => {
    // Clicks opens on "Maximum CPC bid", which is manual.
    expect(needsBidAmount(setup({ goal: "traffic", bidStrategy: "smart-fridge" }))).toBe(true);
  });

  /** The service may ADD a requirement for a campaign we thought was automatic. */
  it("lets the service ask for a bid we would not have asked for", () => {
    expect(needsBidAmount(setup({ goal: "traffic" }), { needs_bid_amount: true })).toBe(true);
  });

  /**
   * The second half of the same live bug. `advise` is asked before the
   * strategy exists — goal, budget, locations, dates, tracking, and no
   * strategy — so its answer describes what the SERVICE would pick. Letting it
   * say `needs_bid_amount: false` over an explicit "Maximum CPC bid" dropped a
   * cap the customer had typed, and sent a manual strategy with a null amount.
   */
  it("never lets the service drop a bid the customer's own strategy requires", () => {
    expect(
      needsBidAmount(setup({ goal: "traffic", bidStrategy: "max_cpc" }), {
        needs_bid_amount: false,
      }),
    ).toBe(true);
    expect(
      needsBidAmount(setup({ goal: "awareness", bidStrategy: "max_cpm" }), {
        needs_bid_amount: false,
      }),
    ).toBe(true);
  });

  it("falls back to the strategy when the service said nothing about it", () => {
    expect(needsBidAmount(setup({ goal: "awareness" }), { strategy: "max_cpm" })).toBe(true);
  });
});

describe("buildCampaignRequest", () => {
  it("carries the setup through under the service's own field names", () => {
    const request = buildCampaignRequest(setup(), COPY, "semi", {
      imageUrl: "https://cdn.example.com/card.jpg",
    });

    expect(request).toMatchObject({
      goal: "traffic",
      budget_type: "lifetime",
      budget_amount: 500,
      locations: [{ country: "United States" }],
      exclude_locations: [],
      platforms: ["web"],
      brand_name: "ZippyGo",
      destination_url: "https://zippygo.ai/flights",
      start_date: "2026-10-01",
      end_date: "2026-10-31",
      ad_type: "semi",
      headline: COPY.title,
      description: COPY.description,
      context_hints: ["cheap flights", "flight comparison"],
    });
  });

  /**
   * "Plain currency — `500` means $500." The service answers in millionths;
   * nothing converts on the way out, and the review screen shows what was
   * typed.
   */
  it("sends the budget as typed, not in the platform's millionths", () => {
    expect(buildCampaignRequest(setup(), COPY, "full").budget_amount).toBe(500);
  });

  /** The contract: required for semi, FORBIDDEN for full. Not optional either way. */
  it("attaches the image for semi and omits the field entirely for full", () => {
    const semi = buildCampaignRequest(setup(), COPY, "semi", { imageUrl: "https://x/y.jpg" });
    expect(semi.image_url).toBe("https://x/y.jpg");

    const full = buildCampaignRequest(setup(), COPY, "full", { imageUrl: "https://x/y.jpg" });
    expect("image_url" in full).toBe(false);
  });

  /**
   * `output_key` is a SIBLING of `request`, not a member. Inside it, the
   * service sees no rendered image and answers `ImageMissing` — the guard that
   * stops an ad going live with no picture.
   */
  it("never puts output_key in the request object", () => {
    expect("output_key" in buildCampaignRequest(setup(), COPY, "full")).toBe(false);
  });

  /** A bid of nothing is a bid, not an absent one. */
  it("sends null rather than a zero bid", () => {
    expect(buildCampaignRequest(setup({ bidAmount: 0 }), COPY, "full").bid_amount).toBeNull();
  });

  it("sends the bid when the campaign is one that needs it", () => {
    const request = buildCampaignRequest(
      setup({ goal: "awareness", bidStrategy: "max_cpm", bidAmount: 2.5 }),
      COPY,
      "full",
    );
    expect(request.bid_amount).toBe(2.5);
  });

  /**
   * Both halves of the same live bug: a Traffic campaign bid at "Maximum CPC"
   * arrived with `bid_amount: null` AND no strategy at all, so the service had
   * nothing to tell it apart from automatic bidding.
   */
  it("sends the manual bid AND its strategy for a clicks campaign", () => {
    const request = buildCampaignRequest(
      setup({ goal: "traffic", bidStrategy: "max_cpc", bidAmount: 2.5 }),
      COPY,
      "semi",
      { imageUrl: "https://x/y.jpg" },
    );
    expect(request.bid_strategy).toBe("max_cpc");
    expect(request.bid_amount).toBe(2.5);
  });

  it("names the automatic strategy too, so it is chosen rather than defaulted into", () => {
    const request = buildCampaignRequest(setup({ goal: "traffic" }), COPY, "full");
    expect(request.bid_strategy).toBe("maximize_results");
    expect(request.bid_amount).toBeNull();
  });

  /**
   * Conversions is billed per click, so it takes the same wire name and the
   * same cap as Clicks. It used to send an invented `manual_max` with no wire
   * at all — an amount with no strategy beside it.
   */
  it("names the strategy on a conversions campaign too", () => {
    const request = buildCampaignRequest(
      setup({ goal: "leads", bidStrategy: "max_cpc", bidAmount: 4 }),
      COPY,
      "full",
    );
    expect(request.bid_strategy).toBe("max_cpc");
    expect(request.bid_amount).toBe(4);
  });

  /**
   * Automatic bidding does not merely not need an amount — it does not want
   * one, so a number left in a box we should have hidden must not become a cap.
   */
  it("drops a bid the service said it does not want", () => {
    const request = buildCampaignRequest(setup({ bidAmount: 9 }), COPY, "full", {
      bidding: { needs_bid_amount: false },
    });
    expect(request.bid_amount).toBeNull();
  });

  /**
   * A UI that says "launched" over a paused campaign costs someone an
   * afternoon wondering why nothing is spending. The default is the safe one.
   */
  it("creates paused unless launching was asked for explicitly", () => {
    expect(buildCampaignRequest(setup(), COPY, "full").launch_immediately).toBe(false);
    expect(
      buildCampaignRequest(setup(), COPY, "full", { launchImmediately: true }).launch_immediately,
    ).toBe(true);
  });

  it("trims the copy and drops an empty topic", () => {
    const request = buildCampaignRequest(
      setup(),
      { title: "  Headline  ", description: " Body ", topics: ["one", "  ", ""] },
      "full",
    );
    expect(request.headline).toBe("Headline");
    expect(request.description).toBe("Body");
    expect(request.context_hints).toEqual(["one"]);
  });
});

/**
 * The fields whose ABSENCE produced 21 campaigns with `dynamic_url: ''`. The
 * request described one surface, so the service re-resolved, found one usable
 * destination, and never minted a link.
 */
describe("buildCampaignRequest — the destinations", () => {
  const destinations = {
    app_store_url: "https://apps.apple.com/us/app/x/id1",
    play_store_url: "https://play.google.com/store/apps/details?id=x",
    destination_url: "https://zippygo.ai",
  };

  it("sends every destination, not just the one that won the fallback", () => {
    const request = buildCampaignRequest(setup(), COPY, "full", { destinations });
    expect(request.app_store_url).toBe(destinations.app_store_url);
    expect(request.play_store_url).toBe(destinations.play_store_url);
  });

  /**
   * The service mints a link once and keys it on its destinations. Sending the
   * one `generate` already returned is what stops a second being minted for the
   * same three and splitting the campaign's reporting.
   */
  it("sends the link generate already minted", () => {
    const request = buildCampaignRequest(setup(), COPY, "full", {
      destinations,
      smartLinkUrl: "https://1lnk.io/ab3x9",
    });
    expect(request.smart_link_url).toBe("https://1lnk.io/ab3x9");
  });

  /** An empty destination is a link to nowhere; the service would treat it as one. */
  it("omits a destination it does not have rather than sending a blank", () => {
    const request = buildCampaignRequest(setup(), COPY, "full", {
      destinations: { app_store_url: "   " },
    });
    expect("app_store_url" in request).toBe(false);
    expect("play_store_url" in request).toBe(false);
    expect("smart_link_url" in request).toBe(false);
  });

  /**
   * Always sent, empty array included. An absent key would be
   * indistinguishable from a campaign built before the picker existed — the
   * ambiguity that had leads campaigns silently running as clicks campaigns.
   */
  it("always names the conversions, and sends an empty list when none were ticked", () => {
    expect(
      buildCampaignRequest(setup({ conversionEventIds: ["evt_1", "evt_2"] }), COPY, "full")
        .conversion_event_setting_ids,
    ).toEqual(["evt_1", "evt_2"]);

    const none = buildCampaignRequest(setup(), COPY, "full");
    expect("conversion_event_setting_ids" in none).toBe(true);
    expect(none.conversion_event_setting_ids).toEqual([]);
  });

  /** Offered on every goal now, so awareness carries them like any other. */
  it("carries them whatever the goal is", () => {
    expect(
      buildCampaignRequest(
        setup({ goal: "awareness", bidStrategy: "max_cpm", bidAmount: 9, conversionEventIds: ["evt_1"] }),
        COPY,
        "full",
      ).conversion_event_setting_ids,
    ).toEqual(["evt_1"]);
  });
});

describe("requestProblems", () => {
  const image = { imageUrl: "https://x/y.jpg", outputKey: "generated-media/x.jpg" };

  it("passes a campaign that is ready", () => {
    expect(requestProblems(setup(), COPY, "semi", image)).toEqual([]);
  });

  it("names problems by the API's field, so one renderer serves both sources", () => {
    const problems = requestProblems(
      setup(),
      { title: "", description: "", topics: [] },
      "semi",
      image,
    );
    expect(problems.map((p) => p.field)).toEqual(["headline", "description", "context_hints"]);
  });

  it("asks for a bid only when this campaign needs one", () => {
    const fields = (bid: number, goal: ChatGptAdsSetup["goal"], bidStrategy = "maximize_results") =>
      requestProblems(setup({ goal, bidStrategy, bidAmount: bid }), COPY, "semi", image).map(
        (p) => p.field,
      );

    expect(fields(0, "awareness", "max_cpm")).toContain("bid_amount");
    expect(fields(2, "awareness", "max_cpm")).not.toContain("bid_amount");
    expect(fields(0, "traffic")).not.toContain("bid_amount");
    // The manual strategy on a goal whose fallback used to say "no bid needed".
    expect(fields(0, "traffic", "max_cpc")).toContain("bid_amount");
  });

  /**
   * The service refuses this outright. The two instructions cannot both be
   * obeyed, so whichever won would be a coin toss the customer did not call.
   */
  it("catches a place that is both targeted and excluded", () => {
    const clash = requestProblems(
      setup({ excludeLocations: ["United States", "Canada"] }),
      COPY,
      "semi",
      image,
    );
    expect(clash.map((p) => p.field)).toContain("exclude_locations");
    expect(clash.find((p) => p.field === "exclude_locations")!.message).toContain("United States");

    expect(
      requestProblems(setup({ excludeLocations: ["Canada"] }), COPY, "semi", image),
    ).toEqual([]);
  });

  it("catches each half of the ad-type contract before the service does", () => {
    expect(requestProblems(setup(), COPY, "semi", { outputKey: "x" }).map((p) => p.field)).toContain(
      "image_url",
    );
    expect(
      requestProblems(setup(), COPY, "full", { imageUrl: "https://x/y.jpg" }).map((p) => p.field),
    ).toContain("output_key");
  });
});
