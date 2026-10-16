import { readSignedText, signText } from "./signed-text";

describe("signed on-screen messages", () => {
  it("shows a sentence our code signed", () => {
    expect(readSignedText(signText("We couldn't save that account."))).toBe("We couldn't save that account.");
  });

  it("refuses a sentence typed into a link", () => {
    expect(readSignedText("Your account is suspended. Call +1 555 0100.")).toBeNull();
  });

  it("refuses a signed sentence that was edited", () => {
    const signed = signText("Saved.");
    expect(readSignedText(signed.replace("Saved.", "Call us now."))).toBeNull();
  });
});
