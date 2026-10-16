import { unstable_rethrow } from "next/navigation";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignIn = vi.fn();
const completeSignIn = vi.fn();
const signInWithEmailAndPassword = vi.fn();
const createUserWithEmailAndPassword = vi.fn();
const signInWithPopup = vi.fn();
let configured = false;

vi.mock("@/app/login/actions", () => ({
  mockSignIn: (...args: unknown[]) => mockSignIn(...args),
  completeSignIn: (...args: unknown[]) => completeSignIn(...args),
}));

vi.mock("@/lib/firebase/client", () => ({
  isFirebaseConfigured: () => configured,
  getFirebaseAuth: () => (configured ? ({} as never) : null),
}));

vi.mock("firebase/auth", () => ({
  // Must mirror the real provider's builder methods — the component calls
  // setCustomParameters/addScope on it before handing it to signInWithPopup.
  GoogleAuthProvider: class {
    setCustomParameters() {
      return this;
    }
    addScope() {
      return this;
    }
  },
  signInWithEmailAndPassword: (...a: unknown[]) => signInWithEmailAndPassword(...a),
  createUserWithEmailAndPassword: (...a: unknown[]) => createUserWithEmailAndPassword(...a),
  signInWithPopup: (...a: unknown[]) => signInWithPopup(...a),
}));

const { AuthForm } = await import("./auth-form");

const credential = { user: { getIdToken: async () => "id-token-123" } };

beforeEach(() => {
  vi.clearAllMocks();
  configured = false;
});

describe("AuthForm", () => {
  it("renders sign-in copy in signin mode", () => {
    render(<AuthForm mode="signin" />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  it("renders sign-up copy in signup mode", () => {
    render(<AuthForm mode="signup" />);
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("shows the mock-mode notice only when Firebase is unconfigured", () => {
    const { unmount } = render(<AuthForm mode="signin" />);
    expect(screen.getByText(/Mock mode/)).toBeInTheDocument();
    unmount();

    configured = true;
    render(<AuthForm mode="signin" />);
    expect(screen.queryByText(/Mock mode/)).not.toBeInTheDocument();
  });

  it("falls back to mock sign-in when Firebase is unconfigured", async () => {
    render(<AuthForm mode="signin" />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "hunter22");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(mockSignIn).toHaveBeenCalled();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it("signs up with createUser, not signIn, in signup mode", async () => {
    configured = true;
    createUserWithEmailAndPassword.mockResolvedValue(credential);
    completeSignIn.mockResolvedValue(undefined);

    render(<AuthForm mode="signup" />);
    await userEvent.type(screen.getByLabelText("Email"), "new@user.com");
    await userEvent.type(screen.getByLabelText("Password"), "hunter22");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(createUserWithEmailAndPassword).toHaveBeenCalled();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    expect(completeSignIn).toHaveBeenCalledWith("id-token-123", "email");
  });

  it("displays the message when the server action reports a failure", async () => {
    configured = true;
    signInWithEmailAndPassword.mockResolvedValue(credential);
    completeSignIn.mockResolvedValue({ ok: false, message: "Invalid Firebase token" });

    render(<AuthForm mode="signin" />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "hunter22");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid Firebase token");
  });

  it("says the page is out of date, rather than 'something went wrong', after a deploy (2026-10-01)", async () => {
    configured = true;
    signInWithEmailAndPassword.mockResolvedValue(credential);
    completeSignIn.mockRejectedValue(
      new Error('Failed to find Server Action "7f3a". This request might be from an older or newer deployment.'),
    );
    const timer = vi.spyOn(window, "setTimeout");

    render(<AuthForm mode="signin" />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "hunter22");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("LeadByte has just been updated");
    // A reload is scheduled; the click handler does not wait for it.
    expect(timer.mock.calls.some(([, ms]) => ms === 1500)).toBe(true);
    timer.mockRestore();
  });

  it("maps a Firebase error to friendly copy and never shows the raw code", async () => {
    configured = true;
    signInWithEmailAndPassword.mockRejectedValue({ code: "auth/wrong-password" });

    render(<AuthForm mode="signin" />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Email or password is incorrect.");
    expect(alert.textContent).not.toContain("auth/");
  });

  it("stays silent when the user dismisses the Google popup", async () => {
    configured = true;
    signInWithPopup.mockRejectedValue({ code: "auth/popup-closed-by-user" });

    render(<AuthForm mode="signin" />);
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sends the google provider on a successful popup sign-in", async () => {
    configured = true;
    signInWithPopup.mockResolvedValue(credential);
    completeSignIn.mockResolvedValue(undefined);

    render(<AuthForm mode="signin" />);
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(completeSignIn).toHaveBeenCalledWith("id-token-123", "google");
  });
});

describe("an abandoned Google popup (2026-10-12)", () => {
  const google = () => screen.getByRole("button", { name: /Continue with Google|Opening Google/ });

  it("gives the button back when the popup is dismissed", async () => {
    configured = true;
    signInWithPopup.mockRejectedValue({ code: "auth/popup-closed-by-user" });

    render(<AuthForm mode="signin" />);
    await userEvent.click(google());

    await waitFor(() => expect(google()).toHaveTextContent("Continue with Google"));
    expect(google()).toBeEnabled();
  });

  it("gives the button back on returning to the page while the popup is still open behind it", async () => {
    // Clicking back on the page drops the popup behind the window rather
    // than closing it: Firebase never settles, and the button span for good.
    configured = true;
    signInWithPopup.mockReturnValue(new Promise(() => {}));

    render(<AuthForm mode="signin" />);
    await userEvent.click(google());
    expect(google()).toHaveTextContent("Opening Google…");
    expect(google()).toBeDisabled();

    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(google()).toHaveTextContent("Continue with Google"), { timeout: 3000 });
    expect(google()).toBeEnabled();
  });

  it("lets the person try again, and the old attempt's cancellation does not undo the new one", async () => {
    configured = true;
    let rejectFirst: (reason: unknown) => void = () => {};
    signInWithPopup.mockReturnValueOnce(new Promise((_, reject) => (rejectFirst = reject)));
    signInWithPopup.mockReturnValueOnce(new Promise(() => {}));

    render(<AuthForm mode="signin" />);
    await userEvent.click(google());
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(google()).toBeEnabled(), { timeout: 3000 });

    await userEvent.click(google());
    expect(signInWithPopup).toHaveBeenCalledTimes(2);
    // Firebase cancels the first popup when the second opens.
    rejectFirst({ code: "auth/cancelled-popup-request" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(google()).toHaveTextContent("Opening Google…");
    expect(google()).toBeDisabled();
  });

  it("still signs in when the person goes back to the abandoned popup and finishes", async () => {
    configured = true;
    let resolvePopup: (value: unknown) => void = () => {};
    signInWithPopup.mockReturnValue(new Promise((resolve) => (resolvePopup = resolve)));
    completeSignIn.mockResolvedValue(undefined);

    render(<AuthForm mode="signin" />);
    await userEvent.click(google());
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(google()).toBeEnabled(), { timeout: 3000 });

    resolvePopup(credential);
    await waitFor(() => expect(completeSignIn).toHaveBeenCalledWith("id-token-123", "google"));
  });

  it("shows a real failure and gives the button back", async () => {
    configured = true;
    signInWithPopup.mockRejectedValue({ code: "auth/popup-blocked" });

    render(<AuthForm mode="signin" />);
    await userEvent.click(google());

    expect(await screen.findByRole("alert")).toHaveTextContent("Your browser blocked the sign-in popup");
    expect(google()).toHaveTextContent("Continue with Google");
    expect(google()).toBeEnabled();
  });
});

describe("a successful sign-in", () => {
  it("does not report a redirect as a failure", async () => {
    // `completeSignIn` ends in `redirect()`, which throws NEXT_REDIRECT. That
    // landed in the catch and was rendered as "Something went wrong signing
    // you in" over a login that had just worked.
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/analysing;307;",
    });

    expect(() => unstable_rethrow(redirectError)).toThrow();
  });

  it("still lets a real failure through to be shown", () => {
    expect(() => unstable_rethrow(new Error("network down"))).not.toThrow();
  });
});
