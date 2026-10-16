"use client";

import { useEffect } from "react";

/**
 * Prints server-read data to the browser console, for diagnosing what the
 * backend holds behind a screen. Renders nothing.
 *
 * Why it earns `"use client"`: a Server Component's `console.log` lands in the
 * server's terminal, not the browser — and on production that terminal is not
 * one anyone can open. The page decides WHO gets this (admins, with
 * `?debug=1`) and redacts before it hands the data over; this only prints.
 */
export function ConsoleDump({ label, data }: { label: string; data: unknown }) {
  useEffect(() => {
    console.groupCollapsed(`[LeadByte debug] ${label}`);
    console.log(data);
    console.log(JSON.stringify(data, null, 2));
    console.groupEnd();
  }, [label, data]);
  return null;
}
