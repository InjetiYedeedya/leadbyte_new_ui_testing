import { buildUserDashboard, type UserDashboardSources } from "./user-dashboard";

const EMPTY: UserDashboardSources = {
  dailyMetrics: [],
  pageTraffic: [],
  competitors: [],
  keywords: [],
  blogPosting: [],
  offPageSeo: [],
  facebook: [],
  instagram: [],
  twitter: [],
  youtube: [],
  googleAds: [],
  metaAds: [],
  leadQualificationData: [],
  leadQualificationConfig: [],
};

describe("buildUserDashboard", () => {
  it("shows nothing as unknown, never as zero", () => {
    const groups = buildUserDashboard(EMPTY);
    expect(groups.every((g) => g.empty)).toBe(true);
    expect(groups.flatMap((g) => g.figures).every((f) => f.value === null)).toBe(true);
  });

  it("sums what is there and keeps a real zero", () => {
    const groups = buildUserDashboard({
      ...EMPTY,
      dailyMetrics: [
        { metric_dates: "20260701", active_users: 3, page_views: 4 },
        { metric_dates: "20260701", active_users: 2, page_views: 1 },
      ],
      pageTraffic: [{ views: 9 }],
      metaAds: [
        { clicks: 0, spend: 1.5 },
        { clicks: 0, spend: "2" },
      ],
      offPageSeo: [{ sent_mails: 4, backlink: 7 }],
      leadQualificationConfig: [{ companyName: "Acme", websiteUrl: "https://acme.test" }],
    });
    const figure = (group: string, label: string) =>
      groups.find((g) => g.id === group)!.figures.find((f) => f.label === label)!.value;
    expect(figure("website", "Active users")).toBe(5);
    expect(figure("website", "Page views")).toBe(9);
    expect(figure("ads", "Meta clicks")).toBe(0);
    expect(figure("ads", "Meta spend")).toBe(3.5);
    expect(figure("ads", "Google campaigns")).toBeNull();
    expect(figure("seo", "Backlinks")).toBe(7);
    expect(figure("seo", "Replies")).toBeNull();
    expect(groups.find((g) => g.id === "leads")!.facts).toEqual([
      { label: "Company", value: "Acme" },
      { label: "Website", value: "acme.test" },
    ]);
  });
});
