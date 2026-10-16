/**
 * Form primitives.
 *
 * Server components. They render markup and styling; validation state is
 * passed in, not computed here — a Server Action returns errors and the page
 * re-renders with them. That keeps forms working without client JavaScript,
 * which is how every non-auth form in this app already behaves.
 *
 * Every field is labelled and every error is tied to its input via
 * `aria-describedby`, so the error is announced rather than merely coloured.
 */

import { SubmitButton as PendingSubmitButton } from "@/components/ui/submit-button";

let autoId = 0;
function fallbackId(prefix: string): string {
  autoId += 1;
  return `${prefix}-${autoId}`;
}

interface FieldShellProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function FieldShell({ id, label, hint, error, required, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-ink-soft">
        {label}
        {required && (
          <span className="ml-0.5 text-crit" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-crit">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  "w-full rounded-md border bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-soft focus:border-accent disabled:opacity-50";

function borderFor(error?: string): string {
  return error ? "border-crit" : "border-border";
}

export interface TextFieldProps {
  name: string;
  label: string;
  id?: string;
  type?: "text" | "email" | "password" | "tel" | "url" | "number";
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Shown and submitted, but not editable — a value the account decides. */
  readOnly?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "tel" | "email" | "url";
  pattern?: string;
  maxLength?: number;
}

export function TextField({
  name,
  label,
  id,
  type = "text",
  hint,
  error,
  required,
  ...rest
}: TextFieldProps) {
  const fieldId = id ?? `${name}-${fallbackId("f")}`;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      <input
        {...rest}
        id={fieldId}
        name={name}
        type={type}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        // Password managers stamp attributes onto fields before React
        // hydrates; without this every form logs a hydration mismatch.
        suppressHydrationWarning
        className={`${CONTROL} ${borderFor(error)} read-only:bg-surface-raised read-only:text-ink-soft`}
      />
    </FieldShell>
  );
}

export interface SelectFieldProps {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  id?: string;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

export function SelectField({
  name,
  label,
  options,
  id,
  placeholder,
  hint,
  error,
  required,
  ...rest
}: SelectFieldProps) {
  const fieldId = id ?? `${name}-${fallbackId("s")}`;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      <select
        {...rest}
        id={fieldId}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        suppressHydrationWarning
        className={`${CONTROL} ${borderFor(error)}`}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({
  name,
  label,
  id,
  rows = 4,
  hint,
  error,
  required,
  ...rest
}: {
  name: string;
  label: string;
  id?: string;
  rows?: number;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const fieldId = id ?? `${name}-${fallbackId("t")}`;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      <textarea
        {...rest}
        id={fieldId}
        name={name}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        suppressHydrationWarning
        className={`${CONTROL} ${borderFor(error)} resize-y`}
      />
    </FieldShell>
  );
}

export function CheckboxField({
  name,
  label,
  id,
  description,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  id?: string;
  description?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  const fieldId = id ?? `${name}-${fallbackId("c")}`;
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={fieldId}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        disabled={disabled}
        suppressHydrationWarning
        className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
      />
      <div className="flex flex-col">
        <label htmlFor={fieldId} className="text-sm text-ink">
          {label}
        </label>
        {description && <span className="text-xs text-ink-soft">{description}</span>}
      </div>
    </div>
  );
}

/** Groups related fields with a heading — billing address, company details. */
export function Fieldset({
  legend,
  description,
  children,
  columns = 1,
}: {
  legend: string;
  description?: string;
  children: React.ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <fieldset className="flex flex-col gap-3 border-0 p-0">
      <legend className="mb-1 p-0 text-sm font-semibold text-ink">{legend}</legend>
      {description && <p className="-mt-1 mb-1 text-sm text-ink-soft">{description}</p>}
      <div className={columns === 2 ? "grid gap-3 sm:grid-cols-2" : "flex flex-col gap-3"}>
        {children}
      </div>
    </fieldset>
  );
}

/** Summary of what failed, shown above a form after a failed submit. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-crit-soft px-3.5 py-2.5 text-sm text-crit">
      {message}
    </p>
  );
}

/**
 * The design-system submit button: this file's styling, over the pending
 * behaviour in `ui/submit-button`.
 *
 * It delegates rather than rendering its own `<button>` because a form action
 * gives no feedback while it runs, and a primary button that does nothing
 * visible for a second reads as broken — which is exactly what nineteen
 * buttons in this app did. This one has no callers yet; delegating is what
 * stops the first one inheriting that.
 *
 * This module stays a Server Component. `PendingSubmitButton` is the client
 * island, and rendering one from here costs nothing else.
 */
export function SubmitButton({
  children,
  variant = "primary",
  full,
  pendingLabel = "Working…",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  full?: boolean;
  /** What to say while the action is in flight. Say what is happening. */
  pendingLabel?: string;
}) {
  const styles =
    variant === "primary"
      ? "bg-accent text-surface hover:bg-accent-ink"
      : "border border-border bg-surface text-ink hover:bg-surface-raised";
  return (
    <PendingSubmitButton
      pendingLabel={pendingLabel}
      className={`justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-transform duration-150 ease-out active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none ${styles} ${full ? "w-full" : ""}`}
    >
      {children}
    </PendingSubmitButton>
  );
}
