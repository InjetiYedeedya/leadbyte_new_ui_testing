import {
  MAX_STORED_CHARS,
  MAX_STORED_TURNS,
  parseStoredConversation,
  serialiseConversation,
} from "./strategy-conversation";
import type { StrategyTurn } from "./marketing-strategy";

const turn = (i: number, text = `message ${i}`): StrategyTurn => ({
  role: i % 2 === 0 ? "user" : "agent",
  text,
  at: `2026-10-08T10:${String(i % 60).padStart(2, "0")}:00Z`,
});

describe("stored strategy conversation (2026-10-08)", () => {
  it("round-trips the session id and every turn", () => {
    const conversation = { sessionId: "s-1", turns: [turn(0), turn(1)] };
    expect(parseStoredConversation(serialiseConversation(conversation))).toEqual(conversation);
  });

  it("keeps only the newest turns when there are too many", () => {
    const turns = Array.from({ length: MAX_STORED_TURNS + 5 }, (_, i) => turn(i));
    const stored = parseStoredConversation(serialiseConversation({ sessionId: "s", turns }));
    expect(stored?.turns).toHaveLength(MAX_STORED_TURNS);
    expect(stored?.turns[0]).toEqual(turns[5]);
  });

  it("drops the oldest turns until it fits the size cap, keeping at least one", () => {
    const big = "x".repeat(MAX_STORED_CHARS / 3);
    const turns = [turn(0, big), turn(1, big), turn(2, big), turn(3, big)];
    const text = serialiseConversation({ sessionId: "s", turns });
    expect(text.length).toBeLessThanOrEqual(MAX_STORED_CHARS);
    expect(parseStoredConversation(text)?.turns.at(-1)).toEqual(turns[3]);
  });

  it("never stores the transient error", () => {
    expect(serialiseConversation({ sessionId: "s", turns: [], error: "boom" })).not.toContain("boom");
  });

  it("reads nothing usable as no conversation, and skips malformed turns", () => {
    expect(parseStoredConversation(undefined)).toBeNull();
    expect(parseStoredConversation("")).toBeNull();
    expect(parseStoredConversation("{not json")).toBeNull();
    expect(parseStoredConversation(JSON.stringify({ turns: [] }))).toBeNull();
    const mixed = JSON.stringify({ sessionId: "s", turns: [turn(0), { role: "bot", text: 1 }, null] });
    expect(parseStoredConversation(mixed)?.turns).toEqual([turn(0)]);
  });
});
