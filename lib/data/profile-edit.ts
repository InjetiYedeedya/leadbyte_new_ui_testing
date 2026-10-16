/**
 * Correcting what the crawler understood about the business.
 *
 * ## Why this exists
 *
 * The Business profile screen has always said "Review it and edit anything
 * that's wrong". There was no edit control and no Server Action that wrote the
 * profile — the sentence was an instruction to use a feature that did not
 * exist, on a page whose own extracted description ended mid-sentence.
 *
 * Pure: the reader and the validator are here so they can be tested without a
 * network, and the transport lives in `business-profile-repo.ts`.
 */

/** The three fields the profile screen presents as facts about the business. */
export interface ProfileEdit {
  businessName: string;
  businessType: string;
  description: string;
}

/**
 * Long enough to be a description rather than a label.
 *
 * Not the ads service's 40 — this one feeds the strategy agent and the brand
 * sheet, not a `prepare` call, so the floor is ours. It exists because the
 * field it replaces is routinely a mangled sentence fragment, and accepting a
 * three-word replacement would trade one unusable value for another.
 */
export const DESCRIPTION_MIN = 20;

/**
 * Deliberately well above what the crawler writes.
 *
 * A real account's stored description measured exactly 600 characters — the
 * number this cap originally used. That is one character from a form that
 * refuses to save the value it was prefilled with, which reads as the edit
 * being broken rather than the text being long. Whatever the system produced,
 * the customer must always be able to save back unchanged, so the ceiling is
 * a limit on what they can ADD rather than a judgement on what is already
 * there.
 */
export const DESCRIPTION_MAX = 1200;
export const NAME_MAX = 120;

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readProfileEdit(form: FormData): ProfileEdit {
  return {
    businessName: str(form.get("businessName")),
    businessType: str(form.get("businessType")),
    description: str(form.get("description")),
  };
}

/**
 * Everything wrong with the edit, all at once.
 *
 * `businessType` is deliberately unvalidated beyond a length: it is free text
 * in the backend row (`businessType` / `businessTypeOther`), and a customer who
 * calls themselves something we have no category for is describing their
 * business correctly, not filling the form in wrongly.
 */
export function validateProfileEdit(edit: ProfileEdit): string[] {
  const problems: string[] = [];

  if (edit.businessName === "") {
    problems.push("Add the business name.");
  } else if (edit.businessName.length > NAME_MAX) {
    problems.push(`The business name is longer than ${NAME_MAX} characters.`);
  }

  if (edit.description === "") {
    problems.push("Add a description — the strategy agent and every ad the agents write use it.");
  } else if (edit.description.length < DESCRIPTION_MIN) {
    problems.push(`Describe the business in at least ${DESCRIPTION_MIN} characters.`);
  } else if (edit.description.length > DESCRIPTION_MAX) {
    problems.push(`Keep the description under ${DESCRIPTION_MAX} characters.`);
  }

  if (edit.businessType.length > NAME_MAX) {
    problems.push(`The business type is longer than ${NAME_MAX} characters.`);
  }

  return problems;
}

/**
 * The row fields to PUT, under the backend's own spellings.
 *
 * `companyName`, not `businessName` — `mapProfile` reads the row's
 * `companyName` into the profile's `businessName`, and writing the wrong one
 * produces a save that reports success and changes nothing visible.
 *
 * **`email` is NOT here and must never be.** It is this table's partition key
 * and already travels in the URL; repeating it in the body asks DynamoDB to SET
 * a key attribute, which it rejects — the mistake that broke sign-in on
 * 2026-09-02.
 */
export function profileEditPayload(edit: ProfileEdit): Record<string, string> {
  return {
    companyName: edit.businessName,
    businessType: edit.businessType,
    description: edit.description,
  };
}
