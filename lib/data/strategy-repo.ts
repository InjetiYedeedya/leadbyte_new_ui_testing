import { devGlobal } from "@/lib/dev-global";
import type { Strategy, StrategyAnswers } from "./types";

export interface StrategyRepo {
  get(businessId: string): Promise<Strategy>;
  setAnswers(businessId: string, answers: StrategyAnswers): Promise<void>;
  generate(businessId: string): Promise<Strategy>;
}

const state = devGlobal<Record<string, Strategy>>("strategy_state", () => ({}));

function defaultStrategy(businessId: string): Strategy {
  return {
    businessId,
    answers: { primaryGoal: null, monthlyBudget: null, growthTarget: null },
    generated: false,
  };
}

const GENERATED_CONTENT: Pick<
  Strategy,
  "headline" | "executiveSummary" | "recommendations"
> = {
  headline: "Win the category answer, stop renting the traffic",
  executiveSummary:
    "NovaFlow already wins on organic intent and loses on paid breadth. The fastest path to 900 qualified leads a month is to defend and extend the organic asset, become the cited answer in AI search, and shrink paid to only the exact-intent and retargeting motions that already clear target CPA.",
  recommendations: [
    {
      title: "Increase organic content investment",
      why: "Organic contributes 46% of qualified traffic at a 3.8% conversion rate — more than 3x paid.",
      evidence:
        "GA4 14-month trend, plus 11 high-intent queries with no page coverage in the GEO scan.",
      expectedImpact: "+180-240 qualified leads / mo by day 90 at no additional media cost.",
    },
    {
      title: "Pause broad match, rebuild Performance Max",
      why: "Two campaigns consume 46% of spend and return 22% of conversions.",
      evidence:
        "Broad match CPA ₹7,415 and PMax ₹5,789 against a ₹2,600 target; brand cannibalisation confirmed in search terms.",
      expectedImpact: "Blended CPA ₹3,240 → ~₹2,410 within two billing cycles.",
    },
    {
      title: "Launch LinkedIn Ads against the closing ICP",
      why: "68% of closed-won accounts share three job titles you cannot target precisely anywhere else.",
      evidence:
        "CRM export cross-referenced with GA4 assisted conversions; no LinkedIn spend to date.",
      expectedImpact: "Estimated ₹3,100 CPA in month one, improving as retargeting pools fill.",
    },
  ],
};

class MockStrategyRepo implements StrategyRepo {
  async get(businessId: string): Promise<Strategy> {
    return state[businessId] ?? defaultStrategy(businessId);
  }

  async setAnswers(businessId: string, answers: StrategyAnswers): Promise<void> {
    const current = state[businessId] ?? defaultStrategy(businessId);
    state[businessId] = { ...current, answers };
  }

  async generate(businessId: string): Promise<Strategy> {
    const current = state[businessId] ?? defaultStrategy(businessId);
    const next: Strategy = { ...current, generated: true, ...GENERATED_CONTENT };
    state[businessId] = next;
    return next;
  }
}

let instance: StrategyRepo | null = null;

export function getStrategyRepo(): StrategyRepo {
  if (!instance) instance = new MockStrategyRepo();
  return instance;
}
