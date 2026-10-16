import { OPENING_MESSAGE, newSessionId, readOutput } from "./marketing-strategy";

describe("readOutput", () => {
  it("reads the documented shape", () => {
    expect(readOutput({ output: "Here is your strategy." })).toBe("Here is your strategy.");
  });

  it("unwraps n8n's single-item array", () => {
    expect(readOutput([{ output: "hello" }])).toBe("hello");
  });

  it("accepts a bare string, since the Lambda forwards verbatim", () => {
    expect(readOutput(" hi ")).toBe("hi");
  });

  it("falls back to other likely keys if the agent's shape changes", () => {
    expect(readOutput({ text: "from text" })).toBe("from text");
    expect(readOutput({ message: "from message" })).toBe("from message");
  });

  it("returns empty for anything unreadable, never [object Object]", () => {
    expect(readOutput({ unexpected: { nested: true } })).toBe("");
    expect(readOutput(null)).toBe("");
    expect(readOutput([])).toBe("");
    expect(readOutput({ output: "   " })).toBe("");
  });
});

describe("newSessionId", () => {
  it("is shaped like the backend's own ids, so logs can be matched by eye", () => {
    expect(newSessionId()).toMatch(/^strategy_\d{13}_[0-9a-f]{11}$/);
  });

  it("is different every time — one id per conversation, never reused", () => {
    expect(newSessionId()).not.toBe(newSessionId());
  });
});

describe("OPENING_MESSAGE", () => {
  it("is just a greeting, because the agent runs the interview", () => {
    // Sending our own questionnaire first duplicated the agent's job and forced
    // its answers into a shape it never asked for.
    expect(OPENING_MESSAGE).toBe("Hi");
  });
});

/**
 * The agent's own deadline.
 *
 * `apiRequest` now converts an abort into `ApiTimeoutError` before any caller
 * sees it, so a check on `error.name === "TimeoutError"` — which is what this
 * module used to do — silently stopped matching. The customer would then get
 * the plumbing's wording ("… did not answer within 45000ms") instead of being
 * told their message was not lost.
 */
describe("sendStrategyMessage on a timeout", () => {
  it("tells the customer their message survived, not what our client did", async () => {
    vi.resetModules();
    vi.doMock("@/lib/api/client", async () => {
      const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
      return {
        ...actual,
        apiRequest: vi.fn().mockRejectedValue(new actual.ApiTimeoutError("/api/webhook/x", 45000)),
      };
    });

    const { sendStrategyMessage } = await import("./marketing-strategy");
    const error = await sendStrategyMessage({
      sessionId: "s1",
      chatInput: "hello",
    }).catch((e: unknown) => e);

    // It has the message: telling them to resend ran a second paid turn.
    expect((error as Error).message).toContain("instead of sending it again");
    vi.doUnmock("@/lib/api/client");
  });
});
