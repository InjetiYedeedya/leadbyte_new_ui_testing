import { devGlobal } from "@/lib/dev-global";
import { fixturesAllowed } from "@/lib/data/fixtures";

export interface WriterTopic {
  id: string;
  title: string;
  source: string;
}

export interface WriterBrief {
  whyThisTopic: string;
  evidenceUsed: string[];
  competingAnswers: string;
  internalLinksPlanned: string[];
}

export interface WriterDraft {
  id: string;
  title: string;
  url: string;
  words: number;
  targetKeyword: string;
  readingLevel: string;
  metaDescription: string;
  body: string;
  brief: WriterBrief;
}

export interface WriterPublished {
  id: string;
  title: string;
  url: string;
  publishedDate: string;
  geoCitationStatus: string;
}

export interface WriterState {
  queue: WriterTopic[];
  awaitingReview: WriterDraft[];
  published: WriterPublished[];
  brandVoiceMatch: number;
}

// Mutable (approveDraft moves a draft into published), so it must live on
// globalThis — a plain module variable is not guaranteed to be the same
// object across routes in Next.js dev mode. See lib/dev-global.ts.
const SEED = devGlobal<Record<string, WriterState>>("writer_state", () => ({
  novaflow: {
    brandVoiceMatch: 94,
    queue: [
      { id: "t1", title: "GEO glossary: entity recognition", source: "GEO gap" },
      { id: "t2", title: "How to reduce broad-match waste in Google Ads", source: "GEO gap" },
      { id: "t3", title: "Marketing automation ROI calculator", source: "GEO gap" },
      { id: "t4", title: "NovaFlow vs Marketo", source: "GEO gap" },
      { id: "t5", title: "What is lead qualification scoring?", source: "GEO gap" },
      { id: "t6", title: "B2B SaaS pricing page best practices", source: "GEO gap" },
      { id: "t7", title: "Fixing thin content on service pages", source: "Audit finding" },
      { id: "t8", title: "Meta description templates for SaaS", source: "Audit finding" },
      { id: "t9", title: "Internal linking for orphaned pages", source: "Audit finding" },
    ],
    awaitingReview: [
      {
        id: "d1",
        title: "SEO automation for lean marketing teams: what to automate first",
        url: "/blog/seo-automation-lean-teams",
        words: 1610,
        targetKeyword: "seo automation software",
        readingLevel: "Grade 9 · practitioner",
        metaDescription:
          "Automate the SEO work that repeats — metadata, schema, internal links — and keep judgement where it matters. A practical order of operations for two-to-ten person teams.",
        body: "Automate what repeats, not what decides. Metadata, schema and internal links are mechanical: the same judgement applied 40 times. Positioning and pricing pages are not — teams that automate the second group first ship worse copy faster.",
        brief: {
          whyThisTopic:
            "GEO scan: 11 high-intent queries have no page coverage. This one has the highest intent-to-difficulty ratio of the eleven.",
          evidenceUsed: [
            "Audit findings 4 and 5 (thin content, missing metadata)",
            "GA4: /seo-automation converts at 4.6%",
            "GEO prompt log, 12 prompts across 5 engines",
          ],
          competingAnswers:
            "Two competitors own the comparison answer space; neither has a page for the automation-order question.",
          internalLinksPlanned: ["/seo-automation", "/pricing", "/glossary/marketing-automation"],
        },
      },
    ],
    published: [
      {
        id: "p1",
        title: "NovaFlow vs HubSpot",
        url: "/compare/novaflow-vs-hubspot",
        publishedDate: "25 Aug 2026",
        geoCitationStatus: "Answers 4 of 12 GEO seed prompts directly",
      },
      {
        id: "p2",
        title: "Marketing automation glossary",
        url: "/glossary/marketing-automation",
        publishedDate: "25 Aug 2026",
        geoCitationStatus: "First 8 of 24 entries · definitional citation play",
      },
    ],
  },
}));

export interface WriterRepo {
  get(businessId: string): Promise<WriterState | null>;
  approveDraft(businessId: string, draftId: string): Promise<void>;
}

class MockWriterRepo implements WriterRepo {
  async get(businessId: string): Promise<WriterState | null> {
    return fixturesAllowed() ? (SEED[businessId] ?? null) : null;
  }

  async approveDraft(businessId: string, draftId: string): Promise<void> {
    const state = SEED[businessId];
    if (!state) return;
    const idx = state.awaitingReview.findIndex((d) => d.id === draftId);
    if (idx === -1) return;
    const draft = state.awaitingReview[idx];
    if (!draft) return;
    state.awaitingReview.splice(idx, 1);
    state.published.unshift({
      id: draft.id,
      title: draft.title,
      url: draft.url,
      publishedDate: "25 Aug 2026",
      geoCitationStatus: "Just published — not yet crawled by answer engines",
    });
  }
}

let instance: WriterRepo | null = null;

export function getWriterRepo(): WriterRepo {
  if (!instance) instance = new MockWriterRepo();
  return instance;
}
