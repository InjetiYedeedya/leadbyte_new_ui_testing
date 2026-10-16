import { render, screen } from "@testing-library/react";
import { GithubRow } from "./github-row";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/intelligence/connections",
}));

const CONNECTED = {
  kind: "connected" as const,
  domain: "acme.com",
  repos: ["acme/site"],
  installUrl: "https://github.com/apps/leadbyte/installations/new",
};

describe("GithubRow", () => {
  it("names the connected account once, from its repositories' owners", () => {
    render(
      <GithubRow
        connection={{ ...CONNECTED, repos: ["acme/site", "acme/blog", "other-org/docs"] }}
        check={vi.fn()}
      />,
    );
    expect(screen.getByText("acme, other-org")).toBeInTheDocument();
  });

  it("offers Disconnect on a connected site", () => {
    render(<GithubRow connection={CONNECTED} check={vi.fn()} disconnect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage on GitHub" })).toBeInTheDocument();
  });

  it("offers no Disconnect when not connected, or when no action is given", () => {
    const { rerender } = render(
      <GithubRow connection={{ kind: "not-connected", domain: "acme.com", installUrl: CONNECTED.installUrl }} check={vi.fn()} disconnect={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
    rerender(<GithubRow connection={CONNECTED} check={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
  });
});
