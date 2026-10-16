import type { AdsFieldProblem } from "./ads-errors";
import type { GenerateResult } from "./ads-types";
import type { AdsCopy } from "./ads-campaign-request";

/**
 * The advert's words, and the limits they have to fit.
 *
 * Both maxima are the service's own, read from its `validation.py` rather than
 * guessed: it trims anything longer and reports the trim as a note, so a
 * headline written past 50 characters is not rejected — it is quietly cut, and
 * the customer never sees the version that ran. Enforcing the same numbers here
 * means what they approve is what goes out.
 */

export const TITLE_MAX = 50;
export const DESCRIPTION_MAX = 100;

/**
 * The service's own advisory floor for a description.
 *
 * Below this it warns; it does not refuse. So this is a hint beside the box,
 * never a block — a short description is a weaker advert, not an invalid one.
 */
export const DESCRIPTION_TARGET_MIN = 80;

/** How many topics are worth showing before a list stops being a list. */
export const TOPICS_MAX = 12;

export function parseGenerated(result: GenerateResult): AdsCopy {
  return {
    title: typeof result.title === "string" ? result.title : "",
    description: typeof result.description === "string" ? result.description : "",
    topics: Array.isArray(result.topics)
      ? result.topics.filter((topic): topic is string => typeof topic === "string")
      : [],
  };
}

/**
 * What is wrong with the copy, named by the service's own field names.
 *
 * Blocking problems only. `notes` from `generate` — "description is short",
 * "three exclamation marks" — are advice and are rendered separately; treating
 * them as errors would stop a perfectly runnable advert over a matter of taste.
 */
export function copyProblems(copy: AdsCopy): AdsFieldProblem[] {
  const problems: AdsFieldProblem[] = [];
  const title = copy.title.trim();
  const description = copy.description.trim();

  if (title === "") {
    problems.push({ field: "headline", message: "write a headline" });
  } else if (title.length > TITLE_MAX) {
    problems.push({
      field: "headline",
      message: `${title.length} characters — the limit is ${TITLE_MAX}`,
    });
  }

  if (description === "") {
    problems.push({ field: "description", message: "write a description" });
  } else if (description.length > DESCRIPTION_MAX) {
    problems.push({
      field: "description",
      message: `${description.length} characters — the limit is ${DESCRIPTION_MAX}`,
    });
  }

  if (copy.topics.filter((topic) => topic.trim() !== "").length === 0) {
    problems.push({
      field: "context_hints",
      message: "add at least one topic — topics are the only targeting this platform offers",
    });
  }

  return problems;
}

/** Read the edited copy back off the form. Topics arrive as repeated inputs. */
export function readCopyForm(form: FormData): AdsCopy {
  const str = (value: FormDataEntryValue | null) =>
    typeof value === "string" ? value.trim() : "";

  return {
    title: str(form.get("headline")),
    description: str(form.get("description")),
    topics: form
      .getAll("topics")
      .map((value) => str(value))
      .filter((topic) => topic !== "")
      // De-duplicated: the same topic twice is not twice the targeting, and the
      // chip list would show it twice too.
      .filter((topic, index, all) => all.indexOf(topic) === index)
      .slice(0, TOPICS_MAX),
  };
}
