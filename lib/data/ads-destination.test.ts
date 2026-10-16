import {
  destinationFieldsFor,
  destinationPrompts,
  mergeDestinations,
  needsDestinations,
  readDestinationFields,
  smartLink,
  smartLinkError,
  smartLinkFailed,
  unknownMissing,
} from "./ads-destination";

/**
 * The destination block decides what a customer is asked for and which link a
 * campaign sends people to. Every rule here is one where being wrong strands a
 * platform silently — nothing downstream reports an advert that sent its
 * Android audience to a website.
 */

const form = (values: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
};

describe("destinationPrompts", () => {
  it("asks for exactly what the service could not find", () => {
    const prompts = destinationPrompts({ ready: false, missing: ["app_store_url"] });
    expect(prompts.map((p) => p.field)).toEqual(["app_store_url"]);
    expect(prompts[0]!.label).toBe("App Store link");
  });

  /**
   * Fixed order, not the service's. A field that moves between two rounds of
   * the same conversation is one someone fills in twice.
   */
  it("keeps one order however the service listed them", () => {
    const prompts = destinationPrompts({
      ready: false,
      missing: ["destination_url", "app_store_url", "play_store_url"],
    });
    expect(prompts.map((p) => p.field)).toEqual([
      "app_store_url",
      "play_store_url",
      "destination_url",
    ]);
  });

  /**
   * An input captioned with a raw API field name asks the customer to guess at
   * our contract — so an unknown name is dropped from the form and reported
   * instead.
   */
  it("renders nothing for a field it has no wording for, and says so separately", () => {
    const destination = { ready: false, missing: ["app_store_url", "tiktok_url"] };
    expect(destinationPrompts(destination).map((p) => p.field)).toEqual(["app_store_url"]);
    expect(unknownMissing(destination)).toEqual(["tiktok_url"]);
  });

  it("asks for nothing when nothing is missing", () => {
    expect(destinationPrompts({ ready: true, missing: [] })).toEqual([]);
    expect(destinationPrompts(undefined)).toEqual([]);
  });
});

describe("destinationFieldsFor", () => {
  it("asks for the store listing of each app surface, and a website for the browser", () => {
    expect(destinationFieldsFor(["ios_app"])).toEqual(["app_store_url"]);
    expect(destinationFieldsFor(["android_app"])).toEqual(["play_store_url"]);
    expect(destinationFieldsFor(["web"])).toEqual(["destination_url"]);
  });

  /** Two or more surfaces is what makes a smart link necessary. */
  it("asks for all three when the campaign runs everywhere", () => {
    expect(destinationFieldsFor(["web", "android_app", "ios_app"])).toEqual([
      "app_store_url",
      "play_store_url",
      "destination_url",
    ]);
  });

  /** One order, however the checkboxes were ticked — a field that moves is one
   *  somebody fills in twice. */
  it("keeps one order regardless of how they were selected", () => {
    expect(destinationFieldsFor(["web", "ios_app"])).toEqual(["app_store_url", "destination_url"]);
    expect(destinationFieldsFor(["ios_app", "web"])).toEqual(["app_store_url", "destination_url"]);
  });

  /** An empty campaign is not a reason to ask for three links. */
  it("asks for nothing when no platform is chosen", () => {
    expect(destinationFieldsFor([])).toEqual([]);
  });
});

describe("needsDestinations", () => {
  it("blocks only on an explicit no", () => {
    expect(needsDestinations({ ready: false, missing: ["app_store_url"] })).toBe(true);
    expect(needsDestinations({ ready: true })).toBe(false);
  });

  /**
   * A draft written before this feature existed carries no destination at all.
   * Reading absent as "not ready" would strand every one of them behind a form
   * asking for links the service never said it wanted.
   */
  it("does not block a draft that predates the destination block", () => {
    expect(needsDestinations(undefined)).toBe(false);
    expect(needsDestinations({})).toBe(false);
  });
});

describe("smartLink", () => {
  it("shows the minted link when one was needed", () => {
    expect(
      smartLink({
        kind: "smart_link",
        ready: true,
        needs_dynamic_url: true,
        dynamic_url: "https://1lnk.io/ab3x9",
        url: "https://1lnk.io/ab3x9",
      }),
    ).toBe("https://1lnk.io/ab3x9");
  });

  /** A single destination is the URL they typed. Showing it back is noise. */
  it("shows nothing for a single-platform campaign", () => {
    expect(
      smartLink({ kind: "single", ready: true, needs_dynamic_url: false, url: "https://zippygo.ai" }),
    ).toBeNull();
  });

  /**
   * No link is issued while anything is missing — one built from two
   * destinations when three were meant drops a surface.
   */
  it("shows nothing while the service is still asking for links", () => {
    expect(
      smartLink({ ready: false, missing: ["app_store_url"], needs_dynamic_url: true }),
    ).toBeNull();
    expect(smartLink(undefined)).toBeNull();
  });

  /**
   * The bug this function was written around. `dynamic_url ?? url` fell back to
   * the WEBSITE when the mint failed, and rendered it under "one link for every
   * platform" — a failure that read as a success, and the same value went to
   * `create` as `smart_link_url`.
   */
  it("never falls back to the website when the mint failed", () => {
    const failed = {
      kind: "smart_link" as const,
      ready: true,
      needs_dynamic_url: true,
      missing: [],
      url: "https://zippygo.ai",
      web_url: "https://zippygo.ai",
      error: "1link refused: the destinations do not resolve",
    };
    expect(smartLink(failed)).toBeNull();
    expect(smartLinkFailed(failed)).toBe(true);
    expect(smartLinkError(failed)).toBe("1link refused: the destinations do not resolve");
  });
});

describe("smartLinkFailed", () => {
  /** A link that exists has not failed, however loudly anything else warns. */
  it("is false when a link was minted", () => {
    expect(
      smartLinkFailed({ ready: true, needs_dynamic_url: true, dynamic_url: "https://1lnk.io/x" }),
    ).toBe(false);
  });

  /** One platform needs no device-aware link, so it cannot fail to have one. */
  it("is false for a single-platform campaign", () => {
    expect(
      smartLinkFailed({ kind: "single", ready: true, needs_dynamic_url: false, url: "https://x" }),
    ).toBe(false);
  });

  /** Still collecting links is not the same as having tried and failed. */
  it("is false while the service is still asking for destinations", () => {
    expect(
      smartLinkFailed({ ready: false, needs_dynamic_url: true, missing: ["app_store_url"] }),
    ).toBe(false);
    expect(smartLinkFailed(undefined)).toBe(false);
  });

  /** A failure with no explanation is still a failure worth reporting. */
  it("is true with no error text to go with it", () => {
    expect(smartLinkFailed({ ready: true, needs_dynamic_url: true, missing: [] })).toBe(true);
    expect(smartLinkError({ ready: true, needs_dynamic_url: true })).toBeNull();
  });
});

describe("readDestinationFields", () => {
  it("reads the three the contract names", () => {
    expect(
      readDestinationFields(
        form({
          app_store_url: "https://apps.apple.com/us/app/x/id1",
          play_store_url: "https://play.google.com/store/apps/details?id=x",
          destination_url: "https://zippygo.ai",
        }),
      ),
    ).toEqual({
      app_store_url: "https://apps.apple.com/us/app/x/id1",
      play_store_url: "https://play.google.com/store/apps/details?id=x",
      destination_url: "https://zippygo.ai",
    });
  });

  /** An empty destination is a link to nowhere, so it is left out entirely. */
  it("omits a blank rather than sending an empty string", () => {
    expect(readDestinationFields(form({ app_store_url: "   ", play_store_url: "" }))).toEqual({});
    expect(readDestinationFields(form({}))).toEqual({});
  });

  /** A scheme-less URL is a RELATIVE path — it would point at our own site. */
  it("gives a scheme-less link one", () => {
    expect(readDestinationFields(form({ destination_url: "zippygo.ai" }))).toEqual({
      destination_url: "https://zippygo.ai",
    });
  });
});

describe("mergeDestinations", () => {
  /**
   * `generate` is not deterministic and a customer may redraft many times.
   * Re-collecting the same App Store link on each one makes the button
   * unusable, so answers are kept on the draft.
   */
  it("keeps what was answered before and lets a new answer win", () => {
    expect(
      mergeDestinations(
        { app_store_url: "https://apps.apple.com/old", destination_url: "https://zippygo.ai" },
        { app_store_url: "https://apps.apple.com/new" },
      ),
    ).toEqual({
      app_store_url: "https://apps.apple.com/new",
      destination_url: "https://zippygo.ai",
    });
  });

  it("starts from nothing on the first round", () => {
    expect(mergeDestinations(undefined, { play_store_url: "https://play.google.com/x" })).toEqual({
      play_store_url: "https://play.google.com/x",
    });
  });
});
