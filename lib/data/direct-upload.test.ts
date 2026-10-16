import {
  PUT_INTERRUPTED,
  PUT_LINK_EXPIRED,
  PUT_TOO_LARGE,
  SIGN_SERVER_ERROR,
  SIGN_UNREACHABLE,
  directUpload,
} from "./direct-upload";

const file = new Blob(["x"], { type: "image/png" });
const SIGNED = JSON.stringify({ uploadUrl: "https://s3.example/put", fileUrl: "https://cdn.example/a.png" });

/** A fetch that answers each call in turn; a thrown Error stands for a network failure. */
function fakeFetch(...replies: Array<Response | Error>): typeof fetch {
  let i = 0;
  return (async () => {
    const reply = replies[i++];
    if (!reply || reply instanceof Error) throw reply ?? new Error("no reply");
    return reply;
  }) as typeof fetch;
}

describe("directUpload", () => {
  it("signs, puts and returns the file's url", async () => {
    const result = await directUpload({}, file, "image/png", fakeFetch(new Response(SIGNED), new Response("")));
    expect(result).toEqual({ ok: true, url: "https://cdn.example/a.png" });
  });

  it("says the sign step was unreachable when it never answered", async () => {
    const result = await directUpload({}, file, "image/png", fakeFetch(new TypeError("Failed to fetch")));
    expect(result).toEqual({ ok: false, error: SIGN_UNREACHABLE });
  });

  it("reads an error PAGE from the sign step as a server fault, not a bad connection", async () => {
    const page = new Response("<html>Error 1102</html>", { status: 503 });
    const result = await directUpload({}, file, "image/png", fakeFetch(page));
    expect(result).toEqual({ ok: false, error: SIGN_SERVER_ERROR });
  });

  it("passes the route's own words and sign-in link through", async () => {
    const reply = new Response(JSON.stringify({ error: "Use a JPG or PNG image.", signIn: "/login?stale=1" }), {
      status: 401,
    });
    const result = await directUpload({}, file, "image/png", fakeFetch(reply));
    expect(result).toEqual({ ok: false, error: "Use a JPG or PNG image.", signIn: "/login?stale=1" });
  });

  it("names an interrupted PUT, a too-large file and an expired link", async () => {
    expect(await directUpload({}, file, "image/png", fakeFetch(new Response(SIGNED), new TypeError("x")))).toEqual({
      ok: false,
      error: PUT_INTERRUPTED,
    });
    const tooLarge = new Response("<Error><Code>EntityTooLarge</Code></Error>", { status: 400 });
    expect(await directUpload({}, file, "image/png", fakeFetch(new Response(SIGNED), tooLarge))).toEqual({
      ok: false,
      error: PUT_TOO_LARGE,
    });
    const expired = new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
    expect(await directUpload({}, file, "image/png", fakeFetch(new Response(SIGNED), expired))).toEqual({
      ok: false,
      error: PUT_LINK_EXPIRED,
    });
  });
});
