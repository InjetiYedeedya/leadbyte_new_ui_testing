import { devGlobal } from "@/lib/dev-global";

export type BusinessAnalysisStatus = "active" | "analysing" | "not-started";

export interface BusinessSummary {
  businessId: string;
  name: string;
  websiteUrl: string;
  status: BusinessAnalysisStatus;
  statusDetail: string;
}

export interface BusinessRepo {
  list(ownerId: string): Promise<BusinessSummary[]>;
  add(ownerId: string, websiteUrl: string): Promise<BusinessSummary>;
}

// Every business in the account, keyed by the owning user. Only "novaflow"
// has real seeded data anywhere else in the mock layer — the other two
// exist to prove multi-business switching and add-a-business genuinely
// work, and correctly show empty states everywhere else in the app
// (every repo/page here is already null-safe for an unseeded businessId).
const SEED = devGlobal<Record<string, BusinessSummary[]>>("business_seed", () => ({
  "rhea@novaflow.io": [
    {
      businessId: "novaflow",
      name: "NovaFlow",
      websiteUrl: "novaflow.io",
      status: "active",
      statusDetail: "Intelligence 82% · 9 agents available",
    },
    {
      businessId: "kraft-interiors",
      name: "Kraft Interiors",
      websiteUrl: "kraftinteriors.in",
      status: "analysing",
      statusDetail: "Crawl in progress · 14 of 62 pages",
    },
    {
      businessId: "zephyr-labs",
      name: "Zephyr Labs",
      websiteUrl: "zephyrlabs.dev",
      status: "not-started",
      statusDetail: "Added 3 days ago · no analysis run",
    },
  ],
}));

const nextIdCounter = devGlobal<{ value: number }>("business_next_id", () => ({ value: 1 }));

class MockBusinessRepo implements BusinessRepo {
  async list(ownerId: string): Promise<BusinessSummary[]> {
    return SEED[ownerId] ?? [];
  }

  async add(ownerId: string, websiteUrl: string): Promise<BusinessSummary> {
    const businesses = SEED[ownerId] ?? (SEED[ownerId] = []);
    const businessId = `biz-${nextIdCounter.value++}`;
    const name = websiteUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .split(".")[0];
    const summary: BusinessSummary = {
      businessId,
      name: name ? name[0]!.toUpperCase() + name.slice(1) : websiteUrl,
      websiteUrl,
      status: "analysing",
      statusDetail: "Crawl in progress · 0 of ? pages",
    };
    businesses.push(summary);
    return summary;
  }
}

let instance: BusinessRepo | null = null;

export function getBusinessRepo(): BusinessRepo {
  if (!instance) instance = new MockBusinessRepo();
  return instance;
}
