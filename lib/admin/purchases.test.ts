import { buildPurchases, filterPurchases, readPurchaseFilter } from "./purchases";

const NOW = new Date("2026-09-20T00:00:00Z");

describe("buildPurchases", () => {
  const data = buildPurchases(
    [
      { email: "paid@x.test", created_at: "2026-09-01" },
      {
        email: "granted@x.test",
        subscription_status: "active",
        subscription_end_date: "2027-01-01",
        subscribed_agents: ["meta-ads", "AI Automation for Google Ads"],
      },
      { email: "lapsed@x.test", subscription_status: "active", subscription_end_date: "2026-01-01", subscribed_agents: ["podcast"] },
      { email: "none@x.test" },
    ],
    [
      { email: "paid@x.test", status: "completed", cart_items: JSON.stringify([{ id: "lead-qualification" }]) },
      { user_email: "PAID@x.test", status: "completed", cart_items: [{ title: "AI Social Media Agent" }] },
      { email: "none@x.test", status: "pending", cart_items: [{ id: "meta-ads" }] },
      { email: "broken@x.test", status: "completed", cart_items: "{not json" },
    ],
    [{ email: "paid@x.test", companyName: "Paid Co" }],
    NOW,
  );

  it("counts completed orders only", () => {
    expect(data.totalOrders).toBe(3);
  });

  it("marks purchased from orders or an active agent list, with the agents named", () => {
    const byEmail = Object.fromEntries(data.rows.map((row) => [row.email, row]));
    expect(byEmail["paid@x.test"]).toMatchObject({
      purchased: true,
      company: "Paid Co",
      agents: ["Lead Qualification", "Social Media"],
    });
    expect(byEmail["granted@x.test"]).toMatchObject({ purchased: true, subscription: "active", agents: ["Google Ads", "Meta Ads"] });
    expect(byEmail["none@x.test"]).toMatchObject({ purchased: false, agents: [] });
  });

  it("reports a closed window as expired, whatever the stored status says", () => {
    expect(data.rows.find((row) => row.email === "lapsed@x.test")?.subscription).toBe("expired");
  });

  it("filters", () => {
    expect(filterPurchases(data.rows, "not-purchased").map((row) => row.email)).toEqual(["none@x.test"]);
    expect(readPurchaseFilter("bogus")).toBe("all");
  });
});
