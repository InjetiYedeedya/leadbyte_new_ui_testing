import { render, screen, within } from "@testing-library/react";
import { OpenAiKeyForm } from "@/components/agents/openai-key-form";
import type { OpenAiAccount } from "@/lib/data/openai-account";

const ACCOUNT: OpenAiAccount = {
  currency: "USD",
  country: "",
  name: "Ntimes AI LLC",
  reviewStatus: "approved",
  accountId: "adacct_6ab25a5a59c58196baaf7db199",
  status: "active",
  timezone: "America/New_York",
  conversionEventCount: 3,
  checks: [
    { key: "key_valid", ok: true, informational: false, value: "authorised" },
    { key: "account_active", ok: true, informational: false, value: "active" },
    { key: "brand_approved", ok: true, informational: false, value: "approved" },
    { key: "tracking", ok: false, informational: true, value: "not connected" },
  ],
};

async function noop() {}

describe("OpenAiKeyForm, connected", () => {
  it("names the account and lists its facts", () => {
    render(<OpenAiKeyForm action={noop} problems={[]} keySaved forgetAction={noop} account={ACCOUNT} conversionEventCount={3} />);
    expect(screen.getByRole("heading", { name: "Ntimes AI LLC" })).toBeInTheDocument();
    expect(screen.getByText("adacct_6ab25a5a59c58196baaf7db199")).toBeInTheDocument();
    expect(screen.getByText("America/New_York")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use a different key" })).toBeInTheDocument();
  });

  it("shows every check, with informational ones not read as failures", () => {
    render(<OpenAiKeyForm action={noop} problems={[]} keySaved forgetAction={noop} account={ACCOUNT} conversionEventCount={3} />);
    const checks = screen.getByRole("list", { name: "Account checks" });
    expect(within(checks).getByText("API key")).toBeInTheDocument();
    expect(within(checks).getByText("Conversion tracking")).toBeInTheDocument();
    expect(within(checks).getByText("for information, not required")).toBeInTheDocument();
    expect(within(checks).getByText("3 conversion events")).toBeInTheDocument();
    expect(within(checks).getByText("Leads and App installs available")).toBeInTheDocument();
  });

  it("says the two goals are hidden with no conversion events", () => {
    render(<OpenAiKeyForm action={noop} problems={[]} keySaved forgetAction={noop} account={ACCOUNT} conversionEventCount={0} />);
    expect(screen.getByText("0 conversion events")).toBeInTheDocument();
    expect(screen.getByText("Leads and App installs unavailable")).toBeInTheDocument();
  });

  it("shows no empty checks row when there is nothing to report", () => {
    render(
      <OpenAiKeyForm action={noop} problems={[]} keySaved forgetAction={noop} account={{ ...ACCOUNT, checks: [] }} conversionEventCount={0} />,
    );
    expect(screen.queryByRole("list", { name: "Account checks" })).not.toBeInTheDocument();
    expect(screen.getByText("America/New_York")).toBeInTheDocument();
  });
});
