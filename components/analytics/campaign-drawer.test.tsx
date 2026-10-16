import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampaignDrawer } from "./campaign-drawer";
import type { AdCampaignRow } from "@/lib/data/ads-insights";

/**
 * The drawer holds the page still while it is open (`useScrollLock`), and the
 * thing that has to be true is that it lets go again — by every route out,
 * not just the Close button.
 *
 * `<dialog>` closes itself on Escape. If that does not reach React, the lock
 * is never released: the page cannot scroll and the drawer cannot be reopened,
 * both until a reload. This is that case, pinned.
 */

const CAMPAIGN = {
  id: "c1",
  name: "Zippygo app promotion",
  status: "PAUSED",
  type: "multi channel",
  spend: 372,
  impressions: 8476,
  clicks: 854,
  ctr: 10.08,
  conversions: 167,
  costPerConversion: 2.23,
  costPerClick: 0.43,
  conversionValue: null,
  roas: null,
  leads: null,
  reach: null,
  dailyBudget: null,
  totalBudget: null,
  startDate: null,
  endDate: null,
  iosInstalls: null,
  androidInstalls: null,
} as unknown as AdCampaignRow;

/** The parent's half of the contract: null closes the drawer. */
function Host() {
  const [campaign, setCampaign] = useState<AdCampaignRow | null>(null);
  return (
    <>
      <button type="button" onClick={() => setCampaign(CAMPAIGN)}>
        Open the campaign
      </button>
      <CampaignDrawer
        campaign={campaign}
        days={[]}
        statusVariant={() => "agent-ready"}
        onClose={() => setCampaign(null)}
      />
    </>
  );
}

beforeAll(() => {
  // jsdom implements neither, and the component drives a real <dialog>. Same
  // shim as `selection-mode-gate.test.tsx`, including the `close` event —
  // which is the part this file is about.
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

describe("CampaignDrawer scroll lock", () => {
  it("pins the page while open and releases it on the Close button", async () => {
    render(<Host />);
    expect(document.body.style.position).toBe("");

    await userEvent.click(screen.getByRole("button", { name: "Open the campaign" }));
    expect(document.body.style.position).toBe("fixed");

    await userEvent.click(screen.getByRole("button", { name: /Close/i }));
    expect(document.body.style.position).toBe("");
  });

  it("releases the page when the dialog closes itself, as Escape makes it", async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: "Open the campaign" }));
    expect(document.body.style.position).toBe("fixed");

    // Exactly what Escape does: the element closes and fires a non-bubbling
    // `close`. `act` is what flushes the state update and the effect cleanup
    // it causes — without it this asserts before React has done either, which
    // would fail whether or not the app is correct.
    const dialog = document.querySelector("dialog")!;
    await act(async () => {
      dialog.close();
    });

    // A pinned body with no dialog open is a page that cannot be scrolled and
    // a drawer that cannot be reopened.
    expect(document.body.style.position).toBe("");
  });
});
