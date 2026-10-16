import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PendingDownload, errorFromResponse, filenameFromDisposition } from "./pending-download";

const createObjectURL = vi.fn(() => "blob:file");
const revokeObjectURL = vi.fn();

beforeEach(() => {
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Records the name the temporary link would save under, without navigating. */
function captureSave() {
  const saved: string[] = [];
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    saved.push(this.download);
  });
  return { saved, click };
}

describe("filenameFromDisposition", () => {
  it("prefers the encoded name, then the plain one, then nothing", () => {
    expect(filenameFromDisposition(`attachment; filename="a.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`)).toBe("résumé.pdf");
    expect(filenameFromDisposition(`attachment; filename="report.pdf"`)).toBe("report.pdf");
    expect(filenameFromDisposition("attachment; filename=plugin.zip")).toBe("plugin.zip");
    expect(filenameFromDisposition("attachment")).toBeNull();
    expect(filenameFromDisposition(null)).toBeNull();
  });
});

describe("errorFromResponse", () => {
  it("reads JSON error or message, a short plain sentence, else our own", async () => {
    expect(await errorFromResponse(new Response(JSON.stringify({ error: "Upstream down" }), { status: 502 }))).toBe(
      "Upstream down",
    );
    expect(await errorFromResponse(new Response(JSON.stringify({ message: "No file" }), { status: 404 }))).toBe("No file");
    expect(await errorFromResponse(new Response("That audit isn't part of your run any more.", { status: 404 }))).toBe(
      "That audit isn't part of your run any more.",
    );
    expect(await errorFromResponse(new Response("<html>Bad gateway</html>", { status: 502 }))).toMatch(/couldn't prepare/);
    expect(await errorFromResponse(new Response("", { status: 500 }))).toMatch(/couldn't prepare/);
  });
});

describe("PendingDownload", () => {
  it("shows it is preparing, then hands the file to the browser under the server's name", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const { saved, click } = captureSave();

    render(
      <PendingDownload href="/api/aeo/j1/report" filename="report.pdf" pendingLabel="Preparing…">
        Download the full report
      </PendingDownload>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Download the full report" }));

    const button = screen.getByRole("button", { name: "Preparing…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector(".animate-spin")).not.toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/aeo/j1/report");

    await act(async () => {
      pending.resolve(
        new Response("pdf-bytes", { status: 200, headers: { "Content-Disposition": `attachment; filename="audit.pdf"` } }),
      );
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(saved).toEqual(["audit.pdf"]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Download the full report" })).not.toBeDisabled();
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:file"));
  });

  it("falls back to the given filename when the response names none", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("zip", { status: 200 })));
    const { saved } = captureSave();
    render(
      <PendingDownload href="/x" filename="plugin.zip">
        Download the plugin
      </PendingDownload>,
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(saved).toEqual(["plugin.zip"]));
  });

  it("says what went wrong instead of saving an error page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("The audit service did not answer.", { status: 502 })));
    const { click } = captureSave();
    render(
      <PendingDownload href="/x" filename="report.pdf">
        Download
      </PendingDownload>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toHaveTextContent("The audit service did not answer.");
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Download" })).not.toBeDisabled();
  });

  it("reports a network failure in a plain sentence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    render(
      <PendingDownload href="/x" filename="report.pdf">
        Download
      </PendingDownload>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't prepare that file/);
  });
});
