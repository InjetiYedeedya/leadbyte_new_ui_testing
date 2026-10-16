import { frontDoor, resetFrontDoorForTests } from "./front-door";

const FILE = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));

function assets() {
  const fetch = vi.fn(async () => new Response(FILE.slice().buffer, { status: 200 }));
  return { fetch };
}

beforeEach(() => resetFrontDoorForTests());

describe("frontDoor", () => {
  it("answers a video range with 206 without reaching Next", async () => {
    const binding = assets();
    const res = await frontDoor(
      new Request("https://app.test/background-video", { headers: { range: "bytes=10-19" } }),
      binding,
    );
    expect(res?.status).toBe(206);
    expect(res?.headers.get("content-range")).toBe("bytes 10-19/100");
    expect([...new Uint8Array(await res!.arrayBuffer())]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it("reads the file once for many pieces", async () => {
    const binding = assets();
    for (const range of ["bytes=0-", "bytes=20-", "bytes=50-"]) {
      await frontDoor(new Request("https://app.test/background-video", { headers: { range } }), binding);
    }
    expect(binding.fetch).toHaveBeenCalledTimes(1);
  });

  it("hands the video to Next when the file cannot be read", async () => {
    const binding = { fetch: vi.fn(async () => new Response(null, { status: 404 })) };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await frontDoor(new Request("https://app.test/background-video"), binding)).toBeNull();
    spy.mockRestore();
  });

  it("answers a bot probe with a bare 404", async () => {
    const res = await frontDoor(new Request("https://app.test/.env"), assets());
    expect(res?.status).toBe(404);
  });

  it("leaves pages to Next", async () => {
    expect(await frontDoor(new Request("https://app.test/overview"), assets())).toBeNull();
    expect(await frontDoor(new Request("https://app.test/overview?_rsc=abc"), assets())).toBeNull();
  });
});
