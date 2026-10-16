import { render, screen } from "@testing-library/react";
import { MailboxNote, mailboxLabel } from "./mailbox-note";

describe("mailboxLabel", () => {
  it("names the mailbox with whatever the record has", () => {
    expect(mailboxLabel({ name: "Sales", address: "sales@acme.com" })).toBe("Sales (sales@acme.com)");
    expect(mailboxLabel({ name: "", address: "sales@acme.com" })).toBe("sales@acme.com");
    expect(mailboxLabel({ name: "Sales", address: "" })).toBe("Sales");
    expect(mailboxLabel({ name: "", address: "" })).toBeNull();
  });
});

describe("MailboxNote", () => {
  it("never prints the label beside itself when the address is unknown", () => {
    render(<MailboxNote mailbox={{ name: "", address: "" }} label="Connected mailbox:" />);
    expect(screen.getByText(/A mailbox is connected/)).toBeInTheDocument();
    expect(screen.queryByText(/Connected mailbox:/)).toBeNull();
  });

  it("names a known mailbox after the label", () => {
    render(<MailboxNote mailbox={{ name: "", address: "sales@acme.com" }} label="Sends from" />);
    expect(screen.getByText("sales@acme.com")).toBeInTheDocument();
  });
});
