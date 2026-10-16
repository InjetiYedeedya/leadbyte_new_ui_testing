export {};

const FILE = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: { ASSETS: { fetch: async () => new Response(FILE.slice().buffer, { status: 200 }) } },
  }),
}));

const { GET, HEAD } = await import("./route");

describe("/background-video", () => {
  it("answers a range with 206 and exactly those bytes — what Safari needs", async () => {
    const res = await GET(new Request("https://app.test/background-video", { headers: { range: "bytes=0-1" } }));
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-1/100");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0, 1]);
  });

  it("sends the whole file with 200 when no range is asked for", async () => {
    const res = await GET(new Request("https://app.test/background-video"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("100");
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  it("refuses a range past the end with 416", async () => {
    const res = await GET(new Request("https://app.test/background-video", { headers: { range: "bytes=500-" } }));
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */100");
  });

  it("answers HEAD with headers and no body", async () => {
    const res = await HEAD(new Request("https://app.test/background-video"));
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(await res.text()).toBe("");
  });
});
