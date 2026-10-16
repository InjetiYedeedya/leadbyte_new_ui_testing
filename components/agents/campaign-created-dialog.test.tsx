import { render, screen } from "@testing-library/react";
import { CampaignCreatedDialog } from "./campaign-created-dialog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

beforeAll(() => {
  // jsdom implements neither, and the component drives a real <dialog>.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

describe("CampaignCreatedDialog", () => {
  it("names the campaign that just went out", () => {
    render(
      <CampaignCreatedDialog
        platform="Meta Ads"
        summary={[
          ["Goal", "Leads"],
          ["Budget", "₹500 per day"],
        ]}
      />,
    );
    expect(screen.getByText("Goal")).toBeTruthy();
    expect(screen.getByText("₹500 per day")).toBeTruthy();
  });

  it("shows no details block when nothing is known", () => {
    const { container } = render(<CampaignCreatedDialog platform="Meta Ads" />);
    expect(container.querySelector("dl")).toBeNull();
  });
});
