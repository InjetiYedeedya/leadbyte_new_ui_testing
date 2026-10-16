"use client";

/**
 * Razorpay's checkout script and popup, loaded only when an INR payment is
 * actually being made. The script comes from Razorpay's own domain (allowed
 * in the CSP in `next.config.ts`); card and UPI details are typed into
 * Razorpay's window, never this app's.
 */

import type { RazorpayProof } from "@/lib/billing/payments";

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", handler: (response: { error?: { description?: string } }) => void): void;
}
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loading: Promise<RazorpayConstructor> | null = null;

export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay did not load.")));
      script.onerror = () => {
        loading = null;
        reject(new Error("Razorpay could not load. An ad blocker or the network may be stopping it."));
      };
      document.body.appendChild(script);
    });
  }
  return loading;
}

/**
 * Open the popup. Resolves with Razorpay's proof of payment, or rejects with
 * a sentence to show; `null` when the customer closed it without paying.
 */
export async function payWithRazorpay(options: Record<string, unknown>): Promise<RazorpayProof | null> {
  const Razorpay = await loadRazorpay();
  return new Promise((resolve, reject) => {
    const popup = new Razorpay({
      name: "LeadByte",
      theme: { color: "#1d3fd1" },
      ...options,
      modal: { confirm_close: true, ondismiss: () => resolve(null) },
      handler: (response: RazorpayProof) => resolve(response),
    });
    popup.on("payment.failed", (response) => reject(new Error(response.error?.description || "The payment failed.")));
    popup.open();
  });
}

/**
 * Removes anything Razorpay's popup left on the page. Its script builds a
 * full-screen container with a dark backdrop, and after a payment that
 * container could stay up while we confirmed the order: the customer saw a
 * black page with nothing happening (2026-10-15). It also puts back the
 * page's scrolling, which the popup turns off.
 */
export function clearRazorpayOverlay(): void {
  document.querySelectorAll(".razorpay-container, .razorpay-backdrop").forEach((el) => el.remove());
  document.body.style.removeProperty("overflow");
}
