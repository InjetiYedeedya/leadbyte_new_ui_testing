import { existingPostOf, postLaunchExtras, readPostReference } from "./engagement-post";

describe("readPostReference", () => {
  it("accepts a post id, Meta's pageId_postId, or a Facebook/Instagram link", () => {
    expect(readPostReference(" 1234567890 ")).toBe("1234567890");
    expect(readPostReference("112233445566_998877665544")).toBe("112233445566_998877665544");
    expect(readPostReference("https://www.instagram.com/p/C8abcDEF/")).toBe("https://www.instagram.com/p/C8abcDEF/");
    expect(readPostReference("https://www.facebook.com/zippygo/posts/pfbid02x")).toBe(
      "https://www.facebook.com/zippygo/posts/pfbid02x",
    );
  });

  it("refuses anything else", () => {
    expect(readPostReference("")).toBe("");
    expect(readPostReference("my best post")).toBe("");
    expect(readPostReference("123")).toBe("");
    expect(readPostReference("https://example.com/post/1")).toBe("");
    expect(readPostReference("https://www.facebook.com/")).toBe("");
    expect(readPostReference("javascript:alert(1)")).toBe("");
    expect(readPostReference(null)).toBe("");
  });
});

describe("postLaunchExtras", () => {
  it("sends the post under every key a branch may read", () => {
    expect(postLaunchExtras("111111_222222")).toEqual({
      existingPostId: "111111_222222",
      post_id: "111111_222222",
      object_story_id: "111111_222222",
    });
    expect(postLaunchExtras("https://www.instagram.com/p/abc/")).toMatchObject({ postUrl: "https://www.instagram.com/p/abc/" });
    expect(postLaunchExtras("")).toEqual({});
  });

  it("is read back from the stored extras", () => {
    expect(existingPostOf(postLaunchExtras("1234567890"))).toBe("1234567890");
    expect(existingPostOf({ audienceType: "new" })).toBe("");
    expect(existingPostOf(undefined)).toBe("");
  });
});
