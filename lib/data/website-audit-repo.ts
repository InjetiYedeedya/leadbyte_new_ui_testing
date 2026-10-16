import { isBackendConfigured } from "@/lib/api/config";
import { analysedAtOf, fetchLatestAnalysis, mapWebsiteAudit } from "./website-analysis";
import type { WebsiteAudit } from "./types";

export interface WebsiteAuditRepo {
  get(businessId: string): Promise<WebsiteAudit | null>;
}

const SEED: Record<string, WebsiteAudit> = {
  novaflow: {
    businessId: "novaflow",
    score: 72,
    pagesCrawled: 17,
    totalIssues: 18,
    criticalCount: 3,
    highCount: 5,
    mediumCount: 7,
    lowCount: 3,
    categoryScores: [
      { category: "Technical SEO", score: 64 },
      { category: "On-page SEO", score: 71 },
      { category: "Content", score: 78 },
      { category: "Performance", score: 52 },
      { category: "Accessibility", score: 69 },
      { category: "Structured data", score: 41 },
      { category: "Internal linking", score: 74 },
    ],
    findings: [
      {
        id: "f1",
        severity: "critical",
        title: "No structured data on any product page",
        category: "Structured data",
        affectedPages: 32,
      },
      {
        id: "f2",
        severity: "critical",
        title: "Largest Contentful Paint 4.6s on mobile",
        category: "Performance",
        affectedPages: 12,
      },
      {
        id: "f3",
        severity: "critical",
        title: "Demo-request form has no server-side validation feedback",
        category: "UX",
        affectedPages: 1,
      },
      {
        id: "f4",
        severity: "high",
        title: "Missing meta descriptions",
        category: "Metadata",
        affectedPages: 14,
      },
      {
        id: "f5",
        severity: "high",
        title: "Thin content on 3 service pages",
        category: "Content",
        affectedPages: 3,
      },
      {
        id: "f6",
        severity: "medium",
        title: "Images without alt text",
        category: "Accessibility",
        affectedPages: 46,
      },
    ],
  },
};

class MockWebsiteAuditRepo implements WebsiteAuditRepo {
  async get(businessId: string): Promise<WebsiteAudit | null> {
    return SEED[businessId] ?? null;
  }
}

class HttpWebsiteAuditRepo implements WebsiteAuditRepo {
  async get(businessId: string): Promise<WebsiteAudit | null> {
    const payload = await fetchLatestAnalysis(businessId);
    if (!payload) return null;
    return mapWebsiteAudit(businessId, payload.seo, analysedAtOf(payload));
  }
}

let instance: WebsiteAuditRepo | null = null;

export function getWebsiteAuditRepo(): WebsiteAuditRepo {
  if (!instance) {
    instance = isBackendConfigured() ? new HttpWebsiteAuditRepo() : new MockWebsiteAuditRepo();
  }
  return instance;
}
