import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The gate is cookie-backed so it survives a Stripe redirect. These tests run
 * against a fake cookie jar rather than a real request, which keeps the rules
 * — persistence, per-business isolation, and validation of user-controlled
 * values — testable without a server.
 */

const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
}));

const { clearGate, getGate, getPlan, setGate, setPlan } = await import("./gate");

beforeEach(() => {
  jar.clear();
});

describe("gate", () => {
  it("defaults a business to the free plan", async () => {
    expect(await getPlan("acme")).toBe("free");
  });

  it("remembers a chosen plan", async () => {
    await setPlan("acme", "growth");
    expect(await getPlan("acme")).toBe("growth");
  });

  it("persists a pending gated action until explicitly cleared", async () => {
    await setGate("acme", "generate-strategy");
    expect(await getGate("acme")).toEqual({ actionId: "generate-strategy" });

    // Reading must not consume it — the user may reload mid-checkout.
    expect(await getGate("acme")).toEqual({ actionId: "generate-strategy" });

    await clearGate("acme");
    expect(await getGate("acme")).toBeNull();
  });

  it("keeps gate and plan state isolated per business", async () => {
    await setPlan("acme", "growth");
    await setGate("acme", "connect-linkedin");

    expect(await getPlan("other")).toBe("free");
    expect(await getGate("other")).toBeNull();
  });

  it("survives a round trip through the cookie jar", async () => {
    // What an in-memory gate could not do: come back from Stripe intact.
    await setGate("acme", "generate-strategy");
    const carried = new Map(jar); // the browser holds these across the redirect
    jar.clear();
    for (const [k, v] of carried) jar.set(k, v);

    expect(await getGate("acme")).toEqual({ actionId: "generate-strategy" });
  });

  it("rejects an unknown action id rather than trusting the cookie", async () => {
    // Cookies are user-controlled; an arbitrary value must never reach the
    // resume switch in upgrade/actions.ts.
    jar.set("leadbyte_gate_acme", "drop-tables");
    expect(await getGate("acme")).toBeNull();
  });

  it("rejects an unknown plan and falls back to free", async () => {
    jar.set("leadbyte_plan_acme", "enterprise-unlimited");
    expect(await getPlan("acme")).toBe("free");
  });
});
