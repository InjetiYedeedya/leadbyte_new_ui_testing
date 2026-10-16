import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionGroup, ConnectionLogo, ConnectionRow } from "./connection-list";

describe("ConnectionRow", () => {
  it("shows Connect in place of a 'Not connected' badge", () => {
    render(
      <ConnectionRow
        label="Google Ads"
        purpose="Campaign spend, clicks, conversions and CPA."
        status="connection-not-connected"
        statusLabel="Not connected"
        action={<a href="/api/ads/connect?platform=google-ads">Connect</a>}
      />,
    );
    // The button says it, and is the thing to press.
    expect(screen.queryByText("Not connected")).toBeNull();
    expect(screen.getByRole("link", { name: "Connect" })).toHaveAttribute(
      "href",
      "/api/ads/connect?platform=google-ads",
    );
  });

  it("puts the status at the top, level with the name, and leaves the bottom row to the buttons (2026-10-13)", () => {
    render(
      <ConnectionRow
        label="Google Ads"
        purpose="Campaign spend, clicks, conversions and CPA."
        status="connection-connected"
        statusLabel="Connected"
        detail={<p>Ad account: Leadbyte AI</p>}
        action={
          <>
            <a href="/api/ads/connect?platform=google-ads">Reconnect</a>
            <button type="button">Disconnect</button>
          </>
        }
      />,
    );
    const heading = screen.getByRole("heading", { name: "Google Ads" });
    // Same row as the name…
    expect(heading.parentElement).toContainElement(screen.getByText("Connected"));
    // …and not in the row with the buttons.
    expect(screen.getByRole("button", { name: "Disconnect" }).parentElement).not.toContainElement(
      screen.getByText("Connected"),
    );
  });

  it("links the name where it has somewhere to go, and leaves the buttons their own", () => {
    render(
      <ConnectionRow
        label="Meta Ads"
        href="/agents?agent=meta-ads"
        purpose="Facebook and Instagram campaign performance."
        status="connection-connected"
        statusLabel="Connected"
        action={<a href="/api/ads/connect?platform=meta-ads">Reconnect</a>}
      />,
    );
    expect(screen.getByRole("link", { name: "Meta Ads" })).toHaveAttribute("href", "/agents?agent=meta-ads");
    // The button is a separate link with its own destination, not inside the name's.
    expect(screen.getByRole("link", { name: "Reconnect" })).toHaveAttribute("href", "/api/ads/connect?platform=meta-ads");
  });

  it("keeps the name as plain text where there is nowhere to go (GitHub, WordPress)", () => {
    render(
      <ConnectionRow
        label="GitHub"
        purpose="Where blog posts and website fixes are delivered."
        status="connection-connected"
        statusLabel="Connected"
        action={<button type="button">Disconnect</button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "GitHub" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "GitHub" })).toBeNull();
  });

  it("keeps every other state's word beside its action", () => {
    render(
      <ConnectionRow
        label="Google Analytics"
        purpose="Sessions, pages, traffic sources and conversions."
        status="connection-not-connected"
        statusLabel="Expired"
        action={<a href="/api/google/connect?flow=analytics">Reconnect</a>}
      />,
    );
    // "Expired" uses the not-connected colour but is not the same message.
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("shows a connected account's details, its status and its actions together", () => {
    render(
      <ConnectionRow
        label="Meta Ads"
        purpose="Facebook and Instagram campaign performance."
        status="connection-connected"
        statusLabel="Connected"
        detail={<p>Ad account: Acme Bakery</p>}
        action={
          <>
            <a href="/api/ads/connect?platform=meta-ads">Reconnect</a>
            <button type="button">Disconnect</button>
          </>
        }
        logo={<ConnectionLogo src="/logos/meta.svg" />}
      />,
    );
    expect(screen.getByText("Ad account: Acme Bakery")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Meta Ads" })).toBeInTheDocument();
  });

  it("keeps an unfinished setup's way forward on the card", () => {
    render(
      <ConnectionRow
        label="Facebook"
        purpose="Page posting and engagement metrics."
        status="connection-analysing"
        statusLabel="Finish setup"
        secondaryAction={<a href="/intelligence/connections?choose=facebook">Choose account</a>}
        action={<a href="/api/social/connect?platform=facebook">Reconnect</a>}
      />,
    );
    expect(screen.getByText("Finish setup")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose account" })).toBeInTheDocument();
  });
});

describe("ConnectionGroup", () => {
  it("heads its cards with the category name and line", () => {
    render(
      <ConnectionGroup title="Analytics" description="Understand your website traffic.">
        <p>card</p>
      </ConnectionGroup>,
    );
    expect(screen.getByRole("heading", { name: "Analytics" })).toBeInTheDocument();
    expect(screen.getByText("Understand your website traffic.")).toBeInTheDocument();
  });
});
