/**
 * The checkout form's fields, and what `POST /stripe/create-checkout-session`
 * requires of them.
 *
 * Ported from the legacy site's own `Checkout.jsx` validation, which the
 * backend contract matches exactly: `company_name`, `ein`, `billing_first_name`,
 * `billing_last_name`, `address`, `zip_code`, `email`.
 *
 * `ein` is a US employer identification number, `XX-XXXXXXX`. The backend
 * team has been asked to make it optional outside the US (see the backend
 * requirements this feature shipped with) — until that lands, this validates
 * it as required, matching what the live backend still expects today.
 */

export interface CheckoutFields {
  companyName: string;
  ein: string;
  billingFirstName: string;
  billingLastName: string;
  address: string;
  zipCode: string;
  email: string;
  /** India only, and optional there: a registered business's GST number. */
  gstin: string;
}

const EIN_PATTERN = /^\d{2}-\d{7}$/;
const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;
/** An Indian PIN code: six digits, never starting with 0. */
const PIN_PATTERN = /^[1-9]\d{5}$/;
/** A GSTIN: state code, PAN, entity number, "Z", checksum. */
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Auto-formats digits as `XX-XXXXXXX` while someone is still typing. */
export function formatEin(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function readCheckoutForm(formData: FormData): CheckoutFields {
  return {
    companyName: str(formData.get("companyName")),
    ein: str(formData.get("ein")),
    billingFirstName: str(formData.get("billingFirstName")),
    billingLastName: str(formData.get("billingLastName")),
    address: str(formData.get("address")),
    zipCode: str(formData.get("zipCode")),
    email: str(formData.get("email")),
    gstin: str(formData.get("gstin")).toUpperCase(),
  };
}

/**
 * Every reason the form isn't ready to submit, in the order the fields
 * appear — so the first message on screen matches the first empty field.
 * Empty array means the form may be submitted.
 */
/**
 * Every problem at once. The rules depend on who is paying: a USD checkout is
 * a US company's (Stripe asks for its EIN, and addresses carry a ZIP); an INR
 * one is an Indian company's (a PIN code, and a GSTIN only if it has one).
 */
export function validateCheckoutForm(fields: CheckoutFields, currency: "USD" | "INR" = "USD"): string[] {
  const errors: string[] = [];
  const india = currency === "INR";

  if (fields.companyName === "") errors.push("Company name is required.");
  if (!india && !EIN_PATTERN.test(fields.ein)) errors.push("EIN must be in the form XX-XXXXXXX.");
  if (india && fields.gstin !== "" && !GSTIN_PATTERN.test(fields.gstin)) {
    errors.push("GSTIN must be 15 characters, like 22AAAAA0000A1Z5.");
  }
  if (fields.billingFirstName === "") errors.push("Billing first name is required.");
  if (fields.billingLastName === "") errors.push("Billing last name is required.");
  if (fields.address === "") errors.push("Billing address is required.");
  if (india ? !PIN_PATTERN.test(fields.zipCode) : !ZIP_PATTERN.test(fields.zipCode)) {
    errors.push(india ? "Enter a valid 6-digit PIN code." : "Enter a valid ZIP code.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) errors.push("Enter a valid email address.");

  return errors;
}
