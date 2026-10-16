/**
 * How much the ad agent may do without coming back to ask.
 *
 * The customer chooses this the moment they finish the setup form, in a dialog
 * before anything is sent, and the answer travels to the agent as
 * `selectionMode`:
 *
 *   "ask"  — the agent should come back with choices for the customer to make.
 *   "auto" — the agent should pick the creative, budget and assets itself.
 *
 * ## It changes what the AGENT does, not which screens the customer sees
 *
 * The first version of this skipped the suggestion page for "auto", on the
 * reasoning that someone who asked not to be asked should not be shown a plan.
 * That also skipped the automation-mode dialog on that page — Full versus Semi
 * — which is a different question with a different answer, and one nobody had
 * agreed to drop. Every path now goes through the plan and that dialog, exactly
 * as before; `selectionMode` is a flag on the payload and nothing more.
 *
 * ## Why "ask" is the default and the fallback
 *
 * `selectionMode` used to be a constant: `"ask"` on the launch payload and an
 * explicit `null` on the approve hop. Now that it is a choice, every path that
 * cannot read a valid answer resolves to `"ask"` — a missing, misspelt or
 * forged value must never be the one that spends money without confirmation.
 * The dialog also refuses to submit until one is picked, so the default is a
 * backstop rather than a route anyone takes.
 *
 * Client-safe and pure: the dialog imports the labels, the Server Action
 * imports the reader.
 */

export type SelectionMode = "ask" | "auto";

export const SELECTION_MODES: {
  value: SelectionMode;
  label: string;
  description: string;
}[] = [
  {
    value: "ask",
    label: "Ask before acting",
    description:
      "The agent comes back with budget and creative options for you to choose from.",
  },
  {
    value: "auto",
    label: "Act without asking",
    // NOT "no confirmation step": the plan and the automation-mode dialog still
    // come next, whichever mode is chosen. Copy that promises a screen will be
    // skipped, on a flow that does not skip it, is a lie the customer catches
    // within one click.
    description:
      "The agent picks the creative, budget and assets itself. You still see the plan before anything runs.",
  },
];

/**
 * Reads the choice off the submitted form.
 *
 * Anything that is not exactly `"auto"` is `"ask"`. That asymmetry is
 * deliberate: the two values are not equally safe to guess at.
 */
export function readSelectionMode(value: unknown): SelectionMode {
  return value === "auto" ? "auto" : "ask";
}
