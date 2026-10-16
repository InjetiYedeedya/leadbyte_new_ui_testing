"use client";

import { useEffect } from "react";

/**
 * Opens a date field's calendar when the FIELD is clicked, not only its icon.
 *
 * ## Why this earns `"use client"`, and why it is one listener
 *
 * A native date input opens its picker from the small calendar icon alone;
 * a click on "dd-mm-yyyy" just selects a segment, and people read that as the
 * field not working. `showPicker()` opens it from anywhere — but it is a call
 * a browser makes, so it needs a handler. Date fields are on a dozen screens,
 * most of them Server Components (setup forms, the admin filters), and giving
 * each one an island would be a dozen islands for one behaviour. So this is
 * one listener on the document, mounted once in the root layout, rendering
 * nothing.
 *
 * Typing a date still works: the field keeps its focus and segments.
 */

const PICKER_TYPES = new Set(["date", "datetime-local", "month", "week", "time"]);

export function DatePickerOnClick() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!PICKER_TYPES.has(target.type) || target.disabled || target.readOnly) return;
      if (typeof target.showPicker !== "function") return;
      try {
        target.showPicker();
      } catch {
        // Refused (an embedded frame, or no user activation): the icon still
        // works, which is what the field did before.
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
