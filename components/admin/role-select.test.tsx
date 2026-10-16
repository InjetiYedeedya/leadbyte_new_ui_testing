import { fireEvent, render, screen } from "@testing-library/react";
import { RoleSelect } from "./role-select";

// jsdom has no <dialog> methods, and no scrolling for the scroll lock.
beforeAll(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

function setup(role: "manager" | "super_admin" = "manager") {
  const submit = vi.fn();
  const view = render(<RoleSelect email="a@x.test" role={role} action={vi.fn()} />);
  const form = view.container.querySelector("form")!;
  form.requestSubmit = submit;
  return { submit, select: screen.getByLabelText("Role for a@x.test") as HTMLSelectElement };
}

describe("RoleSelect", () => {
  it("saves an ordinary role change straight away, with no extra button", async () => {
    const { submit, select } = setup();
    expect(screen.queryByRole("button", { name: /change/i })).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: "developer" } });
    await Promise.resolve();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("asks before making someone a super admin, and saves on confirm", () => {
    const { submit, select } = setup();
    fireEvent.change(select, { target: { value: "super_admin" } });
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText("Make a@x.test a super admin?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make super admin" }));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("puts the role back when taking super admin away is cancelled", () => {
    const { submit, select } = setup("super_admin");
    fireEvent.change(select, { target: { value: "manager" } });
    expect(screen.getByText("Change a@x.test to Manager?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(submit).not.toHaveBeenCalled();
    expect(select.value).toBe("super_admin");
  });
});
