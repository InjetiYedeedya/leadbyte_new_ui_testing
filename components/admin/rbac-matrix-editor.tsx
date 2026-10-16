"use client";

/**
 * The permission matrix on the Roles screen: modules down the side, roles
 * across the top, one choice per cell.
 *
 * ## Why this earns `"use client"`
 *
 * "Save" is enabled only when the draft differs from what is saved, and says
 * how many cells changed — a comparison against every cell on each change,
 * which a form post cannot make. The save itself is a plain Server Action
 * (`saveRbacPermissions`), posting one `perm:<role>:<module>` field per cell;
 * the server re-normalises whatever arrives.
 *
 * Only super admins get the dropdowns. Anyone else allowed to see the
 * screen gets the same table read-only, so a role can see what it may do.
 */

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  ALL_MODULES,
  MATRIX_ROLES,
  MODULE_LABELS,
  READ_ONLY_MODULES,
  ROLE_LABELS,
  cellValue,
  type AdminModule,
  type RbacMatrix,
} from "@/lib/admin/rbac";

type Cell = "none" | "read" | "write";

const CHOICE_LABELS: Record<Cell, string> = {
  none: "No access",
  read: "Read",
  write: "Read + write",
};

const TH = "border-b border-border px-3 py-2 text-left text-xs font-medium text-ink-soft";
const TD = "border-b border-border/60 px-3 py-2 text-sm text-ink";

function cellsOf(matrix: RbacMatrix): Record<string, Cell> {
  const cells: Record<string, Cell> = {};
  for (const role of MATRIX_ROLES) {
    for (const mod of ALL_MODULES) cells[`${role}:${mod}`] = cellValue(matrix[role][mod]);
  }
  return cells;
}

export function RbacMatrixEditor({
  matrix,
  editable,
  action,
}: {
  matrix: RbacMatrix;
  editable: boolean;
  action: (form: FormData) => Promise<void>;
}) {
  const saved = useMemo(() => cellsOf(matrix), [matrix]);
  const [draft, setDraft] = useState(saved);
  const changed = Object.keys(saved).filter((key) => saved[key] !== draft[key]).length;

  const choices = (mod: AdminModule): Cell[] =>
    READ_ONLY_MODULES.has(mod) ? ["none", "read"] : ["none", "read", "write"];

  return (
    <form action={action}>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[40rem] border-collapse">
          <caption className="sr-only">Permissions by role</caption>
          <thead>
            <tr>
              <th scope="col" className={TH}>
                Section
              </th>
              <th scope="col" className={TH}>
                {ROLE_LABELS.super_admin}
              </th>
              {MATRIX_ROLES.map((role) => (
                <th key={role} scope="col" className={TH}>
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_MODULES.map((mod) => (
              <tr key={mod} className="last:[&>*]:border-b-0">
                <th scope="row" className={`${TD} text-left font-medium`}>
                  {MODULE_LABELS[mod]}
                </th>
                {/* Fixed: `normalizeMatrix` gives super admins everything,
                    so offering a choice here would offer one that is ignored. */}
                <td className={`${TD} text-ink-soft`}>Full access</td>
                {MATRIX_ROLES.map((role) => {
                  const key = `${role}:${mod}`;
                  const value = draft[key] ?? "none";
                  return (
                    <td key={role} className={TD}>
                      {editable ? (
                        <>
                          <label htmlFor={`perm-${key}`} className="sr-only">
                            {ROLE_LABELS[role]} · {MODULE_LABELS[mod]}
                          </label>
                          <select
                            id={`perm-${key}`}
                            name={`perm:${key}`}
                            value={value}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, [key]: event.target.value as Cell }))
                            }
                            suppressHydrationWarning
                            className={`w-full rounded-md border bg-surface px-2 py-1 text-sm text-ink outline-none transition-colors focus:border-accent ${
                              value === saved[key] ? "border-border" : "border-accent"
                            }`}
                          >
                            {choices(mod).map((choice) => (
                              <option key={choice} value={choice}>
                                {CHOICE_LABELS[choice]}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <span className={value === "none" ? "text-ink-soft" : ""}>{CHOICE_LABELS[value]}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <SubmitButton
            pendingLabel="Saving…"
            disabled={changed === 0}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition hover:bg-accent-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save permissions
          </SubmitButton>
          {changed > 0 ? (
            <>
              <span className="text-sm text-ink-soft">
                {changed === 1 ? "1 change not saved" : `${changed} changes not saved`}
              </span>
              <button
                type="button"
                onClick={() => setDraft(saved)}
                className="text-sm text-ink-soft underline underline-offset-2 hover:text-ink"
              >
                Undo changes
              </button>
            </>
          ) : (
            <span className="text-sm text-ink-soft">No changes</span>
          )}
        </div>
      )}
    </form>
  );
}
