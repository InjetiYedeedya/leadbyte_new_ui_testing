import { fireEvent, render, screen } from "@testing-library/react";
import { BackLink } from "./back-link";

const back = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ back }), usePathname: () => "/somewhere" }));

afterEach(() => {
  back.mockReset();
  Object.defineProperty(document, "referrer", { value: "", configurable: true });
});

describe("BackLink", () => {
  it("is a real link to the fallback, labelled Back", () => {
    render(<BackLink fallbackHref="/agents" />);
    expect(screen.getByRole("link", { name: /Back/ })).toHaveAttribute("href", "/agents");
  });

  it("goes back in history when the last page was ours", () => {
    Object.defineProperty(document, "referrer", { value: `${window.location.origin}/agents/meta-ads`, configurable: true });
    window.history.pushState({}, "", "/somewhere");
    render(<BackLink fallbackHref="/agents" />);
    fireEvent.click(screen.getByRole("link", { name: /Back/ }));
    expect(back).toHaveBeenCalled();
  });

  it("shows a ring in place of the arrow while going back", () => {
    Object.defineProperty(document, "referrer", { value: `${window.location.origin}/agents/meta-ads`, configurable: true });
    window.history.pushState({}, "", "/somewhere");
    render(<BackLink fallbackHref="/agents" />);
    const link = screen.getByRole("link", { name: /Back/ });
    expect(link.querySelector(".animate-spin")).toBeNull();
    fireEvent.click(link);
    expect(link).toHaveAttribute("aria-busy", "true");
    expect(link.querySelector(".animate-spin")).not.toBeNull();
    expect(link).not.toHaveTextContent("←");
  });

  it("follows the fallback when the last page was another site", () => {
    Object.defineProperty(document, "referrer", { value: "https://example.com/", configurable: true });
    render(<BackLink fallbackHref="/agents" />);
    fireEvent.click(screen.getByRole("link", { name: /Back/ }));
    expect(back).not.toHaveBeenCalled();
  });
});
