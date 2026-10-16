/**
 * Reads an HTTP `Range: bytes=…` header against a file of `size` bytes.
 *
 * Returns the inclusive byte span to send, `null` when there is no usable
 * range (send the whole file), or `"unsatisfiable"` when the range lies past
 * the end (answer 416). Only a single range is supported — which is all a
 * video element asks for.
 */
export type ByteRange = { start: number; end: number };

export function parseByteRange(header: string | null, size: number): ByteRange | null | "unsatisfiable" {
  if (!header || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart = "", rawEnd = ""] = match;
  if (rawStart === "" && rawEnd === "") return null;

  // `bytes=-500`: the last 500 bytes.
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (suffix <= 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(rawStart);
  if (start >= size) return "unsatisfiable";
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (end < start) return "unsatisfiable";
  return { start, end };
}
