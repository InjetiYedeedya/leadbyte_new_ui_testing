"use client";

/**
 * A file input that checks the file the moment it is picked.
 *
 * ## Why this earns `"use client"`
 *
 * Reading a file's first bytes and saying "that's a ZIP, not a spreadsheet"
 * before anything is sent needs an `onChange` handler and somewhere to put the
 * sentence. `accept=` alone only filters the picker, and "All files" walks
 * past it — which is how a `.zip` reached Lead Qualification (QA, 2026-10-13).
 *
 * A refused file is cleared from the input, so a form cannot be submitted
 * with it. This is the quick answer, not the guard: the Server Action runs the
 * same `uploadProblem` again before uploading.
 */

import { useId, useState } from "react";
import { UPLOAD_KINDS, uploadProblem, type UploadKind } from "@/lib/data/file-check";

export function CheckedFileInput({
  name,
  kind,
  required = false,
  disabled = false,
  className = "",
  describedBy,
}: {
  name: string;
  kind: UploadKind;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** The id of a hint the input should also be described by. */
  describedBy?: string;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const errorId = useId();

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      setProblem(null);
      return;
    }
    setChecking(true);
    const found = await uploadProblem(file, kind);
    setChecking(false);
    setProblem(found);
    // Cleared, so the refused file can never ride along with the form.
    if (found) input.value = "";
  }

  return (
    <>
      <input
        type="file"
        name={name}
        accept={UPLOAD_KINDS[kind].accept}
        required={required}
        disabled={disabled}
        onChange={onChange}
        aria-invalid={problem ? true : undefined}
        aria-describedby={[describedBy, problem ? errorId : null].filter(Boolean).join(" ") || undefined}
        suppressHydrationWarning
        className={className}
      />
      {checking && <span className="mt-1 block text-xs text-ink-soft">Checking the file…</span>}
      {problem && (
        <span id={errorId} role="alert" className="mt-1 block text-xs font-medium text-crit">
          {problem}
        </span>
      )}
    </>
  );
}
