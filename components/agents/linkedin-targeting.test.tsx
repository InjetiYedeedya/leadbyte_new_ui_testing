import { fireEvent, render, screen } from "@testing-library/react";
import { LinkedInTargeting } from "./linkedin-targeting";

function renderInForm() {
  const { container } = render(
    <form>
      <LinkedInTargeting />
    </form>,
  );
  const form = container.querySelector("form") as HTMLFormElement;
  return () => new FormData(form);
}

const card = (name: RegExp) => screen.getByRole("checkbox", { name });
const headings = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

describe("LinkedInTargeting", () => {
  it("starts with Member interests on, locked, and its block shown", () => {
    renderInForm();
    expect(card(/Member interests/)).toBeChecked();
    expect(card(/Member interests/)).toBeDisabled();
    expect(headings()).toEqual(["Member interestsMandatory"]);
  });

  it("shows a block per chosen card, in the order chosen, interests last", () => {
    renderInForm();
    fireEvent.click(card(/Job skills/));
    fireEvent.click(card(/Company industries/));
    expect(headings()).toEqual(["Job skills", "Company industries", "Member interestsMandatory"]);
  });

  it("posts only ticked chips of chosen criteria", () => {
    const data = renderInForm();
    fireEvent.click(card(/Company size/));
    fireEvent.click(screen.getByRole("checkbox", { name: "11-50" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "SaaS" }));
    expect(data().getAll("criteria")).toEqual(["size"]);
    expect(data().getAll("targeting_size")).toEqual(["11-50"]);
    expect(data().getAll("targeting_interests")).toEqual(["SaaS"]);
  });

  it("turns typed text into ticked chips, reusing a quick pick by name", () => {
    const data = renderInForm();
    const box = screen.getByRole("textbox", { name: "Add member interests" });
    fireEvent.change(box, { target: { value: "saas, Fintech" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(data().getAll("targeting_interests")).toEqual(["SaaS", "Fintech"]);
    expect(screen.getAllByRole("checkbox", { name: "SaaS" })).toHaveLength(1);
  });

  it("None clears every criterion but Member interests", () => {
    const data = renderInForm();
    fireEvent.click(card(/Job titles/));
    fireEvent.click(card(/Education degrees/));
    fireEvent.click(screen.getByRole("button", { name: /None/ }));
    expect(data().getAll("criteria")).toEqual([]);
    expect(headings()).toEqual(["Member interestsMandatory"]);
  });

  it("posts the criteria in the order they were picked, not the cards' order (2026-10-08)", () => {
    const data = renderInForm();
    fireEvent.click(card(/Job skills/));
    fireEvent.click(card(/Company industries/));
    expect(data().getAll("criteria")).toEqual(["skills", "industries"]);
  });

  it("keeps what was typed and ticked when a card is turned off and on again (2026-10-08)", () => {
    const data = renderInForm();
    fireEvent.click(card(/Job titles/));
    const box = screen.getByRole("textbox", { name: "Add job titles" });
    fireEvent.change(box, { target: { value: "CEO, Founder" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.click(card(/Job titles/));
    // Off: nothing of it posts.
    expect(data().getAll("targeting_titles")).toEqual([]);
    fireEvent.click(card(/Job titles/));
    expect(data().getAll("targeting_titles")).toEqual(["CEO", "Founder"]);
  });

  it("None is a reset: it clears what was typed as well", () => {
    const data = renderInForm();
    fireEvent.click(card(/Job titles/));
    const box = screen.getByRole("textbox", { name: "Add job titles" });
    fireEvent.change(box, { target: { value: "CEO" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /None/ }));
    fireEvent.click(card(/Job titles/));
    expect(data().getAll("targeting_titles")).toEqual([]);
  });

  it("comes back filled in from the answers it was sent back with (2026-10-08)", () => {
    const { container } = render(
      <form>
        <LinkedInTargeting
          initialCriteria={["titles", "size", "interests"]}
          initialValues={{ titles: ["CEO"], size: ["11-50"], interests: ["SaaS"] }}
        />
      </form>,
    );
    const data = new FormData(container.querySelector("form") as HTMLFormElement);
    expect(data.getAll("criteria")).toEqual(["titles", "size"]);
    expect(data.getAll("targeting_titles")).toEqual(["CEO"]);
    expect(data.getAll("targeting_size")).toEqual(["11-50"]);
    expect(data.getAll("targeting_interests")).toEqual(["SaaS"]);
  });
});
