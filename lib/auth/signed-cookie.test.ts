import { signValue, verifyValue } from "./signed-cookie";

describe("signed cookie values", () => {
  it("reads back exactly what was signed", async () => {
    const stored = await signValue("leadbyte_session", "customer@example.com");
    expect(await verifyValue("leadbyte_session", stored)).toBe("customer@example.com");
  });

  it("rejects an edited value — the admin-email forgery", async () => {
    const stored = await signValue("leadbyte_session", "customer@example.com");
    const forged = stored.replace("customer@example.com", "thilak@ntimes.ai");
    expect(await verifyValue("leadbyte_session", forged)).toBeNull();
  });

  it("rejects a plain, unsigned value from before signing existed", async () => {
    expect(await verifyValue("leadbyte_session", "customer@example.com")).toBeNull();
  });

  it("rejects a signed value moved into a different cookie", async () => {
    const uid = await signValue("leadbyte_uid", "customer@example.com");
    expect(await verifyValue("leadbyte_session", uid)).toBeNull();
  });

  it("treats a missing cookie as absent", async () => {
    expect(await verifyValue("leadbyte_session", undefined)).toBeNull();
  });
});

describe("sealed cookie values", () => {
  it("round-trips a secret, and the stored form does not contain it", async () => {
    const { sealValue, unsealValue } = await import("./signed-cookie");
    const stored = await sealValue("sk-proj-abcdef123456");
    expect(stored).not.toContain("sk-proj");
    expect(await unsealValue(stored)).toBe("sk-proj-abcdef123456");
  });

  it("reads a tampered or plain value as absent", async () => {
    const { sealValue, unsealValue } = await import("./signed-cookie");
    const stored = await sealValue("sk-proj-abcdef123456");
    expect(await unsealValue(stored.slice(0, -3) + "AAA")).toBeNull();
    expect(await unsealValue("sk-proj-plaintext")).toBeNull();
  });
});
