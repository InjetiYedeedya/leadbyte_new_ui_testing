import { isApiKeyName, mapApiKeys } from "./api-keys";

describe("API keys", () => {
  it("shows every known key, set or not, and only the tail the backend sent", () => {
    const keys = mapApiKeys([
      {
        key_name: "openai",
        masked_value: "••••1a2b",
        has_value: true,
        synced_to_n8n: true,
        updated_at: "2026-09-14T03:35:00Z",
        updated_by: "t@x",
      },
      { key_name: "unknown", has_value: true },
    ]);
    expect(keys.map((k) => k.key)).toEqual(["n8n_api_key", "openai", "claude", "ahrefs"]);
    expect(keys[1]).toMatchObject({
      hasValue: true,
      masked: "••••1a2b",
      synced: true,
      updatedBy: "t@x",
      updatedLabel: "14 Sep 2026, 09:05",
    });
    expect(keys[2]).toMatchObject({ hasValue: false, masked: "", updatedLabel: "" });
  });

  it("accepts only the four names", () => {
    expect(isApiKeyName("claude")).toBe(true);
    expect(isApiKeyName("aws")).toBe(false);
  });
});
