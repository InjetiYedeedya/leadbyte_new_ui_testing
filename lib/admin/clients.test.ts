import { buildClients, buildOverview, configColumns, configRows, type AgentConfigSet } from "./clients";

const NOW = new Date("2026-09-20T00:00:00Z");

const configs: AgentConfigSet[] = [
  {
    name: "Lead Qualification",
    ok: true,
    rows: [{ email: "a@x.test", icp: "SaaS", wordpress_password: "secret" }, { email: "b@x.test" }],
  },
  { name: "Meta Ads", ok: true, rows: [{ email: "A@x.test", daily_budget: 100 }] },
  { name: "Podcast", ok: true, rows: [] },
  { name: "Custom Agent", ok: false, rows: [] },
];

describe("buildClients", () => {
  const clients = buildClients(
    [
      { user_id: "u1", email: "a@x.test", displayName: "Ann", provider: "google.com", created_at: "2026-09-18T00:00:00Z", emailVerified: true },
      { user_id: "u2", email: "b@x.test", provider: "password", created_at: "2026-01-01T00:00:00Z" },
      { user_id: "u3", email: "a@x.test" },
      { user_id: "u4" },
      {},
    ],
    [
      { email: "a@x.test", companyName: "Acme" },
      { email: "b@x.test", company_name: "Bolt" },
    ],
    configs,
  );

  it("joins the company name and drops duplicates and keyless rows", () => {
    expect(clients.map((c) => c.key)).toEqual(["a@x.test", "b@x.test", "u4"]);
    expect(clients[0]).toMatchObject({ company: "Acme", name: "Ann", provider: "google", emailVerified: true });
    expect(clients[1]).toMatchObject({ company: "Bolt", provider: "email", emailVerified: null });
    expect(clients[2]).toMatchObject({ provider: "unknown", createdLabel: "—" });
  });

  it("finds each client's agents across the config tables, case-insensitively", () => {
    expect(clients[0]!.agents).toEqual(["Lead Qualification", "Meta Ads"]);
    expect(clients[1]!.agents).toEqual(["Lead Qualification"]);
  });

  it("masks credentials in the configuration detail", () => {
    const fields = clients[0]!.agentConfigs[0]!.fields;
    expect(fields.find((f) => f.label === "Wordpress password")?.value).not.toContain("secret");
    expect(fields.some((f) => f.label === "Email")).toBe(false);
  });
});

describe("buildOverview", () => {
  it("counts only readable tables, ranks adoption and reports what failed", () => {
    const clients = buildClients(
      [
        { email: "a@x.test", created_at: "2026-09-18T00:00:00Z" },
        { email: "b@x.test", created_at: "2026-08-01T00:00:00Z" },
      ],
      [],
      configs,
    );
    const overview = buildOverview(clients, configs, NOW);
    expect(overview).toMatchObject({
      totalClients: 2,
      totalConfigs: 3,
      newClients: 1,
      mostAdopted: { name: "Lead Qualification", count: 2 },
    });
    expect(overview.adoption.map((a) => a.name)).toEqual(["Lead Qualification", "Meta Ads", "Podcast"]);
    expect(Math.round(overview.adoption[0]!.share)).toBe(67);
    expect(overview.unreadable).toEqual(["Custom Agent"]);
  });

  it("has no most-adopted agent when nothing is configured", () => {
    expect(buildOverview([], [{ name: "X", ok: true, rows: [] }], NOW).mostAdopted).toBeNull();
  });
});

describe("agent configuration columns", () => {
  it("puts email first and collects keys from every row, capped at six", () => {
    const rows = [
      { email: "a", one: 1 },
      { two: 2, three: 3, created_at: "x", four: 4, five: 5, six: 6 },
    ];
    expect(configColumns(rows)).toEqual(["email", "one", "two", "three", "four", "five"]);
  });

  it("masks credential columns in the table too", () => {
    const [row] = configRows([{ email: "a@x.test", api_key: "sk-123" }], ["email", "api_key"]);
    expect(row!.cells.api_key).not.toContain("sk-123");
  });
});
