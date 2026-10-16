import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeadActivityTable } from "./lead-activity-table";
import type { LeadActivity } from "@/lib/data/lead-qualification";

const ROW: LeadActivity = {
  leadEmail: "jane@example.com",
  rowId: "jane@example.com#1",
  status: "sent",
  template: "Intro",
  opens: 0,
  clicks: 0,
  failed: false,
  sent: true,
  replied: false,
  updatedAt: "2026-10-01T10:00:00Z",
};

describe("LeadActivityTable — stopping one recipient", () => {
  it("replaces the button once the stop worked", async () => {
    const user = userEvent.setup();
    render(<LeadActivityTable rows={[ROW]} onStopRecipient={async () => ({ ok: true, message: "" })} />);

    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(await screen.findByText("stopped")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Stop|Try again/ })).toBeNull();
  });

  it("keeps the button and says why when the stop was refused", async () => {
    const user = userEvent.setup();
    render(
      <LeadActivityTable
        rows={[ROW]}
        onStopRecipient={async () => ({ ok: false, message: "The campaign service is busy." })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(await screen.findByRole("status")).toHaveTextContent("The campaign service is busy.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });
});
