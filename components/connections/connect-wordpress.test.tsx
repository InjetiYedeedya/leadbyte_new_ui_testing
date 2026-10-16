import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const save = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(app)/intelligence/connections/actions", () => ({
  saveWordpressAction: (input: unknown) => save(input),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ConnectWordpress } from "./connect-wordpress";

beforeAll(() => {
  // jsdom has no <dialog> methods.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  save.mockReset();
  refresh.mockReset();
});

function fill() {
  fireEvent.click(screen.getByRole("button", { name: "Connect WordPress" }));
  fireEvent.change(screen.getByLabelText("WordPress site address"), { target: { value: "example.com" } });
  fireEvent.change(screen.getByLabelText("WordPress username"), { target: { value: "john" } });
  fireEvent.change(screen.getByLabelText("Application Password"), { target: { value: "abcd efgh" } });
  fireEvent.click(screen.getByRole("button", { name: "Test and connect" }));
}

describe("ConnectWordpress", () => {
  it("sends the three fields and refreshes on success", async () => {
    save.mockResolvedValue({ ok: true, status: { kind: "connected", wpUrl: "https://example.com", userName: "john", updatedAt: null } });
    render(<ConnectWordpress />);
    fill();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith({ wpUrl: "example.com", userName: "john", appPassword: "abcd efgh" });
  });

  it("shows the backend's reason in place and keeps the form", async () => {
    save.mockResolvedValue({ ok: false, message: "WordPress didn't accept that username and Application Password." });
    render(<ConnectWordpress />);
    fill();
    expect(await screen.findByRole("alert")).toHaveTextContent(/didn't accept/);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText("WordPress username")).toHaveValue("john");
  });

  it("opens on the saved site to update, never showing a password", () => {
    render(<ConnectWordpress connected={{ wpUrl: "https://example.com", userName: "john" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(screen.getByLabelText("WordPress site address")).toHaveValue("https://example.com");
    expect(screen.getByLabelText("Application Password")).toHaveValue("");
  });
});
