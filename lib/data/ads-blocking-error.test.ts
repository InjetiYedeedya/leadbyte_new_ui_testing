import {
  blockingErrorCard,
  blockingErrorSentence,
  decodeBlockingCard,
  detectAdsBlockingError,
  encodeBlockingCard,
} from "./ads-blocking-error";
import { signText } from "@/lib/signed-text";

const REFUSAL = {
  status: "error",
  error_code: "INSTAGRAM_NOT_CONNECTED",
  message: "No Instagram account is linked to this Facebook Page.",
};

describe("detectAdsBlockingError", () => {
  it("finds a refusal in every shape n8n and the Lambda send it", () => {
    expect(detectAdsBlockingError(REFUSAL)?.code).toBe("INSTAGRAM_NOT_CONNECTED");
    expect(detectAdsBlockingError([REFUSAL])?.code).toBe("INSTAGRAM_NOT_CONNECTED");
    expect(detectAdsBlockingError(JSON.stringify([REFUSAL]))?.code).toBe("INSTAGRAM_NOT_CONNECTED");
    expect(detectAdsBlockingError({ success: true, "0": REFUSAL })?.code).toBe("INSTAGRAM_NOT_CONNECTED");
    expect(detectAdsBlockingError({ success: true, data: { error_code: "BUDGET_TOO_LOW", message: "Budget too low" } })?.code).toBe(
      "BUDGET_TOO_LOW",
    );
  });

  it("uses plain wording and a way out for a known code", () => {
    const error = detectAdsBlockingError(REFUSAL)!;
    expect(error.title).toBe("Link an Instagram account to your Facebook Page");
    expect(blockingErrorSentence(error)).toContain("business.facebook.com/settings/pages");
  });

  it("says nothing about a normal reply", () => {
    expect(detectAdsBlockingError({ output: "Here is your campaign plan…" })).toBeNull();
    expect(detectAdsBlockingError([{ output: "plan", status: "ok" }])).toBeNull();
    expect(detectAdsBlockingError({ received: true })).toBeNull();
    expect(detectAdsBlockingError("plain text answer")).toBeNull();
    // A `status` deep inside a plan is not a refusal.
    expect(detectAdsBlockingError({ output: "plan", plan: { steps: [{ status: "error" }] } })).toBeNull();
  });
});

describe("blockingErrorCard", () => {
  it("words the Instagram refusal the spec's way, naming the Page when it can", () => {
    expect(blockingErrorCard([{ ...REFUSAL, page_name: "ZippyGo" }])).toEqual({
      code: "INSTAGRAM_NOT_CONNECTED",
      title: "Instagram account not connected",
      message:
        'No Instagram account is connected to your Facebook Page "ZippyGo". ' +
        "A connected Instagram Business account is required to run Meta (Facebook & Instagram) ads.",
      hint: "Link an Instagram Business account to this Page in Meta Business Settings, then try again.",
      link: "https://business.facebook.com/settings/pages",
    });
  });

  it("leaves the quoted name out when the Page has none", () => {
    expect(blockingErrorCard(REFUSAL)?.message).toBe(
      "No Instagram account is connected to your Facebook Page. " +
        "A connected Instagram Business account is required to run Meta (Facebook & Instagram) ads.",
    );
  });

  it("keeps n8n's own message for an unknown code, with no invented advice", () => {
    expect(blockingErrorCard({ status: "error", error_code: "BUDGET_TOO_LOW", message: "Budget too low" })).toEqual({
      code: "BUDGET_TOO_LOW",
      title: "We couldn't start your campaign",
      message: "Budget too low",
      hint: null,
      link: null,
    });
    expect(blockingErrorCard({ status: "error" })?.message).toBe(
      "The campaign could not be created. Please review your setup and try again.",
    );
  });

  it("is null for a normal reply", () => {
    expect(blockingErrorCard({ output: "Here is your plan" })).toBeNull();
  });
});

describe("encodeBlockingCard / decodeBlockingCard", () => {
  const card = blockingErrorCard({ ...REFUSAL, page_name: "ZippyGo" })!;

  it("round-trips a card through a URL-safe string", () => {
    const raw = encodeBlockingCard(card);
    expect(encodeURIComponent(raw)).toBe(raw);
    expect(decodeBlockingCard(raw)).toEqual(card);
  });

  it("refuses anything it did not sign", () => {
    const unsigned = Buffer.from(JSON.stringify(card), "utf8").toString("base64url");
    expect(decodeBlockingCard(unsigned)).toBeNull();
    expect(decodeBlockingCard(`${encodeBlockingCard(card)}x`)).toBeNull();
    expect(decodeBlockingCard("")).toBeNull();
    expect(decodeBlockingCard(null)).toBeNull();
    // Signed but not a card.
    expect(decodeBlockingCard(signText("not base64 json"))).toBeNull();
    expect(decodeBlockingCard(signText(Buffer.from('{"code":"X"}').toString("base64url")))).toBeNull();
  });

  it("only ever links to Meta Business Settings", () => {
    const raw = encodeBlockingCard({ ...card, link: "https://evil.example/settings" });
    expect(decodeBlockingCard(raw)?.link).toBeNull();
    const forged = signText(Buffer.from(JSON.stringify({ ...card, link: "https://evil.example" })).toString("base64url"));
    expect(decodeBlockingCard(forged)?.link).toBeNull();
  });
});
