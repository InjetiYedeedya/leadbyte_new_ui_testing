import { describe, expect, it } from "vitest";
import { resolveAgentId } from "./agents";
import {
  agentsFromOrders,
  agentsFromUserRecord,
  buildSubscription,
  pickLatestOrder,
} from "./subscription";
import { applyOverrides, resolveEntitledAgents } from "./index";
import { userRecordKeys } from "./subscription";

const NOW = new Date("2026-08-28T12:00:00Z");
const FUTURE = "2026-12-31T00:00:00Z";
const PAST = "2026-01-01T00:00:00Z";

describe("resolveAgentId", () => {
  it("accepts a canonical id", () => {
    expect(resolveAgentId("meta-ads")).toBe("meta-ads");
  });

  it("accepts the legacy title production still stores", () => {
    // Older orders hold display titles. Reading only ids would lock
    // long-standing customers out of agents they have paid for.
    expect(resolveAgentId("AI Automation for Meta Ads")).toBe("meta-ads");
    expect(resolveAgentId("Lead Qualification Agent")).toBe("lead-qualification");
  });

  it("is case- and whitespace-tolerant on titles", () => {
    // Stored titles vary in casing and padding across years of orders.
    expect(resolveAgentId("  On-Page SEO Agent  ")).toBe("on-page-seo");
    expect(resolveAgentId("on-page seo agent")).toBe("on-page-seo");
    expect(resolveAgentId("AI AUTOMATION FOR META ADS")).toBe("meta-ads");
  });

  it("rejects anything unrecognised rather than passing it through", () => {
    // A typo in the data must not become an entitlement.
    expect(resolveAgentId("meta_ads")).toBeNull();
    expect(resolveAgentId("")).toBeNull();
    expect(resolveAgentId(null)).toBeNull();
    expect(resolveAgentId(42)).toBeNull();
  });
});

describe("buildSubscription", () => {
  it("prefers the user record", () => {
    const s = buildSubscription(
      { subscription_status: "active", subscription_end_date: FUTURE, subscription_plan: "growth" },
      null,
      NOW,
    );
    expect(s).toMatchObject({ status: "active", plan: "growth", source: "user" });
  });

  it("falls back to the order when the user record has no dates", () => {
    // The payment handler always stamps the order but only sometimes mirrors
    // onto the user row, so this path is common in production.
    const s = buildSubscription(null, { status: "completed", subscription_end_date: FUTURE }, NOW);
    expect(s.status).toBe("active");
    expect(s.source).toBe("order");
  });

  it("infers expired from a closed window", () => {
    const s = buildSubscription({ subscription_end_date: PAST }, null, NOW);
    expect(s.status).toBe("expired");
  });

  it("treats a stale 'active' with a closed window as expired", () => {
    // Status fields go stale; the date is the truth.
    const s = buildSubscription(
      { subscription_status: "active", subscription_end_date: PAST },
      null,
      NOW,
    );
    expect(s.status).toBe("expired");
  });

  it("reports none when there is nothing at all", () => {
    expect(buildSubscription(null, null, NOW).status).toBe("none");
  });
});

describe("pickLatestOrder", () => {
  it("prefers completed orders over newer incomplete ones", () => {
    const picked = pickLatestOrder([
      { order_id: "done", status: "completed", created_at: "2026-01-01T00:00:00Z" },
      { order_id: "pending", status: "pending", created_at: "2026-08-01T00:00:00Z" },
    ]);
    expect(picked?.order_id).toBe("done");
  });

  it("picks the latest among completed orders", () => {
    const picked = pickLatestOrder([
      { order_id: "old", status: "completed", subscription_end_date: "2026-03-01T00:00:00Z" },
      { order_id: "new", status: "completed", subscription_end_date: FUTURE },
    ]);
    expect(picked?.order_id).toBe("new");
  });

  it("returns null for no orders", () => {
    expect(pickLatestOrder([])).toBeNull();
  });
});

describe("agentsFromUserRecord", () => {
  it("grants the subscribed agents of an active subscription", () => {
    expect(
      agentsFromUserRecord(
        {
          subscription_status: "active",
          subscription_end_date: FUTURE,
          subscribed_agents: ["meta-ads", "AI Automation for Google Ads"],
        },
        NOW,
      ),
    ).toEqual(["meta-ads", "google-ads"]);
  });

  it("grants nothing once the subscription has expired", () => {
    expect(
      agentsFromUserRecord(
        { subscription_end_date: PAST, subscribed_agents: ["meta-ads"] },
        NOW,
      ),
    ).toEqual([]);
  });

  it("survives subscribed_agents being absent or the wrong type", () => {
    expect(agentsFromUserRecord({ subscription_end_date: FUTURE }, NOW)).toEqual([]);
    expect(
      agentsFromUserRecord({ subscription_end_date: FUTURE, subscribed_agents: "meta-ads" }, NOW),
    ).toEqual([]);
  });
});

describe("agentsFromOrders", () => {
  it("reads completed orders only", () => {
    expect(
      agentsFromOrders([
        { status: "completed", cart_items: [{ id: "meta-ads" }] },
        { status: "pending", cart_items: [{ id: "podcast" }] },
      ]),
    ).toEqual(["meta-ads"]);
  });

  it("parses cart_items when production stored it as a JSON string", () => {
    expect(
      agentsFromOrders([
        { status: "completed", cart_items: JSON.stringify([{ id: "google-ads" }]) },
      ]),
    ).toEqual(["google-ads"]);
  });

  it("resolves items that only carry a legacy title", () => {
    expect(
      agentsFromOrders([
        { status: "completed", cart_items: [{ title: "On-Page SEO Agent" }] },
      ]),
    ).toEqual(["on-page-seo"]);
  });

  it("skips a malformed order without losing the others", () => {
    // One bad row must not revoke every other purchase.
    expect(
      agentsFromOrders([
        { status: "completed", cart_items: "{not json" },
        { status: "completed", cart_items: [{ id: "podcast" }] },
      ]),
    ).toEqual(["podcast"]);
  });

  it("stops granting once an order's own window has closed", () => {
    expect(
      agentsFromOrders(
        [
          { status: "completed", subscription_end_date: PAST, cart_items: [{ id: "meta-ads" }] },
          { status: "completed", subscription_end_date: FUTURE, cart_items: [{ id: "podcast" }] },
        ],
        NOW,
      ),
    ).toEqual(["podcast"]);
  });

  it("does not grant a refunded order", () => {
    expect(
      agentsFromOrders([{ status: "refunded", cart_items: [{ id: "meta-ads" }] }], NOW),
    ).toEqual([]);
  });

  it("deduplicates across orders", () => {
    expect(
      agentsFromOrders([
        { status: "completed", cart_items: [{ id: "meta-ads" }] },
        { status: "completed", cart_items: [{ id: "meta-ads" }] },
      ]),
    ).toEqual(["meta-ads"]);
  });
});

describe("applyOverrides", () => {
  it("grants everything to a grantAll account", () => {
    expect(applyOverrides("apps@ntimes.ai", []).length).toBeGreaterThan(5);
  });

  it("is case- and whitespace-insensitive on the email", () => {
    expect(applyOverrides("  APPS@NTimes.ai ", []).length).toBeGreaterThan(5);
  });

  it("adds specific grants on top of purchases", () => {
    const result = applyOverrides("leads@chefgaa.com", ["meta-ads"]);
    expect(result).toContain("meta-ads");
    expect(result).toContain("lead-qualification");
  });

  it("leaves an ordinary account untouched", () => {
    expect(applyOverrides("someone@example.com", ["meta-ads"])).toEqual(["meta-ads"]);
  });
});

describe("resolveEntitledAgents", () => {
  it("unions the user record and orders", () => {
    const agents = resolveEntitledAgents({
      email: "someone@example.com",
      user: {
        subscription_status: "active",
        subscription_end_date: FUTURE,
        subscribed_agents: ["meta-ads"],
      },
      orders: [{ status: "completed", cart_items: [{ id: "podcast" }] }],
      subscription: { status: "active", startDate: null, endDate: FUTURE, plan: null, source: "user" },
      now: NOW,
    });
    expect(agents.sort()).toEqual(["meta-ads", "podcast"]);
  });

  it("keeps a first purchase after a second one overwrote the user row", () => {
    // The payment handler replaces subscribed_agents with the latest order's
    // agents only. The earlier order is still open, so it still grants.
    const agents = resolveEntitledAgents({
      email: "someone@example.com",
      user: {
        subscription_status: "active",
        subscription_end_date: FUTURE,
        subscribed_agents: ["AI Automation for Google Ads"],
        last_order_id: "ORD-2",
      },
      orders: [
        { order_id: "ORD-1", status: "completed", subscription_end_date: FUTURE, cart_items: [{ id: "meta-ads" }] },
        { order_id: "ORD-2", status: "completed", subscription_end_date: FUTURE, cart_items: [{ id: "google-ads" }] },
      ],
      subscription: { status: "active", startDate: null, endDate: FUTURE, plan: null, source: "user" },
      now: NOW,
    });
    expect(agents.sort()).toEqual(["google-ads", "meta-ads"]);
  });

  it("ignores the user row when its last order was refunded", () => {
    const agents = resolveEntitledAgents({
      email: "someone@example.com",
      user: {
        subscription_status: "active",
        subscription_end_date: FUTURE,
        subscribed_agents: ["meta-ads"],
        last_order_id: "ORD-1",
      },
      orders: [{ order_id: "ORD-1", status: "refunded", cart_items: [{ id: "meta-ads" }] }],
      subscription: { status: "active", startDate: null, endDate: FUTURE, plan: null, source: "user" },
      now: NOW,
    });
    expect(agents).toEqual([]);
  });

  it("still honours an admin grant made after a refund", () => {
    const agents = resolveEntitledAgents({
      email: "someone@example.com",
      user: {
        subscription_status: "active",
        subscription_end_date: FUTURE,
        subscribed_agents: ["meta-ads"],
        last_order_id: "ORD-1",
        access_granted_at: "2026-09-01T00:00:00.000Z",
      },
      orders: [{ order_id: "ORD-1", status: "refunded", cart_items: [{ id: "meta-ads" }] }],
      subscription: { status: "active", startDate: null, endDate: FUTURE, plan: null, source: "user" },
      now: NOW,
    });
    expect(agents).toEqual(["meta-ads"]);
  });

  it("grants nothing from a tier until the mapping is filled in", () => {
    // TIER_AGENTS is deliberately empty pending a business decision. This test
    // documents that, and will need updating when the mapping lands.
    const agents = resolveEntitledAgents({
      email: "someone@example.com",
      user: null,
      orders: [],
      subscription: { status: "active", startDate: null, endDate: FUTURE, plan: "growth", source: "user" },
      now: NOW,
    });
    expect(agents).toEqual([]);
  });

  it("grants nothing to an account with no purchases", () => {
    expect(
      resolveEntitledAgents({
        email: "nobody@example.com",
        user: null,
        orders: [],
        subscription: { status: "none", startDate: null, endDate: null, plan: null, source: null },
        now: NOW,
      }),
    ).toEqual([]);
  });
});

describe("userRecordKeys (2026-10-08)", () => {
  // leadbyte_users is keyed by user_id. Reading it by email found nothing, so
  // an admin grant — which lives only on that row — never unlocked anything.
  it("tries the signed-in account's user id first, then the email", () => {
    expect(userRecordKeys("a@b.com", { businessId: "a@b.com", userId: "uid-1" })).toEqual([
      "uid-1",
      "a@b.com",
    ]);
  });

  it("never uses another account's user id", () => {
    expect(userRecordKeys("other@b.com", { businessId: "a@b.com", userId: "uid-1" })).toEqual([
      "other@b.com",
    ]);
  });

  it("matches the email case-insensitively, and copes with no uid or no session", () => {
    expect(userRecordKeys("A@B.com", { businessId: "a@b.com", userId: "uid-1" })[0]).toBe("uid-1");
    expect(userRecordKeys("a@b.com", { businessId: "a@b.com" })).toEqual(["a@b.com"]);
    expect(userRecordKeys("a@b.com", null)).toEqual(["a@b.com"]);
  });
});
