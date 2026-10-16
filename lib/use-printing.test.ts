import { renderHook, act } from "@testing-library/react";
import { PDF_CAPTURE_END, PDF_CAPTURE_START, usePrinting } from "@/lib/use-printing";

/**
 * The hook exists because a PDF must not depend on what happened to be open or
 * on which page of a table the reader had reached. These tests are that
 * contract: it goes true before the browser snapshots, and back to false after.
 */

describe("usePrinting", () => {
  it("is false while nobody is printing", () => {
    const { result } = renderHook(() => usePrinting());
    expect(result.current).toBe(false);
  });

  it("turns true on beforeprint and false again on afterprint", () => {
    const { result } = renderHook(() => usePrinting());

    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(result.current).toBe(false);
  });

  it("stops listening when the component goes away", () => {
    const { result, unmount } = renderHook(() => usePrinting());
    unmount();

    // No throw, and nothing to update — an unmounted listener firing is the
    // classic "setState on an unmounted component" warning.
    expect(() => window.dispatchEvent(new Event("beforeprint"))).not.toThrow();
    expect(result.current).toBe(false);
  });

  it("also turns true while the direct PDF download copies the page (LBS-1247)", () => {
    const { result } = renderHook(() => usePrinting());

    act(() => {
      window.dispatchEvent(new Event(PDF_CAPTURE_START));
    });
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event(PDF_CAPTURE_END));
    });
    expect(result.current).toBe(false);
  });
});
