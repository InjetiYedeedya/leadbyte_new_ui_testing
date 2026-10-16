/**
 * What a file IS, checked before it is uploaded — per field, by name AND by
 * its first bytes. Pure and runs anywhere: the upload fields call it the
 * moment a file is picked, and the Server Actions call it again before the
 * upload, because a check that only runs in the browser can be skipped.
 *
 * ## Why (QA report, 2026-10-13)
 *
 * Lead Qualification accepted a `.zip` in both of its upload fields, and test
 * files built to carry malware or hidden prompts. `accept=` on the input only
 * filters the file picker — "All files" walks straight past it — and the
 * upload allow-list was one list for the whole app, worked out from the name.
 * A ZIP renamed `leads.csv` was signed as a CSV.
 *
 * ## The checks, in order
 *
 * 1. A file name with a path or a control character is refused.
 * 2. Archives, programs and scripts are refused BY NAME, with a message that
 *    says so — ZIP first among them, as the report asked.
 * 3. Only the field's own types are allowed: leads are `.csv/.xlsx/.xls`, a
 *    product document is `.pdf` (`UPLOAD_KINDS`).
 * 4. The bytes must be what the name claims. A program (`MZ`, ELF, Mach-O, a
 *    `#!` script) or a web page/script is refused whatever it is called. A
 *    PDF must start `%PDF`; an `.xls` must carry the Office header.
 * 5. An `.xlsx` IS a ZIP inside — the trap here — so "starts with PK" proves
 *    nothing. It must also contain Excel's own parts (`[Content_Types].xml`
 *    and `xl/`), whose names a ZIP stores as plain text. A plain archive
 *    renamed `.xlsx` has neither.
 * 6. A `.csv` must be text: no archive, Office or PDF header, and no NUL
 *    bytes, which no text file contains and every binary one does.
 *
 * 7. Harmful content inside an allowed file (LBS-1248), in the same windows:
 *    instructions written at the AI agent ("ignore all previous
 *    instructions", "system prompt", chat-template tokens); invisible
 *    characters that hide text (zero-width, bidi overrides, Unicode tags);
 *    spreadsheet formulas that run commands or fetch the web (`=cmd|`,
 *    `=HYPERLINK(`, `=WEBSERVICE(`…); macros (`vbaProject.bin`, `_VBA_PROJECT`);
 *    and PDFs that run code (`/JavaScript`, `/Launch`, embedded files).
 *
 * ## What this cannot do
 *
 * Read text a PDF stores compressed, or anything past the first and last
 * 256KB, and no phrase list catches every way of wording an injection. So the
 * agent must still treat file content as data, never as instructions — that
 * part belongs to the backend. This stops the wrong KIND of file completely,
 * and the obvious attacks inside the right kind.
 */

export type UploadKind = "lead-database" | "pdf-document";

export const UPLOAD_KINDS: Readonly<Record<UploadKind, { extensions: readonly string[]; accept: string; label: string; maxBytes: number }>> = {
  "lead-database": {
    extensions: ["csv", "xlsx", "xls"],
    accept: ".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: ".csv, .xlsx or .xls",
    maxBytes: 25 * 1024 * 1024,
  },
  "pdf-document": {
    extensions: ["pdf"],
    accept: ".pdf,application/pdf",
    label: ".pdf",
    maxBytes: 25 * 1024 * 1024,
  },
};

const ARCHIVES = new Set(["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zipx", "cab", "iso", "dmg", "jar", "apk"]);
const PROGRAMS = new Set([
  "exe", "com", "bat", "cmd", "msi", "scr", "pif", "cpl", "app", "deb", "rpm", "sh", "bash", "zsh", "ps1", "psm1",
  "vbs", "vbe", "wsf", "wsh", "hta", "js", "mjs", "cjs", "jse", "php", "phtml", "asp", "aspx", "jsp", "py", "rb",
  "pl", "cgi", "dll", "sys", "so", "bin", "lnk", "reg", "inf", "html", "htm", "xhtml", "shtml", "svg", "xsl",
  "xlsm", "xltm", "docm", "dotm", "pptm",
]);

export function extensionOf(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase() ?? "";
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte);

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** True when the ASCII text appears anywhere in the bytes. */
function containsText(bytes: Uint8Array, text: string): boolean {
  const first = text.charCodeAt(0);
  outer: for (let i = bytes.indexOf(first); i !== -1 && i <= bytes.length - text.length; i = bytes.indexOf(first, i + 1)) {
    for (let j = 1; j < text.length; j++) if (bytes[i + j] !== text.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

/** A program or active web content, whatever the file is called. */
function looksLikeProgram(bytes: Uint8Array): boolean {
  if (startsWith(bytes, [0x4d, 0x5a])) return true; // Windows "MZ"
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return true; // ELF
  if (startsWith(bytes, [0xfe, 0xed, 0xfa]) || startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe])) return true; // Mach-O
  if (startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe])) return true; // universal binary / Java class
  if (startsWith(bytes, [0x23, 0x21])) return true; // "#!" script
  const from = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  const head = String.fromCharCode(...bytes.subarray(from, from + 64)).replace(/^\s+/, "").toLowerCase();
  return ["<?php", "<script", "<!doctype html", "<html", "<svg"].some((tag) => head.startsWith(tag));
}

/**
 * Whether the bytes are what a file with this extension should be. `head` is
 * the start of the file, `tail` its end — where a ZIP keeps its directory of
 * part names, so an `.xlsx` is recognised without reading all of it.
 */
function contentMatches(extension: string, bytes: Uint8Array, tail: Uint8Array): boolean {
  switch (extension) {
    case "pdf":
      // `%PDF-` within the first 1KB, as the format allows.
      return containsText(bytes.subarray(0, 1024), "%PDF-");
    case "xls":
      return startsWith(bytes, OLE);
    case "xlsx":
      return (
        startsWith(bytes, ZIP) &&
        (containsText(bytes, "[Content_Types].xml") || containsText(tail, "[Content_Types].xml")) &&
        (containsText(bytes, "xl/") || containsText(tail, "xl/"))
      );
    case "csv": {
      if (startsWith(bytes, ZIP) || startsWith(bytes, OLE) || containsText(bytes.subarray(0, 8), "%PDF")) return false;
      return !bytes.includes(0);
    }
    default:
      return false;
  }
}

/** Phrases written at a language model, not at a human reading leads. */
const INJECTION =
  /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+|your\s+)*(previous|prior|above|earlier|preceding)\s+(instructions|prompts?|rules|messages)\b|\bsystem\s+prompt\b|\byou\s+are\s+now\s+(a|an|the|in)\b|\bnew\s+instructions\s*:|\bdeveloper\s+mode\b|<\|(im_start|im_end|system|endoftext)\|>|\[\/?INST\]|^\s*###\s*(instruction|system)\b/im;

/** Characters that hide or reorder text. A BOM at the very start is stripped first. */
const HIDDEN = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]|[\u{e0000}-\u{e007f}]/u;

/** A cell that runs a command or reaches the web when the sheet is opened. */
const FORMULA =
  /(^|[,;\t\n"])\s*[=+\-@]\s*(cmd|powershell|mshta|msexcel|DDE|DDEAUTO|HYPERLINK|IMPORTXML|IMPORTDATA|IMPORTHTML|IMPORTFEED|IMPORTRANGE|WEBSERVICE|FILTERXML|CALL|REGISTER|EXEC)\b\s*[(|!]/i;

const PDF_ACTIVE = /\/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|SubmitForm|ImportData)\b/;

const MACROS = "For security, this file was blocked: it contains macros. Save it as a plain .xlsx or .csv.";
const AIMED_AT_AI =
  "For security, this file was blocked: it contains instructions aimed at the AI agent. Remove them and try again.";

function textOf(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^﻿/, "");
}

/** Harmful content inside a file of the right kind, as a sentence — or null. */
function contentThreat(extension: string, head: Uint8Array, tail: Uint8Array): string | null {
  const anywhere = (text: string) => containsText(head, text) || containsText(tail, text);
  if (extension === "xlsx" && anywhere("vbaProject.bin")) return MACROS;
  if (extension === "xls" && anywhere("_VBA_PROJECT")) return MACROS;
  if (extension === "pdf") {
    // Latin-1 view of the raw bytes: PDF keywords are ASCII.
    const raw = new TextDecoder("latin1").decode(head) + (tail === head ? "" : new TextDecoder("latin1").decode(tail));
    if (PDF_ACTIVE.test(raw)) {
      return "For security, this PDF was blocked: it runs code or carries other files. Export it again as a plain PDF.";
    }
    return INJECTION.test(raw) ? AIMED_AT_AI : null;
  }
  if (extension === "csv") {
    const text = textOf(head) + (tail === head ? "" : textOf(tail));
    if (HIDDEN.test(text)) {
      return "For security, this file was blocked: it contains hidden characters that can conceal text. Save it again as plain text.";
    }
    if (INJECTION.test(text)) return AIMED_AT_AI;
    if (FORMULA.test(text)) {
      return "For security, this file was blocked: a cell holds a formula that runs a command or reaches the web. Remove it and try again.";
    }
  }
  return null;
}

/**
 * Why this file may not be used in this field, as a sentence to show — or
 * null when it may. Reads only the first and last 256KB, never the whole
 * file: the server runs on a 10ms-per-request budget (CLAUDE.md), and a 25MB
 * scan there would be the one thing a leads upload cannot afford.
 */
export async function uploadProblem(file: File, kind: UploadKind): Promise<string | null> {
  const rule = UPLOAD_KINDS[kind];
  const name = file.name ?? "";
  // eslint-disable-next-line no-control-regex
  if (/[\\/\u0000-\u001f]/.test(name)) return "That file name can't be used. Rename the file and try again.";

  const extension = extensionOf(name);
  if (ARCHIVES.has(extension)) {
    return `.${extension} files can't be uploaded. Unzip it and choose the ${rule.label} file itself.`;
  }
  if (PROGRAMS.has(extension)) return `For security, .${extension} files can't be uploaded. Use a ${rule.label} file.`;
  if (!rule.extensions.includes(extension)) {
    return extension === "" ? `Use a ${rule.label} file.` : `.${extension} files aren't supported here. Use a ${rule.label} file.`;
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > rule.maxBytes) return `That file is too large. The limit is ${Math.round(rule.maxBytes / 1024 / 1024)}MB.`;

  const window = 256 * 1024;
  let bytes: Uint8Array;
  let tail: Uint8Array;
  try {
    bytes = new Uint8Array(await file.slice(0, window).arrayBuffer());
    tail = file.size > window ? new Uint8Array(await file.slice(file.size - window).arrayBuffer()) : bytes;
  } catch {
    return "We couldn't read that file. Try choosing it again.";
  }
  if (looksLikeProgram(bytes)) return "For security, this file was blocked: it contains a program or script.";
  if (!contentMatches(extension, bytes, tail)) {
    return `This file isn't a real .${extension} file — it may be renamed. Use a ${rule.label} file.`;
  }
  return contentThreat(extension, bytes, tail);
}
