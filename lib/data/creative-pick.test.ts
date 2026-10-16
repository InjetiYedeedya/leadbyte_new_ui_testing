import { parsePick, serialisePick } from "@/lib/data/creative-pick";

describe("parsePick", () => {
  it("round-trips a job with no choice yet", () => {
    const pick = { jobId: "j1", token: "t1" };
    expect(parsePick(serialisePick(pick))).toEqual(pick);
  });

  it("round-trips a chosen prompt, index 0 included", () => {
    const pick = {
      jobId: "j1",
      token: "t1",
      chosen: { index: 0, model: "gpt-5.5", prompt: "3-shot vertical" },
    };
    expect(parsePick(serialisePick(pick))).toEqual(pick);
  });

  it("is null for anything unreadable, rather than throwing", () => {
    // A campaign must still be launchable when this cookie is nonsense — that
    // is the state every launch was in before the pipeline existed.
    expect(parsePick(undefined)).toBeNull();
    expect(parsePick("")).toBeNull();
    expect(parsePick("not-base64!!")).toBeNull();
    expect(parsePick(Buffer.from("[]").toString("base64url"))).toBeNull();
    expect(parsePick(Buffer.from('{"jobId":"j"}').toString("base64url"))).toBeNull();
  });

  it("drops a half-written choice instead of sending part of one", () => {
    const raw = Buffer.from(
      JSON.stringify({ jobId: "j", token: "t", chosen: { index: 1 } }),
    ).toString("base64url");
    expect(parsePick(raw)).toEqual({ jobId: "j", token: "t" });
  });
});
