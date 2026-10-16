import { parseByteRange } from "./byte-range";

describe("parseByteRange", () => {
  const SIZE = 1000;

  it("reads the ranges a video element sends", () => {
    expect(parseByteRange("bytes=0-1", SIZE)).toEqual({ start: 0, end: 1 });
    expect(parseByteRange("bytes=500-", SIZE)).toEqual({ start: 500, end: 999 });
    expect(parseByteRange("bytes=-100", SIZE)).toEqual({ start: 900, end: 999 });
  });

  it("clamps an end past the file to its last byte", () => {
    expect(parseByteRange("bytes=900-5000", SIZE)).toEqual({ start: 900, end: 999 });
  });

  it("means the whole file when there is no usable range", () => {
    expect(parseByteRange(null, SIZE)).toBeNull();
    expect(parseByteRange("items=0-1", SIZE)).toBeNull();
    expect(parseByteRange("bytes=0-1,5-9", SIZE)).toBeNull();
  });

  it("refuses a range that starts past the end", () => {
    expect(parseByteRange("bytes=1000-", SIZE)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=50-10", SIZE)).toBe("unsatisfiable");
  });
});
